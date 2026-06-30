export const PROGRESS_CHANGED_EVENT = 'malla-progress-changed';

export interface ProgressChangedDetail {
  curriculumId?: string;
}

export function emitProgressChanged(detail?: ProgressChangedDetail): void {
  window.dispatchEvent(
    new CustomEvent<ProgressChangedDetail>(PROGRESS_CHANGED_EVENT, { detail }),
  );
}
