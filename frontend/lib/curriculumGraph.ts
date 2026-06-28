import type { Course } from '../types/curriculum';
import type { CourseHistoryStats } from './offerHistory';
import { normalizeOfferCourseCode } from './offerMatching';

/** Probability that students continue to the next course in the same area/semester chain. */
export const P_SEQUENTIAL = 0.8;
/** Same faculty area but not the direct next-semester successor. */
export const P_SAME_AREA = 0.5;
/** Cross-area unlock (e.g. MAT unlocks CMP). */
export const P_OTHER = 0.25;

export interface CurriculumGraph {
  nodes: Map<string, Course>;
  successors: Map<string, string[]>;
}

export interface PropagationResult {
  /** Total inflow from other courses (excludes own seeds). */
  totalInflow: Map<string, number>;
  inflowFromHistory: Map<string, number>;
  /** Students currently taking prerequisites → likely take this course next semester. */
  inflowFromCursando: Map<string, number>;
}

function parsePrereqGroup(expr: string): string[] {
  return expr.split('||').map((p) => p.trim()).filter(Boolean);
}

export function buildCurriculumGraph(courses: Course[]): CurriculumGraph {
  const ids = new Set(courses.map((c) => c.id));
  const nodes = new Map(courses.map((c) => [c.id, c]));
  const successors = new Map<string, string[]>();

  for (const course of courses) {
    if (!successors.has(course.id)) successors.set(course.id, []);
    for (const expr of course.prerequisites ?? []) {
      for (const prereq of parsePrereqGroup(expr)) {
        if (!ids.has(prereq)) continue;
        const list = successors.get(prereq) ?? [];
        list.push(course.id);
        successors.set(prereq, list);
      }
    }
  }

  return { nodes, successors };
}

function isDirectPrerequisite(graph: CurriculumGraph, fromId: string, toId: string): boolean {
  const to = graph.nodes.get(toId);
  if (!to) return false;
  for (const expr of to.prerequisites ?? []) {
    if (parsePrereqGroup(expr).includes(fromId)) return true;
  }
  return false;
}

function isPrimarySuccessor(graph: CurriculumGraph, fromId: string, toId: string): boolean {
  const from = graph.nodes.get(fromId);
  const to = graph.nodes.get(toId);
  if (!from || !to) return false;
  if (from.area !== to.area) return false;
  if (to.semester !== from.semester + 1) return false;

  const sameAreaNext = (graph.successors.get(fromId) ?? []).filter((id) => {
    const n = graph.nodes.get(id);
    return n && n.area === from.area && n.semester === from.semester + 1;
  });
  if (sameAreaNext.length === 1) return sameAreaNext[0] === toId;
  return sameAreaNext.includes(toId);
}

export function transitionProbability(graph: CurriculumGraph, fromId: string, toId: string): number {
  const from = graph.nodes.get(fromId);
  const to = graph.nodes.get(toId);
  if (!from || !to) return P_OTHER;
  if (isPrimarySuccessor(graph, fromId, toId)) return P_SEQUENTIAL;
  // Direct prerequisite edges keep cohort even across areas (MAT/IEE → MAC).
  if (isDirectPrerequisite(graph, fromId, toId)) return P_SAME_AREA;
  if (from.area === to.area) return P_SAME_AREA;
  return P_OTHER;
}

/** Offer codes needed to seed DAG propagation (full malla, not only faculty prefix). */
export function collectDagHistoryOfferCodes(courses: Course[]): string[] {
  return [...new Set(courses.map((c) => normalizeOfferCourseCode(c.id)))];
}

/**
 * Forward-propagate cohort size along the DAG.
 * First hop uses OR (||) groups in prerequisites so alternate prereqs are not summed.
 */
function propagateInflow(
  graph: CurriculumGraph,
  seedsByCourseId: Map<string, number>,
  maxHops = 5,
): Map<string, number> {
  const inflow = new Map<string, number>();
  const queue: { id: string; students: number; depth: number }[] = [];

  for (const [, course] of graph.nodes) {
    const prereqExprs = course.prerequisites ?? [];
    if (prereqExprs.length === 0) continue;

    let directTotal = 0;
    for (const expr of prereqExprs) {
      const group = parsePrereqGroup(expr);
      let groupMax = 0;
      for (const prereqId of group) {
        const seed = seedsByCourseId.get(prereqId) ?? 0;
        if (seed <= 0) continue;
        groupMax = Math.max(
          groupMax,
          seed * transitionProbability(graph, prereqId, course.id),
        );
      }
      directTotal += groupMax;
    }

    if (directTotal < 0.25) continue;
    inflow.set(course.id, (inflow.get(course.id) ?? 0) + directTotal);
    queue.push({ id: course.id, students: directTotal, depth: 1 });
  }

  while (queue.length > 0) {
    const { id, students, depth } = queue.shift()!;
    if (depth >= maxHops) continue;

    for (const succId of graph.successors.get(id) ?? []) {
      const transferred = students * transitionProbability(graph, id, succId);
      if (transferred < 0.25) continue;
      inflow.set(succId, (inflow.get(succId) ?? 0) + transferred);
      queue.push({ id: succId, students: transferred, depth: depth + 1 });
    }
  }

  return inflow;
}

/** Seeds from last regular semester cupo — proxy for “who passed this course last term”. */
export function buildHistoricalSeeds(
  courses: Course[],
  historyByOfferCode: Map<string, CourseHistoryStats>,
): Map<string, number> {
  const seeds = new Map<string, number>();
  for (const course of courses) {
    const offerCode = normalizeOfferCourseCode(course.id);
    const hist = historyByOfferCode.get(offerCode);
    if (hist && hist.lastRegularStudents > 0) {
      seeds.set(course.id, hist.lastRegularStudents);
    }
  }
  return seeds;
}

export function propagateDemandFromSources(
  graph: CurriculumGraph,
  historySeeds: Map<string, number>,
  cursandoSeeds: Map<string, number>,
  maxHops = 5,
): PropagationResult {
  const inflowFromHistory = propagateInflow(graph, historySeeds, maxHops);
  const inflowFromCursando = propagateInflow(graph, cursandoSeeds, maxHops);

  const totalInflow = new Map<string, number>();
  const allIds = new Set([
    ...inflowFromHistory.keys(),
    ...inflowFromCursando.keys(),
  ]);
  for (const id of allIds) {
    totalInflow.set(
      id,
      (inflowFromHistory.get(id) ?? 0) + (inflowFromCursando.get(id) ?? 0),
    );
  }

  return { totalInflow, inflowFromHistory, inflowFromCursando };
}

/** @deprecated Use propagateDemandFromSources */
export function propagateDemand(
  graph: CurriculumGraph,
  seedsByCourseId: Map<string, number>,
  maxHops = 5,
): Map<string, number> {
  return propagateInflow(graph, seedsByCourseId, maxHops);
}
