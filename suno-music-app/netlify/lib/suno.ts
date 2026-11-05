import type { TaskPhase, TaskStatusResponse, Track } from '../../shared/types.ts';
import type { SunoGeneratePayload } from './validation.ts';
import { mockCredits, mockGenerate, mockRecordInfo } from './mock.ts';

/** Base URL from https://docs.sunoapi.org (Quick Start → API Base URL). */
export const DEFAULT_SUNO_BASE_URL = 'https://api.sunoapi.org';

const REQUEST_TIMEOUT_MS = 20_000;

/** Error carrying a user-safe message and the HTTP status we should answer with. */
export class UpstreamError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.code = code;
  }
}

/**
 * SunoAPI.org returns `{ code, msg, data }`. The documented `code` values are mapped to
 * friendly messages here; the upstream `msg` is only appended for 400/413 (it describes
 * what was wrong with the input) to avoid leaking internal details.
 */
export function mapSunoError(code: number, msg: string | undefined): UpstreamError {
  const detail = msg && msg !== 'success' ? ` (${msg.slice(0, 200)})` : '';
  switch (code) {
    case 400:
      return new UpstreamError(400, 'invalid_parameters', `SunoAPI rejected the request parameters${detail}.`);
    case 401:
      return new UpstreamError(502, 'upstream_unauthorized', 'The server’s SunoAPI key was rejected. Check the SUNO_API_KEY environment variable.');
    case 404:
      return new UpstreamError(502, 'upstream_not_found', 'SunoAPI endpoint not found.');
    case 405:
      return new UpstreamError(429, 'upstream_rate_limited', 'SunoAPI rate limit exceeded. Please wait a moment and try again.');
    case 413:
      return new UpstreamError(400, 'too_long', `Your prompt or style text is too long${detail}.`);
    case 429:
      return new UpstreamError(402, 'insufficient_credits', 'The SunoAPI account has insufficient credits.');
    case 430:
      return new UpstreamError(429, 'upstream_rate_limited', 'Requests are too frequent. Please try again shortly.');
    case 455:
      return new UpstreamError(503, 'maintenance', 'SunoAPI is under maintenance. Please try again later.');
    default:
      return new UpstreamError(502, 'upstream_error', 'SunoAPI returned an error. Please try again later.');
  }
}

export interface SunoClientOptions {
  apiKey: string;
  baseUrl?: string;
  mock?: boolean;
  fetchImpl?: typeof fetch;
  /** Used by the mock to build media URLs. */
  origin?: string;
}

interface SunoEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
}

export class SunoClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly mock: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly origin: string;

  constructor(opts: SunoClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || DEFAULT_SUNO_BASE_URL).replace(/\/+$/, '');
    this.mock = Boolean(opts.mock);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.origin = opts.origin ?? '';
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new UpstreamError(
        504,
        timedOut ? 'upstream_timeout' : 'upstream_unreachable',
        timedOut ? 'SunoAPI took too long to respond.' : 'Could not reach SunoAPI.',
      );
    }

    let json: SunoEnvelope<T> | null = null;
    try {
      json = (await res.json()) as SunoEnvelope<T>;
    } catch {
      json = null;
    }

    // The API reports errors through `code` in the JSON body; fall back to the HTTP status.
    const code = typeof json?.code === 'number' ? json.code : res.status;
    if (!res.ok && code === 200) throw mapSunoError(res.status, json?.msg);
    if (code !== 200) throw mapSunoError(code, json?.msg);
    if (!json || json.data === undefined || json.data === null) {
      throw new UpstreamError(502, 'upstream_bad_response', 'SunoAPI returned an empty response.');
    }
    return json.data;
  }

  /** POST /api/v1/generate → taskId */
  async generate(payload: SunoGeneratePayload): Promise<string> {
    if (this.mock) return mockGenerate(payload);
    const data = await this.request<{ taskId?: string }>('/api/v1/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!data.taskId || typeof data.taskId !== 'string') {
      throw new UpstreamError(502, 'upstream_bad_response', 'SunoAPI did not return a task ID.');
    }
    return data.taskId;
  }

  /** GET /api/v1/generate/record-info?taskId=… → raw record */
  async recordInfo(taskId: string): Promise<SunoRecord> {
    if (this.mock) return mockRecordInfo(taskId, this.origin);
    return this.request<SunoRecord>(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  }

  /** GET /api/v1/generate/credit → integer */
  async credits(): Promise<number> {
    if (this.mock) return mockCredits();
    const data = await this.request<number | { credits?: number }>('/api/v1/generate/credit');
    const n = typeof data === 'number' ? data : Number(data?.credits);
    if (!Number.isFinite(n)) throw new UpstreamError(502, 'upstream_bad_response', 'Unexpected credits response.');
    return n;
  }
}

