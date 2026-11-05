/**
 * Types shared between the browser app and the Netlify Functions.
 * These describe *our* API (the /api/* endpoints), which normalises the
 * SunoAPI.org responses into a stable shape for the UI.
 */

/** V6-series models are the current SunoAPI.org models; older ones are deprecated. */
export const MODELS = ['V6', 'V6_WILD', 'V6_MINI'] as const;
export type SunoModel = (typeof MODELS)[number];

export type GenerationMode = 'simple' | 'custom';

export interface GenerateRequest {
  mode: GenerationMode;
  model: SunoModel;
  instrumental: boolean;
  /** Simple mode: the song description (the API writes lyrics from it). */
  prompt?: string;
  /** Style / genre tags. In custom mode this also carries the sound description. */
  style?: string;
  /** Custom mode only. */
  title?: string;
  /** Custom mode only: the lyrics to be sung. */
  lyrics?: string;
  /** Custom mode only: styles to avoid. */
  negativeTags?: string;
  /** Custom mode only. */
  vocalGender?: 'm' | 'f';
  /** Custom mode only, seconds (10–360). */
  duration?: number;
}

export interface GenerateResponse {
  taskId: string;
}

/**
 * Normalised task lifecycle.
 * pending  → queued / working
 * text     → lyrics & metadata are ready (TEXT_SUCCESS)
 * first    → the first track is ready (FIRST_SUCCESS) — usually streamable
 * complete → all tracks done (SUCCESS)
 * failed   → any terminal error status
 */
export type TaskPhase = 'pending' | 'text' | 'first' | 'complete' | 'failed';

export interface Track {
  id: string;
  title: string;
  tags: string;
  /** Lyrics / prompt text returned by the API. */
  lyrics: string;
  duration: number | null;
  /** Final MP3 (empty until the track is finished). */
  audioUrl: string;
  /** Streaming URL — often available before the final MP3. */
  streamUrl: string;
  imageUrl: string;
  modelName: string;
  createTime: string;
}

export interface TaskStatusResponse {
  taskId: string;
  phase: TaskPhase;
  /** The raw SunoAPI status string, e.g. "FIRST_SUCCESS". */
  rawStatus: string;
  errorMessage: string | null;
  tracks: Track[];
}

export interface CreditsResponse {
  credits: number;
}

export interface AppConfigResponse {
  accessCodeRequired: boolean;
  mock: boolean;
  models: readonly SunoModel[];
  dailyLimit: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Field-level validation messages, if any. */
    fields?: Record<string, string>;
  };
}

/** Limits from the SunoAPI.org Generate Music docs (V6 series). */
export const LIMITS = {
  simplePrompt: 3000,
  style: 1000,
  lyrics: 5000,
  negativeTags: 1000,
  title: 80,
  durationMin: 10,
  durationMax: 360,
} as const;
