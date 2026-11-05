import { describe, expect, it } from 'vitest';
import { ValidationError, safeFilename, validateGenerateRequest, validateTaskId } from '../../netlify/lib/validation.ts';

const CB = 'https://site.example/api/suno-callback?token=x';

function fields(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidationError) return e.fields;
    throw e;
  }
  throw new Error('expected ValidationError');
}

describe('validateGenerateRequest — simple mode', () => {
  it('maps to a non-custom SunoAPI payload', () => {
    const p = validateGenerateRequest({ mode: 'simple', model: 'V6', instrumental: false, prompt: '  A chill lo-fi beat  ', style: 'lo-fi, chill' }, CB);
    expect(p).toEqual({ customMode: false, instrumental: false, model: 'V6', callBackUrl: CB, prompt: 'A chill lo-fi beat', style: 'lo-fi, chill' });
  });

  it('requires a description and a style', () => {
    const f = fields(() => validateGenerateRequest({ mode: 'simple', model: 'V6', instrumental: true }, CB));
    expect(f.prompt).toBeTruthy();
    expect(f.style).toBeTruthy();
  });

  it('enforces the 3000-character prompt limit', () => {
    const f = fields(() => validateGenerateRequest({ mode: 'simple', model: 'V6', instrumental: false, prompt: 'a'.repeat(3001), style: 'Pop' }, CB));
    expect(f.prompt).toMatch(/3000/);
  });

  it('rejects custom-only fields', () => {
    const f = fields(() => validateGenerateRequest({ mode: 'simple', model: 'V6', instrumental: false, prompt: 'x', style: 'Pop', title: 'T' }, CB));
    expect(f.title).toMatch(/Custom mode/);
    const g = fields(() => validateGenerateRequest({ mode: 'simple', model: 'V6', instrumental: false, prompt: 'x', style: 'Pop', duration: 60 }, CB));
    expect(g.mode).toBeTruthy();
  });

  it('strips control characters', () => {
    const p = validateGenerateRequest({ mode: 'simple', model: 'V6', instrumental: false, prompt: 'he\u0000llo\u0007', style: 'Pop' }, CB);
    expect(p.prompt).toBe('hello');
  });
});

describe('validateGenerateRequest — custom mode', () => {
  const base = { mode: 'custom', model: 'V6', instrumental: false, style: 'Classical', lyrics: '[Verse] Night city lights' };

  it('maps all supported custom fields', () => {
    const p = validateGenerateRequest({ ...base, title: 'Peaceful Piano', negativeTags: 'Heavy Metal', vocalGender: 'f', duration: 120 }, CB);
    expect(p).toEqual({
      customMode: true, instrumental: false, model: 'V6', callBackUrl: CB,
      title: 'Peaceful Piano', style: 'Classical', lyrics: '[Verse] Night city lights', negativeTags: 'Heavy Metal', vocalGender: 'f', duration: 120,
    });
    expect(p.prompt).toBeUndefined();
  });

  it('requires lyrics for vocal tracks', () => {
    expect(fields(() => validateGenerateRequest({ ...base, lyrics: '' }, CB)).lyrics).toBeTruthy();
  });

  it('allows instrumental without lyrics and drops lyrics if given', () => {
    const p = validateGenerateRequest({ ...base, instrumental: true }, CB);
    expect(p.lyrics).toBeUndefined();
    expect(p.instrumental).toBe(true);
  });

  it('requires style, lyrics or negativeTags', () => {
    const f = fields(() => validateGenerateRequest({ mode: 'custom', model: 'V6', instrumental: true }, CB));
    expect(f.style).toBeTruthy();
  });

  it('enforces documented limits', () => {
    expect(fields(() => validateGenerateRequest({ ...base, title: 't'.repeat(81) }, CB)).title).toMatch(/80/);
    expect(fields(() => validateGenerateRequest({ ...base, style: 's'.repeat(1001) }, CB)).style).toMatch(/1000/);
    expect(fields(() => validateGenerateRequest({ ...base, lyrics: 'l'.repeat(5001) }, CB)).lyrics).toMatch(/5000/);
    expect(fields(() => validateGenerateRequest({ ...base, duration: 5 }, CB)).duration).toBeTruthy();
    expect(fields(() => validateGenerateRequest({ ...base, duration: 361 }, CB)).duration).toBeTruthy();
    expect(fields(() => validateGenerateRequest({ ...base, duration: 12.5 }, CB)).duration).toBeTruthy();
    expect(fields(() => validateGenerateRequest({ ...base, vocalGender: 'x' }, CB)).vocalGender).toBeTruthy();
  });

  it('rejects vocal gender on instrumentals', () => {
    expect(fields(() => validateGenerateRequest({ ...base, instrumental: true, vocalGender: 'm' }, CB)).vocalGender).toBeTruthy();
  });
});

describe('general validation', () => {
  it('rejects bad shapes, models and types', () => {
    expect(fields(() => validateGenerateRequest(null, CB)).body).toBeTruthy();
    expect(fields(() => validateGenerateRequest([], CB)).body).toBeTruthy();
    expect(fields(() => validateGenerateRequest({ mode: 'simple', model: 'V4', instrumental: false }, CB)).model).toBeTruthy();
    expect(fields(() => validateGenerateRequest({ mode: 'x', model: 'V6', instrumental: 'yes' }, CB)).instrumental).toBeTruthy();
    expect(fields(() => validateGenerateRequest({ mode: 'simple', model: 'V6', instrumental: false, prompt: 42 }, CB)).prompt).toBeTruthy();
  });

  it('defaults the model to V6', () => {
    expect(validateGenerateRequest({ mode: 'simple', instrumental: false, prompt: 'x', style: 'Pop' }, CB).model).toBe('V6');
  });

  it('validates task IDs', () => {
    expect(validateTaskId('5c79abcdbe8e')).toBe('5c79abcdbe8e');
    expect(() => validateTaskId(null)).toThrow(ValidationError);
    expect(() => validateTaskId('../../etc')).toThrow(ValidationError);
    expect(() => validateTaskId('a&b=c')).toThrow(ValidationError);
  });

  it('builds safe filenames', () => {
    expect(safeFilename('Iron Man', 'mp3')).toBe('Iron Man.mp3');
    expect(safeFilename('../../x"<>|', 'mp3')).toBe('....x.mp3');
    expect(safeFilename('', 'mp3')).toBe('ai-music-studio-track.mp3');
  });
});
