import type {
  ApiErrorBody,
  AppConfigResponse,
  CreditsResponse,
  GenerateRequest,
  GenerateResponse,
  TaskStatusResponse,
} from '../../shared/types.ts';

const ACCESS_KEY = 'ams.accessCode';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function getAccessCode(): string {
  try {
    return localStorage.getItem(ACCESS_KEY) || '';
  } catch {
    return '';
  }
}

export function setAccessCode(code: string): void {
  try {
    if (code) localStorage.setItem(ACCESS_KEY, code);
    else localStorage.removeItem(ACCESS_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function request<T>(path: string, init: RequestInit = {}, accessCode = getAccessCode()): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessCode ? { 'X-Access-Code': accessCode } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Network error — check your connection and try again.');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    if (res.status === 429 && !err) {
      // Netlify platform rate limiter responds without our JSON body.
      throw new ApiError(429, 'rate_limited', 'Too many requests. Please slow down and try again shortly.');
    }
    throw new ApiError(res.status, err?.code || 'http_error', err?.message || `Request failed (${res.status}).`, err?.fields);
  }
  return body as T;
}

export const api = {
  config: () => request<AppConfigResponse>('/api/config'),
  credits: (accessCode?: string) => request<CreditsResponse>('/api/credits', {}, accessCode ?? getAccessCode()),
  generate: (body: GenerateRequest) =>
    request<GenerateResponse>('/api/generate', { method: 'POST', body: JSON.stringify(body) }),
  status: (taskId: string) => request<TaskStatusResponse>(`/api/status?taskId=${encodeURIComponent(taskId)}`),

  /** Downloads through the server proxy so the file gets a proper name. */
  async download(taskId: string, trackId: string, fallbackName: string): Promise<void> {
    const code = getAccessCode();
    let res: Response;
    try {
      res = await fetch(`/api/download?taskId=${encodeURIComponent(taskId)}&trackId=${encodeURIComponent(trackId)}`, {
        headers: code ? { 'X-Access-Code': code } : {},
      });
    } catch {
      throw new ApiError(0, 'network_error', 'Network error while downloading.');
    }
    if (!res.ok) {
      let msg = `Download failed (${res.status}).`;
      try {
        msg = ((await res.json()) as ApiErrorBody).error.message || msg;
      } catch {
        /* non-JSON */
      }
      throw new ApiError(res.status, 'download_failed', msg);
    }
    const disposition = res.headers.get('content-disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = match?.[1] || fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  },
};
