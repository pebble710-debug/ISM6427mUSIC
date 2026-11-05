import type { GenerateRequest, TaskPhase, Track } from '../../shared/types.ts';

export interface HistoryItem {
  taskId: string;
  createdAt: number;
  updatedAt: number;
  request: GenerateRequest;
  phase: TaskPhase;
  rawStatus: string;
  errorMessage: string | null;
  tracks: Track[];
  /** Client-side flag: polling gave up (timeout or repeated errors). */
  stalled?: boolean;
}

const KEY = 'ams.history.v1';
const MAX_ITEMS = 100;
/** SunoAPI keeps generated files for 14 days. */
export const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.taskId === 'string' && Array.isArray(x.tracks)).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* quota or privacy mode — history just won't persist */
  }
}

export function isExpired(item: HistoryItem, now = Date.now()): boolean {
  return now - item.createdAt > RETENTION_MS;
}

export function isActive(item: HistoryItem): boolean {
  return (item.phase === 'pending' || item.phase === 'text' || item.phase === 'first') && !item.stalled;
}
