import { describe, expect, it } from 'vitest';
import { buildRequest, validateDraft } from '../../src/components/Composer.tsx';
import { mergeStatus, pollInterval } from '../../src/hooks/useLibrary.ts';
import { formatTime, relativeTime } from '../../src/lib/format.ts';
import { isActive, isExpired, type HistoryItem } from '../../src/lib/history.ts';

const draft = {
  mode: 'simple' as const, prompt: 'A song', genres: ['Pop', 'Synthwave'], styleExtra: 'dreamy', instrumental: false,
  title: '', lyrics: '', negativeTags: '', vocalGender: 'any' as const, duration: 120, model: 'V6' as const,
};

describe('Composer request building', () => {
  it('builds a simple-mode request with combined style', () => {
    expect(buildRequest(draft)).toEqual({ mode: 'simple', model: 'V6', instrumental: false, prompt: 'A song', style: 'Pop, Synthwave, dreamy' });
  });

  it('builds a custom-mode request and omits empty/irrelevant fields', () => {
    const r = buildRequest({ ...draft, mode: 'custom', title: 'T', lyrics: '[Verse] hi', vocalGender: 'f' });
    expect(r).toEqual({ mode: 'custom', model: 'V6', instrumental: false, style: 'Pop, Synthwave, dreamy', duration: 120, title: 'T', lyrics: '[Verse] hi', vocalGender: 'f' });
    const inst = buildRequest({ ...draft, mode: 'custom', instrumental: true, lyrics: 'ignored', vocalGender: 'm' });
    expect(inst.lyrics).toBeUndefined();
    expect(inst.vocalGender).toBeUndefined();
  });

  it('validates like the server', () => {
    expect(validateDraft({ ...draft, prompt: '' }).prompt).toBeTruthy();
    expect(validateDraft({ ...draft, genres: [], styleExtra: '' }).style).toBeTruthy();
    expect(validateDraft({ ...draft, mode: 'custom' }).lyrics).toBeTruthy();
    expect(validateDraft({ ...draft, mode: 'custom', instrumental: true })).toEqual({});
    expect(validateDraft(draft)).toEqual({});
  });
});

describe('library helpers', () => {
  const item: HistoryItem = {
    taskId: 't', createdAt: Date.now(), updatedAt: 0, request: { mode: 'simple', model: 'V6', instrumental: false },
    phase: 'first', rawStatus: 'FIRST_SUCCESS', errorMessage: null,
    tracks: [{ id: 'a', title: 'x', tags: '', lyrics: '', duration: 1, audioUrl: '', streamUrl: 's', imageUrl: '', modelName: '', createTime: '' }],
  };

  it('backs off polling as tasks age', () => {
    expect(pollInterval(10_000)).toBe(4_000);
    expect(pollInterval(3 * 60_000)).toBe(8_000);
    expect(pollInterval(10 * 60_000)).toBe(15_000);
  });

  it('merges statuses but keeps earlier tracks if a response is empty', () => {
    const m = mergeStatus(item, { taskId: 't', phase: 'complete', rawStatus: 'SUCCESS', errorMessage: null, tracks: [] });
    expect(m.phase).toBe('complete');
    expect(m.tracks).toHaveLength(1);
  });

  it('knows active and expired items', () => {
    expect(isActive(item)).toBe(true);
    expect(isActive({ ...item, stalled: true })).toBe(false);
    expect(isActive({ ...item, phase: 'complete' })).toBe(false);
    expect(isExpired({ ...item, createdAt: Date.now() - 15 * 86_400_000 })).toBe(true);
  });

  it('formats times', () => {
    expect(formatTime(198.44)).toBe('3:18');
    expect(formatTime(null)).toBe('--:--');
    expect(relativeTime(Date.now() - 5 * 60_000)).toBe('5 min ago');
  });
});
