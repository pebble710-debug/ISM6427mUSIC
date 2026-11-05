/**
 * Mock SunoAPI used when SUNO_MOCK=true. It never contacts SunoAPI.org and never spends
 * credits. Responses follow the documented record-info shape so the full UI flow
 * (pending → text → first → complete / failed) can be exercised end-to-end.
 *
 * Task IDs encode their creation time and behaviour flags, so no storage is needed:
 *   mock-<base36 ms>-<flags>-<random>
 * Flags: "f" → GENERATE_AUDIO_FAILED, "s" → SENSITIVE_WORD_ERROR, "i" → instrumental, "n" → none.
 * Include "[mock-fail]" or "[mock-sensitive]" in a prompt/lyrics/style to trigger a failure.
 */
import type { SunoGeneratePayload } from './validation.ts';
import type { SunoRecord, SunoTrack } from './suno.ts';

/** Timeline in milliseconds since task creation. Override with MOCK_SPEED (multiplier). */
const BASE_TIMELINE = { text: 3_000, first: 7_000, complete: 12_000 };

function speed(): number {
  const raw = Number(process.env.MOCK_SPEED);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

const TITLES = ['Neon Horizon', 'Velvet Midnight', 'Glass Cathedral', 'Aurora Drive', 'Silver Lining', 'Afterglow'];

export function mockGenerate(payload: SunoGeneratePayload): string {
  const haystack = `${payload.prompt ?? ''} ${payload.lyrics ?? ''} ${payload.style ?? ''} ${payload.title ?? ''}`;
  let flags = '';
  if (haystack.includes('[mock-fail]')) flags += 'f';
  if (haystack.includes('[mock-sensitive]')) flags += 's';
  if (payload.instrumental) flags += 'i';
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `mock-${Date.now().toString(36)}-${flags || 'n'}-${rand}`;
}

export function parseMockTaskId(taskId: string): { createdAt: number; flags: string; rand: string } | null {
  const m = /^mock-([0-9a-z]+)-([a-z]+)-([0-9a-z]+)$/.exec(taskId);
  if (!m) return null;
  return { createdAt: parseInt(m[1], 36), flags: m[2], rand: m[3] };
}

function track(taskId: string, rand: string, index: number, origin: string, stage: 'text' | 'first' | 'complete', ready: boolean, instrumental: boolean): SunoTrack {
  const seed = `${rand}${index}`;
  const title = TITLES[(parseInt(rand, 36) + index) % TITLES.length];
  const base = `${origin}/api/mock-media`;
  return {
    id: `${taskId.slice(-8)}-trk${index}`,
    audio_url: stage === 'complete' || ready ? `${base}?type=audio&seed=${seed}` : '',
    stream_audio_url: stage === 'text' ? '' : `${base}?type=audio&seed=${seed}`,
    image_url: `${base}?type=image&seed=${seed}`,
    prompt: instrumental ? '' : '[Verse]\nCity lights are humming low\nEvery window starts to glow\n\n[Chorus]\nWe are the afterglow',
    model_name: 'chirp-v6',
    title,
    tags: 'mock, synthwave, dreamy',
    createTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
    duration: stage === 'text' ? null : 8 + index,
  };
}

export function mockRecordInfo(taskId: string, origin: string): SunoRecord {
  const parsed = parseMockTaskId(taskId);
  if (!parsed) {
    return { taskId, status: 'CREATE_TASK_FAILED', errorMessage: 'Unknown mock task.', response: null };
  }
  const elapsed = (Date.now() - parsed.createdAt) * speed();
  const instrumental = parsed.flags.includes('i');

  if (parsed.flags.includes('s') && elapsed > BASE_TIMELINE.text) {
    return { taskId, status: 'SENSITIVE_WORD_ERROR', errorMessage: null, response: null };
  }
  if (parsed.flags.includes('f') && elapsed > BASE_TIMELINE.first) {
    return { taskId, status: 'GENERATE_AUDIO_FAILED', errorMessage: 'Mock generation failure.', response: null };
  }

  if (elapsed < BASE_TIMELINE.text) return { taskId, status: 'PENDING', response: { taskId, sunoData: [] } };

  const stage = elapsed < BASE_TIMELINE.first ? 'text' : elapsed < BASE_TIMELINE.complete ? 'first' : 'complete';
  const status = stage === 'text' ? 'TEXT_SUCCESS' : stage === 'first' ? 'FIRST_SUCCESS' : 'SUCCESS';
  return {
    taskId,
    status,
    errorCode: null,
    errorMessage: null,
    response: {
      taskId,
      sunoData: [
        track(taskId, parsed.rand, 0, origin, stage, stage === 'first', instrumental),
        track(taskId, parsed.rand, 1, origin, stage, false, instrumental),
      ],
    },
  };
}

export function mockCredits(): number {
  return 480;
}

// ---------------------------------------------------------------------------
// Synthetic media for mock mode (small WAV tone sequence + SVG artwork).
// ---------------------------------------------------------------------------

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generates a short, pleasant arpeggio as a 16-bit mono WAV. */
export function mockWav(seed: string, seconds = 8): Uint8Array<ArrayBuffer> {
  const sampleRate = 22_050;
  const n = sampleRate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);

  const roots = [220, 246.94, 261.63, 293.66, 329.63];
  const root = roots[hash(seed) % roots.length];
  const steps = [0, 4, 7, 12, 7, 4, 9, 5];
  const noteLen = sampleRate / 4;
  for (let i = 0; i < n; i++) {
    const note = Math.floor(i / noteLen);
    const f = root * Math.pow(2, steps[note % steps.length] / 12);
    const t = (i % noteLen) / noteLen;
    const env = Math.min(1, t * 20) * Math.exp(-3 * t);
    const fade = Math.min(1, (n - i) / (sampleRate * 0.5));
    const s = (Math.sin((2 * Math.PI * f * i) / sampleRate) * 0.6 + Math.sin((4 * Math.PI * f * i) / sampleRate) * 0.15) * env * fade;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * 0.5)) * 32767, true);
  }
  return new Uint8Array(buf);
}

export function mockSvg(seed: string): string {
  const h = hash(seed);
  const a = h % 360;
  const b = (a + 60 + (h % 80)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a},80%,55%)"/><stop offset="1" stop-color="hsl(${b},75%,35%)"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<circle cx="256" cy="256" r="150" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>
<circle cx="256" cy="256" r="90" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/>
<circle cx="256" cy="256" r="24" fill="rgba(255,255,255,.6)"/>
</svg>`;
}
