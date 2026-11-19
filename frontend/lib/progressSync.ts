/** Pure helpers for the progress load/save flow (testable without React or Supabase). */

export interface SyncableProgress {
  completedCourses: Iterable<string>;
  inProgressCourses: Iterable<string>;
  plannedCourses: Iterable<string>;
  hasWritingIntensive: boolean;
  bucketFulfillments?: unknown;
}

/** Key identifying WHICH progress row the in-memory state belongs to. */
export function progressKey(userId: string | null | undefined, curriculumId: string): string {
  return `${userId ?? 'anon'}::${curriculumId}`;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

/** Canonical serialization used to skip upserts when nothing changed. */
export function serializeProgress(p: SyncableProgress): string {
  return JSON.stringify({
    c: [...p.completedCourses].sort(),
    i: [...p.inProgressCourses].sort(),
    p: [...p.plannedCourses].sort(),
    w: Boolean(p.hasWritingIntensive),
    b: stable(p.bucketFulfillments ?? {}),
  });
}

export function hasMeaningfulProgress(p: {
  completedCourses?: readonly string[] | null;
  inProgressCourses?: readonly string[] | null;
  plannedCourses?: readonly string[] | null;
}): boolean {
  return Boolean(p.completedCourses?.length || p.inProgressCourses?.length || p.plannedCourses?.length);
}

export const DEFAULT_RETRY_DELAYS_MS = [500, 1500, 3500];

/** Runs `fn`, retrying after each delay; rethrows the last error. `isCancelled` stops early. */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  delaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
  options: { sleep?: (ms: number) => Promise<void>; isCancelled?: () => boolean } = {},
): Promise<T> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === delaysMs.length || options.isCancelled?.()) break;
      await sleep(delaysMs[attempt]);
      if (options.isCancelled?.()) break;
    }
  }
  throw lastError;
}

/** Escapes LIKE/ILIKE wildcards so an email can be matched case-insensitively and literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Cross-malla "completed" overlay store, namespaced per account (anon keeps the legacy key). */
export function globalCompletedKey(userId: string | null | undefined): string {
  return userId ? `globalCompletedCourses:${userId}` : 'globalCompletedCourses';
}

/** localStorage keys that belong to a signed-in account and must not outlive its session. */
export function isAccountScopedLocalKey(key: string): boolean {
  return key.startsWith('globalCompletedCourses:');
}

/** Progress saved in this browser while anonymous (mockBackendClient), if it has any content. */
export function readLocalAnonProgress(
  curriculumId: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): { completedCourses: string[]; inProgressCourses: string[]; plannedCourses: string[]; hasWritingIntensive: boolean } | null {
  try {
    const raw = storage.getItem(`progress_${curriculumId}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
    const progress = {
      completedCourses: arr(data.completedCourses),
      inProgressCourses: arr(data.inProgressCourses),
      plannedCourses: arr(data.plannedCourses),
      hasWritingIntensive: data.hasWritingIntensive === true,
    };
    return hasMeaningfulProgress(progress) ? progress : null;
  } catch {
    return null;
  }
}

/** Serialización estable del conjunto planeado (para saber si el usuario lo editó). */
export function serializePlanned(planned: Iterable<string>): string {
  return [...planned].sort().join('|');
}

/**
 * Sello «para qué período se planeó»: solo se actualiza al período objetivo cuando el usuario EDITA
 * lo planeado; si no lo tocó (p. ej. marcó una materia completada) se conserva el sello cargado.
 */
export function resolvePlannedPeriodCode(
  planned: ReadonlySet<string> | readonly string[],
  loaded: { serialized: string; periodCode: string | null },
  targetPeriodCode: string | null,
): string | null {
  const list = [...planned];
  if (list.length === 0) return null;
  if (serializePlanned(list) !== loaded.serialized) return targetPeriodCode ?? loaded.periodCode;
  return loaded.periodCode;
}
