import type { EdgeType } from './periodCalendar';

export interface TransitionRateEntry {
  from_id: string;
  to_id: string;
  edge_type: EdgeType | string;
  p: number;
  prior: number;
  n_pairs: number;
  source_students: number;
  target_students: number;
  curriculum_id?: string;
}

export interface TransitionRatesPayload {
  generated_at: string;
  version: number;
  by_edge: Record<string, TransitionRateEntry>;
  by_type: Record<string, TransitionRateEntry>;
  summer_rates: Record<string, number>;
}

export class TransitionRateTable {
  private byEdge = new Map<string, TransitionRateEntry>();
  private byType = new Map<string, TransitionRateEntry>();
  summerRates: Record<string, number> = {};
  generatedAt = '';
  version = 1;

  static fromPayload(data: TransitionRatesPayload): TransitionRateTable {
    const table = new TransitionRateTable();
    table.generatedAt = data.generated_at ?? '';
    table.version = data.version ?? 1;
    table.summerRates = data.summer_rates ?? {};
    for (const entry of Object.values(data.by_edge ?? {})) {
      table.byEdge.set(`${entry.from_id}->${entry.to_id}`, entry);
    }
    for (const [k, entry] of Object.entries(data.by_type ?? {})) {
      table.byType.set(k, entry);
    }
    return table;
  }

  lookup(fromId: string, toId: string, edgeType?: string): number | null {
    const edge = this.byEdge.get(`${fromId}->${toId}`);
    if (edge && edge.n_pairs >= 1) return edge.p;
    if (edgeType) {
      const typeEntry = this.byType.get(edgeType);
      if (typeEntry && typeEntry.n_pairs >= 1) return typeEntry.p;
    }
    return null;
  }

  lookupEdge(fromId: string, toId: string): TransitionRateEntry | undefined {
    return this.byEdge.get(`${fromId}->${toId}`);
  }

  /** Prerequisite edges feeding into a course (for detail modal). */
  incomingEdges(toId: string): TransitionRateEntry[] {
    const result: TransitionRateEntry[] = [];
    for (const entry of this.byEdge.values()) {
      if (entry.to_id === toId) result.push(entry);
    }
    return result.sort((a, b) => b.p - a.p);
  }
}

let cached: TransitionRateTable | null = null;

export function clearTransitionRatesCache(): void {
  cached = null;
}

export async function loadTransitionRates(): Promise<TransitionRateTable | null> {
  if (cached) return cached;
  try {
    const base = import.meta.env.BASE_URL || '/';
    const res = await fetch(`${base}data/transition_rates.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as TransitionRatesPayload;
    cached = TransitionRateTable.fromPayload(data);
    return cached;
  } catch {
    return null;
  }
}

export function classifyEdgeType(
  graph: { nodes: Map<string, { area?: string; semester?: number }>; successors: Map<string, string[]> },
  fromId: string,
  toId: string,
  isDirectPrerequisite: (from: string, to: string) => boolean,
  isPrimarySuccessor: (from: string, to: string) => boolean,
): string {
  if (isPrimarySuccessor(fromId, toId)) return 'sequential';
  if (isDirectPrerequisite(fromId, toId)) {
    const from = graph.nodes.get(fromId);
    const to = graph.nodes.get(toId);
    if (from?.area !== to?.area) return 'cross_area_direct';
    return 'same_area';
  }
  const from = graph.nodes.get(fromId);
  const to = graph.nodes.get(toId);
  if (from?.area === to?.area) return 'same_area';
  return 'other';
}
