import type { ApiErrorBody } from '../../shared/types.ts';
import { UpstreamError } from './suno.ts';
import { ValidationError } from './validation.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;
  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function errorResponse(status: number, code: string, message: string, extra: Partial<ApiErrorBody['error']> = {}, headers: Record<string, string> = {}): Response {
  const body: ApiErrorBody = { error: { code, message, ...extra } };
  return json(status, body, headers);
}

/** Converts thrown errors into consistent JSON error responses. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof ValidationError) {
    return errorResponse(400, 'validation_error', err.message, { fields: err.fields });
  }
  if (err instanceof HttpError) {
    return errorResponse(err.status, err.code, err.message, {}, err.headers);
  }
  if (err instanceof UpstreamError) {
    return errorResponse(err.status, err.code, err.message);
  }
  console.error('[api] unexpected error', err);
  return errorResponse(500, 'internal_error', 'An unexpected server error occurred.');
}

export function requireMethod(req: Request, ...methods: string[]): void {
  if (!methods.includes(req.method)) {
    throw new HttpError(405, 'method_not_allowed', `Use ${methods.join(' or ')}.`, { Allow: methods.join(', ') });
  }
}

const MAX_BODY_BYTES = 32 * 1024;

export async function readJsonBody(req: Request): Promise<unknown> {
  const type = req.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large', 'Request body is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON.');
  }
}
