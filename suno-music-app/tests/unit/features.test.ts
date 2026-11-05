// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '../../shared/types.ts';
import { nextEntry, type QueueEntry } from '../../src/hooks/usePlayer.ts';
import { FAVORITES_KEY, loadFavorites, saveFavorites } from '../../src/lib/favorites.ts';
import type { HistoryItem } from '../../src/lib/history.ts';
import { selectLibrary } from '../../src/lib/library.ts';
import { DEFAULT_PREFS, PREFS_KEY, hasPref, loadPrefs, resolveTheme, savePrefs } from '../../src/lib/prefs.ts';
import { SURPRISE_IDEA_COUNT, surpriseIdea } from '../../src/lib/surprise.ts';

// Minimal localStorage for the node environment.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

beforeEach(() => store.clear());

const track = (id: string, title: string): Track => ({ id, title, tags: '', lyrics: '', duration: 8, audioUrl: `https://a/${id}.mp3`, streamUrl: '', imageUrl: '', modelName: '', createTime: '' });
const item = (taskId: string, createdAt: number, titles: string[], prompt = 'p'): HistoryItem => ({
  taskId, createdAt, updatedAt: createdAt, request: { mode: 'simple', model: 'V6', instrumental: false, prompt, style: 'Pop' },
  phase: 'complete', rawStatus: 'SUCCESS', errorMessage: null, tracks: titles.map((t, i) => track(`${taskId}-${i}`, t)),
});

describe('preferences', () => {
  it('defaults safely and ignores corrupt data', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    store.set(PREFS_KEY, '{not json');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    store.set(PREFS_KEY, JSON.stringify({ theme: 'neon', repeat: 'sometimes', genres: [1, 'Pop'] }));
    expect(loadPrefs()).toMatchObject({ theme: 'auto', repeat: 'off', genres: ['Pop'] });
  });

  it('merges partial updates and never touches song history', () => {
    store.set('ams.history.v1', '[{"taskId":"keep"}]');
    savePrefs({ theme: 'light' });
    savePrefs({ genres: ['Jazz'], instrumental: true });
    expect(loadPrefs()).toMatchObject({ theme: 'light', genres: ['Jazz'], instrumental: true });
    expect(hasPref('theme')).toBe(true);
    expect(hasPref('shuffle')).toBe(false);
    expect(store.get('ams.history.v1')).toBe('[{"taskId":"keep"}]');
  });

  it('resolves Auto from the system setting', () => {
    expect(resolveTheme('auto', true)).toBe('light');
    expect(resolveTheme('auto', false)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });
});

describe('favorites', () => {
  it('round-trips through localStorage', () => {
    saveFavorites(new Set(['a', 'b']));
    expect(JSON.parse(store.get(FAVORITES_KEY)!)).toEqual(['a', 'b']);
    expect([...loadFavorites()]).toEqual(['a', 'b']);
    store.set(FAVORITES_KEY, 'garbage');
    expect(loadFavorites().size).toBe(0);
  });
});

describe('selectLibrary', () => {
  const items = [item('t2', 2000, ['Velvet Midnight', 'Aurora Drive']), item('t1', 1000, ['Neon Horizon', 'Glass Cathedral']), item('t3', 3000, ['Afterglow', 'Silver Lining'], 'a jazz idea')];
  const view = { query: '', sort: 'newest' as const, favoritesOnly: false };

  it('sorts newest, oldest and by title', () => {
    expect(selectLibrary(items, view, new Set()).map((v) => v.item.taskId)).toEqual(['t3', 't2', 't1']);
    expect(selectLibrary(items, { ...view, sort: 'oldest' }, new Set()).map((v) => v.item.taskId)).toEqual(['t1', 't2', 't3']);
    expect(selectLibrary(items, { ...view, sort: 'title' }, new Set()).map((v) => v.tracks[0].title)).toEqual(['Afterglow', 'Neon Horizon', 'Velvet Midnight']);
  });

  it('searches song titles (case-insensitive) and narrows to matching tracks', () => {
    const r = selectLibrary(items, { ...view, query: 'aurora' }, new Set());
    expect(r).toHaveLength(1);
    expect(r[0].tracks.map((t) => t.title)).toEqual(['Aurora Drive']);
    expect(selectLibrary(items, { ...view, query: 'zzz' }, new Set())).toHaveLength(0);
    // Matching the request description keeps all its tracks (useful for in-progress songs).
    expect(selectLibrary(items, { ...view, query: 'jazz idea' }, new Set())[0].tracks).toHaveLength(2);
  });

  it('filters to favorites only', () => {
    const r = selectLibrary(items, { ...view, favoritesOnly: true }, new Set(['t1-1']));
    expect(r).toHaveLength(1);
    expect(r[0].tracks.map((t) => t.title)).toEqual(['Glass Cathedral']);
  });

  it('never mutates the input history', () => {
    const before = JSON.stringify(items);
    selectLibrary(items, { query: 'a', sort: 'title', favoritesOnly: true }, new Set(['t2-0']));
    expect(JSON.stringify(items)).toBe(before);
  });
});

describe('player queue (shuffle / repeat)', () => {
  const q: QueueEntry[] = ['a', 'b', 'c'].map((id) => ({ taskId: 't', track: track(id, id) }));
  const ids = (e: QueueEntry | null) => e?.track.id ?? null;

  it('plays in order and wraps when the user presses Next', () => {
    expect(ids(nextEntry(q, 'a', { shuffle: false, repeat: 'off', ended: false }))).toBe('b');
    expect(ids(nextEntry(q, 'c', { shuffle: false, repeat: 'off', ended: false }))).toBe('a');
  });

  it('stops at the end with repeat off, wraps with repeat all', () => {
    expect(nextEntry(q, 'c', { shuffle: false, repeat: 'off', ended: true })).toBeNull();
    expect(ids(nextEntry(q, 'c', { shuffle: false, repeat: 'all', ended: true }))).toBe('a');
  });

  it('repeats the same track with repeat one (only when it ends)', () => {
    expect(ids(nextEntry(q, 'b', { shuffle: false, repeat: 'one', ended: true }))).toBe('b');
    expect(ids(nextEntry(q, 'b', { shuffle: false, repeat: 'one', ended: false }))).toBe('c');
  });

  it('shuffle never repeats the current track and covers the queue', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const n = ids(nextEntry(q, 'a', { shuffle: true, repeat: 'off', ended: true }))!;
      expect(n).not.toBe('a');
      seen.add(n);
    }
    expect([...seen].sort()).toEqual(['b', 'c']);
  });
});

describe('Surprise Me', () => {
  it('builds varied, complete prompts within API limits', () => {
    let seed = 0;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const prompts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const idea = surpriseIdea(rand);
      expect(idea.prompt.length).toBeGreaterThan(40);
      expect(idea.prompt.length).toBeLessThanOrEqual(3000);
      expect(idea.sound.length).toBeLessThanOrEqual(1000);
      expect(idea.genre).toBeTruthy();
      prompts.add(idea.prompt);
    }
    expect(prompts.size).toBeGreaterThan(20);
    expect(SURPRISE_IDEA_COUNT).toBeGreaterThanOrEqual(15);
  });

  it('avoids repeating the previous idea', () => {
    const fixed = () => 0;
    const first = surpriseIdea(fixed);
    let calls = 0;
    const second = surpriseIdea(() => (calls++ < 3 ? 0 : 0.5), first.prompt);
    expect(second.prompt).not.toBe(first.prompt);
  });
});
