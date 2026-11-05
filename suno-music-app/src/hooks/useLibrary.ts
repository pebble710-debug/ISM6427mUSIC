import { useCallback, useEffect, useRef, useState } from 'react';
import type { GenerateRequest, TaskStatusResponse } from '../../shared/types.ts';
import { ApiError, api } from '../lib/api.ts';
import { isActive, loadHistory, saveHistory, type HistoryItem } from '../lib/history.ts';

/** Give up polling after this long; the user can resume manually. */
export const POLL_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_CONSECUTIVE_ERRORS = 6;

export function pollInterval(ageMs: number): number {
  if (ageMs < 2 * 60_000) return 4_000;
  if (ageMs < 6 * 60_000) return 8_000;
  return 15_000;
}

export function mergeStatus(item: HistoryItem, s: TaskStatusResponse): HistoryItem {
  return {
    ...item,
    phase: s.phase,
    rawStatus: s.rawStatus,
    errorMessage: s.errorMessage,
    // Keep earlier track data if a later response is momentarily empty.
    tracks: s.tracks.length ? s.tracks : item.tracks,
    updatedAt: Date.now(),
    stalled: false,
  };
}

export function useLibrary(enabled: boolean) {
  const [items, setItems] = useState<HistoryItem[]>(loadHistory);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const lastPoll = useRef(new Map<string, number>());
  const errors = useRef(new Map<string, number>());
  /** Start of the current watch window per task (reset when the user resumes). */
  const watchFrom = useRef(new Map<string, number>());

  useEffect(() => saveHistory(items), [items]);

  const update = useCallback((taskId: string, fn: (i: HistoryItem) => HistoryItem) => {
    setItems((prev) => prev.map((i) => (i.taskId === taskId ? fn(i) : i)));
  }, []);

  const addTask = useCallback((taskId: string, request: GenerateRequest) => {
    const now = Date.now();
    setItems((prev) => [
      { taskId, createdAt: now, updatedAt: now, request, phase: 'pending', rawStatus: 'PENDING', errorMessage: null, tracks: [] },
      ...prev.filter((i) => i.taskId !== taskId),
    ]);
  }, []);

  const remove = useCallback((taskId: string) => setItems((prev) => prev.filter((i) => i.taskId !== taskId)), []);
  const clear = useCallback(() => setItems([]), []);

  const refresh = useCallback(async (taskId: string) => {
    lastPoll.current.set(taskId, Date.now());
    try {
      const s = await api.status(taskId);
      errors.current.set(taskId, 0);
      update(taskId, (i) => mergeStatus(i, s));
    } catch (err) {
      const n = (errors.current.get(taskId) || 0) + 1;
      errors.current.set(taskId, n);
      const fatal = err instanceof ApiError && [400, 401, 403, 404].includes(err.status);
      if (fatal || n >= MAX_CONSECUTIVE_ERRORS) {
        update(taskId, (i) => ({
          ...i,
          stalled: true,
          errorMessage: err instanceof Error ? err.message : 'Could not check the generation status.',
        }));
      }
    }
  }, [update]);

  /** Resume polling a stalled task (e.g. after a timeout). */
  const resume = useCallback((taskId: string) => {
    errors.current.set(taskId, 0);
    watchFrom.current.set(taskId, Date.now());
    update(taskId, (i) => ({ ...i, stalled: false, errorMessage: null }));
    void refresh(taskId);
  }, [refresh, update]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const now = Date.now();
      for (const item of itemsRef.current.filter(isActive)) {
        const age = now - item.createdAt;
        const watched = now - (watchFrom.current.get(item.taskId) ?? item.createdAt);
        // Always check at least once (e.g. when the app is reopened) before timing out.
        if (watched > POLL_TIMEOUT_MS && lastPoll.current.has(item.taskId)) {
          update(item.taskId, (i) => ({ ...i, stalled: true, errorMessage: 'This is taking longer than expected.' }));
          continue;
        }
        const last = lastPoll.current.get(item.taskId) || 0;
        if (now - last < pollInterval(age)) continue;
        await refresh(item.taskId);
        if (cancelled) return;
      }
      if (!cancelled) timer = setTimeout(tick, 1000);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, refresh, update]);

  return { items, addTask, remove, clear, refresh, resume };
}
