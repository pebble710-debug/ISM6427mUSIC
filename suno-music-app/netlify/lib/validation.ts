import { LIMITS, MODELS, type GenerateRequest, type SunoModel } from '../../shared/types.ts';

/** Body sent to POST https://api.sunoapi.org/api/v1/generate (see docs: Generate Music). */
export interface SunoGeneratePayload {
  customMode: boolean;
  instrumental: boolean;
  model: SunoModel;
  callBackUrl: string;
  prompt?: string;
  style?: string;
  title?: string;
  lyrics?: string;
  negativeTags?: string;
  vocalGender?: 'm' | 'f';
  duration?: number;
}

export class ValidationError extends Error {
  readonly fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? 'Invalid request');
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

// Strip ASCII control characters except tab / newline / carriage return.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return '\u0000invalid';
  const cleaned = value.replace(CONTROL_CHARS, '').replace(/\r\n/g, '\n').trim();
  return cleaned.length ? cleaned : undefined;
}

/**
 * Validates an untrusted request body from the browser and converts it into the
 * exact SunoAPI.org payload, following the documented rules:
 *  - customMode / instrumental / model are always required.
 *  - Non-custom mode: prompt ≤ 3000 chars; at least one of style / lyrics must be present;
 *    custom-only fields (title, negativeTags, duration, vocalGender…) must NOT be sent.
 *  - Custom mode: at least one of style / lyrics / negativeTags; title ≤ 80 chars;
 *    style ≤ 1000, lyrics ≤ 5000, negativeTags ≤ 1000; duration 10–360 s.
 */
export function validateGenerateRequest(body: unknown, callBackUrl: string): SunoGeneratePayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError({ body: 'Request body must be a JSON object.' });
  }
  const input = body as Record<string, unknown>;
  const fields: Record<string, string> = {};

  const mode = input.mode;
  if (mode !== 'simple' && mode !== 'custom') fields.mode = 'Mode must be "simple" or "custom".';

  const model = input.model ?? 'V6';
  if (typeof model !== 'string' || !(MODELS as readonly string[]).includes(model)) {
    fields.model = `Model must be one of: ${MODELS.join(', ')}.`;
  }

  if (typeof input.instrumental !== 'boolean') fields.instrumental = 'Choose vocal or instrumental.';

  const text: Record<string, string | undefined> = {};
  for (const key of ['prompt', 'style', 'title', 'lyrics', 'negativeTags'] as const) {
    const v = cleanText(input[key]);
    if (v === '\u0000invalid') fields[key] = `${key} must be text.`;
    else text[key] = v;
  }

  const checkLen = (key: string, max: number, label: string) => {
    const v = text[key];
    if (v && v.length > max) fields[key] = `${label} must be ${max} characters or fewer (currently ${v.length}).`;
  };

  if (Object.keys(fields).length) throw new ValidationError(fields);

  const instrumental = input.instrumental as boolean;
  const payload: SunoGeneratePayload = {
    customMode: mode === 'custom',
    instrumental,
    model: model as SunoModel,
    callBackUrl,
  };

  if (mode === 'simple') {
    checkLen('prompt', LIMITS.simplePrompt, 'Description');
    checkLen('style', LIMITS.style, 'Style');
    if (!text.prompt) fields.prompt = 'Describe the song you want to create.';
    if (!text.style) fields.style = 'Choose a genre or enter a style.';
    for (const key of ['title', 'lyrics', 'negativeTags'] as const) {
      if (text[key]) fields[key] = `${key} is only available in Custom mode.`;
    }
    if (input.vocalGender !== undefined || input.duration !== undefined) {
      fields.mode = 'Vocal gender and duration are only available in Custom mode.';
    }
    if (Object.keys(fields).length) throw new ValidationError(fields);
    payload.prompt = text.prompt;
    payload.style = text.style;
    return payload;
  }

  // ---- custom mode ----
  checkLen('title', LIMITS.title, 'Title');
  checkLen('style', LIMITS.style, 'Style');
  checkLen('lyrics', LIMITS.lyrics, 'Lyrics');
  checkLen('negativeTags', LIMITS.negativeTags, 'Excluded styles');
  if (text.prompt) fields.prompt = 'In Custom mode, describe the sound in the style field and put lyrics in the lyrics field.';
  if (!text.style && !text.lyrics && !text.negativeTags) {
    fields.style = 'Enter a style, lyrics, or styles to exclude.';
  }
  if (!instrumental && !text.lyrics) fields.lyrics = 'Enter lyrics for a vocal track, or switch to Instrumental.';

  if (input.vocalGender !== undefined && input.vocalGender !== 'm' && input.vocalGender !== 'f') {
    fields.vocalGender = 'Vocal gender must be "m" or "f".';
  }
  if (input.vocalGender !== undefined && instrumental) {
    fields.vocalGender = 'Vocal gender cannot be used for instrumental tracks.';
  }
  if (input.duration !== undefined) {
    const d = input.duration;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < LIMITS.durationMin || d > LIMITS.durationMax) {
      fields.duration = `Duration must be a whole number of seconds between ${LIMITS.durationMin} and ${LIMITS.durationMax}.`;
    }
  }
  if (Object.keys(fields).length) throw new ValidationError(fields);

  if (text.title) payload.title = text.title;
  if (text.style) payload.style = text.style;
  if (text.lyrics && !instrumental) payload.lyrics = text.lyrics;
  if (text.negativeTags) payload.negativeTags = text.negativeTags;
  if (input.vocalGender) payload.vocalGender = input.vocalGender as 'm' | 'f';
  if (typeof input.duration === 'number') payload.duration = input.duration;
  return payload;
}

/** Task IDs are opaque strings; accept a conservative character set only. */
export function validateTaskId(value: string | null): string {
  if (!value || !/^[A-Za-z0-9_-]{6,128}$/.test(value)) {
    throw new ValidationError({ taskId: 'A valid taskId is required.' });
  }
  return value;
}

export function validateTrackId(value: string | null): string {
  if (!value || !/^[A-Za-z0-9_-]{4,128}$/.test(value)) {
    throw new ValidationError({ trackId: 'A valid trackId is required.' });
  }
  return value;
}

/** Builds a filesystem-safe download filename from a track title. */
export function safeFilename(title: string, ext: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'ai-music-studio-track'}.${ext}`;
}

// Re-export for convenience in handlers.
export type { GenerateRequest };