/** Shape of `data` from Get Music Generation Details. */
export interface SunoRecord {
  taskId?: string;
  status?: string;
  errorCode?: number | string | null;
  errorMessage?: string | null;
  response?: {
    taskId?: string;
    /** API reference field name. */
    sunoData?: SunoTrack[] | null;
    /** Quick-start guide field name — handled for robustness. */
    data?: SunoTrack[] | null;
  } | null;
}

export interface SunoTrack {
  id?: string;
  audio_url?: string;
  source_audio_url?: string;
  stream_audio_url?: string;
  source_stream_audio_url?: string;
  image_url?: string;
  source_image_url?: string;
  prompt?: string;
  model_name?: string;
  title?: string;
  tags?: string;
  createTime?: string | number;
  duration?: number | null;
}

const FAILED_STATUSES: Record<string, string> = {
  CREATE_TASK_FAILED: 'The generation task could not be created.',
  GENERATE_AUDIO_FAILED: 'Music generation failed. Please try again with a different prompt.',
  SENSITIVE_WORD_ERROR: 'Your prompt or lyrics contain words that are not allowed. Please revise and try again.',
  CALLBACK_EXCEPTION: 'The generation task reported an error.',
  FAILED: 'Music generation failed.',
  ERROR: 'Music generation failed.',
};

const PHASES: Record<string, TaskPhase> = {
  PENDING: 'pending',
  GENERATING: 'pending',
  TEXT_SUCCESS: 'text',
  FIRST_SUCCESS: 'first',
  SUCCESS: 'complete',
};

function httpsOrEmpty(url: unknown): string {
  if (typeof url !== 'string' || !url) return '';
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch {
    // Relative URLs are only produced by the mock (same-origin media).
    return url.startsWith('/api/') ? url : '';
  }
}

export function normalizeTrack(t: SunoTrack): Track | null {
  if (!t || typeof t !== 'object' || !t.id) return null;
  return {
    id: String(t.id),
    title: (t.title || 'Untitled').toString().slice(0, 200),
    tags: (t.tags || '').toString().slice(0, 500),
    lyrics: (t.prompt || '').toString().slice(0, 10_000),
    duration: typeof t.duration === 'number' && Number.isFinite(t.duration) ? t.duration : null,
    audioUrl: httpsOrEmpty(t.audio_url),
    streamUrl: httpsOrEmpty(t.stream_audio_url) || httpsOrEmpty(t.source_stream_audio_url),
    imageUrl: httpsOrEmpty(t.image_url) || httpsOrEmpty(t.source_image_url),
    modelName: (t.model_name || '').toString(),
    createTime: t.createTime === undefined ? '' : String(t.createTime),
  };
}

/** Converts a raw record-info payload into our stable, UI-friendly shape. */
export function normalizeRecord(taskId: string, record: SunoRecord): TaskStatusResponse {
  const rawStatus = (record.status || 'PENDING').toString().toUpperCase();
  const rawTracks = record.response?.sunoData ?? record.response?.data ?? [];
  const tracks = (Array.isArray(rawTracks) ? rawTracks : [])
    .map(normalizeTrack)
    .filter((t): t is Track => t !== null);

  let phase: TaskPhase;
  let errorMessage: string | null = null;

  if (rawStatus in PHASES) {
    phase = PHASES[rawStatus];
  } else if (rawStatus === 'CALLBACK_EXCEPTION' && tracks.some((t) => t.audioUrl)) {
    // The audio was produced; only the webhook delivery failed. Treat as complete.
    phase = 'complete';
  } else if (rawStatus in FAILED_STATUSES || rawStatus.endsWith('_FAILED') || rawStatus.endsWith('_ERROR')) {
    phase = 'failed';
    const upstream = typeof record.errorMessage === 'string' ? record.errorMessage.slice(0, 300) : '';
    errorMessage = upstream || FAILED_STATUSES[rawStatus] || 'Music generation failed.';
  } else {
    // Unknown, non-terminal status: keep polling.
    phase = 'pending';
  }

  return { taskId, phase, rawStatus, errorMessage, tracks };
}
