import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.ts';
import { SunoClient } from './suno.ts';

/** Minimal shape of the Netlify Functions v2 context that we use. */
export interface FnContext {
  ip?: string;
}

export interface ServerEnv {
  apiKey: string;
  mock: boolean;
  accessCode: string;
  dailyLimit: number;
  baseUrl: string;
  callbackUrlOverride: string;
  siteUrl: string;
}

export function readEnv(): ServerEnv {
  const dailyRaw = Number(process.env.DAILY_GENERATION_LIMIT);
  return {
    apiKey: (process.env.SUNO_API_KEY || '').trim(),
    mock: (process.env.SUNO_MOCK || '').toLowerCase() === 'true',
    accessCode: (process.env.APP_ACCESS_CODE || '').trim(),
    // 0 disables the cap. Default: 50 generation requests per UTC day.
    dailyLimit: Number.isFinite(dailyRaw) && dailyRaw >= 0 ? Math.floor(dailyRaw) : 50,
    baseUrl: (process.env.SUNO_API_BASE_URL || '').trim(),
    callbackUrlOverride: (process.env.SUNO_CALLBACK_URL || '').trim(),
    siteUrl: (process.env.URL || '').trim(),
  };
}

export function createClient(env: ServerEnv, req: Request): SunoClient {
  if (!env.mock && !env.apiKey) {
    throw new HttpError(503, 'not_configured', 'The server is not configured yet: set the SUNO_API_KEY environment variable in Netlify.');
  }
  return new SunoClient({
    apiKey: env.apiKey,
    baseUrl: env.baseUrl || undefined,
    mock: env.mock,
    origin: new URL(req.url).origin,
  });
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Optional shared access code (APP_ACCESS_CODE) — protects the billable API key from the public. */
export function checkAccess(req: Request, env: ServerEnv): void {
  if (!env.accessCode) return;
  const provided = req.headers.get('x-access-code') || '';
  if (!provided || !timingSafeEqual(digest(provided), digest(env.accessCode))) {
    throw new HttpError(401, 'access_denied', 'A valid access code is required.');
  }
}

/**
 * Rejects cross-site browser requests so other websites cannot drive this API with a
 * visitor's browser. Non-browser clients are still subject to the access code and limits.
 */
export function checkOrigin(req: Request): void {
  const site = req.headers.get('sec-fetch-site');
  if (site === 'cross-site') throw new HttpError(403, 'forbidden_origin', 'Cross-site requests are not allowed.');
  const origin = req.headers.get('origin');
  if (origin && origin !== 'null') {
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new HttpError(403, 'forbidden_origin', 'Invalid Origin header.');
    }
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
    if (originHost !== host) throw new HttpError(403, 'forbidden_origin', 'Cross-origin requests are not allowed.');
  }
}

export function clientIp(req: Request, context?: FnContext): string {
  return (
    context?.ip ||
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

// ---------------------------------------------------------------------------
// Best-effort in-memory rate limiting (per warm function instance). On Netlify the
// primary limit is the platform rate limit declared in each function's `config`.
// ---------------------------------------------------------------------------
const windows = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const hits = (windows.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retry = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
    windows.set(key, hits);
    throw new HttpError(429, 'rate_limited', `Too many requests. Please wait ${retry}s and try again.`, { 'Retry-After': String(retry) });
  }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 5000) {
    for (const [k, v] of windows) if (!v.length || now - v[v.length - 1] > windowMs) windows.delete(k);
  }
}

export function resetRateLimits(): void {
  windows.clear();
}

// ---------------------------------------------------------------------------
// Daily generation cap — persisted in Netlify Blobs so it holds across instances.
// ---------------------------------------------------------------------------
const memoryCounts = new Map<string, number>();

interface CounterStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

let storeOverride: CounterStore | null | undefined;

/** For tests: inject a store (or null to force the in-memory fallback). */
export function setCounterStore(store: CounterStore | null | undefined): void {
  storeOverride = store;
  memoryCounts.clear();
}

async function counterStore(): Promise<CounterStore | null> {
  if (storeOverride !== undefined) return storeOverride;
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'usage-limits', consistency: 'strong' });
    return {
      get: (k) => store.get(k, { type: 'text' }),
      set: async (k, v) => {
        await store.set(k, v);
      },
    };
  } catch {
    return null; // Blobs unavailable (e.g. plain local server) → in-memory fallback.
  }
}

/** Reserves one generation from today's quota or throws 429. */
export async function consumeDailyQuota(env: ServerEnv, now = new Date()): Promise<void> {
  if (env.dailyLimit === 0) return;
  const key = `generations-${now.toISOString().slice(0, 10)}`;
  const store = await counterStore();
  let count = 0;
  let useMemory = !store;
  if (store) {
    try {
      count = Number((await store.get(key)) || 0) || 0;
    } catch (err) {
      console.warn('[limits] blob read failed; using in-memory counter', err);
      useMemory = true;
    }
  }
  if (useMemory) count = memoryCounts.get(key) || 0;

  if (count >= env.dailyLimit) {
    throw new HttpError(429, 'daily_limit_reached', 'The daily generation limit for this site has been reached. Please try again tomorrow.');
  }
  memoryCounts.set(key, count + 1);
  if (!useMemory && store) {
    try {
      await store.set(key, String(count + 1));
    } catch (err) {
      console.warn('[limits] blob write failed', err);
    }
  }
}

/** Secret token appended to the callback URL so only SunoAPI (who received it) can call it. */
export function callbackToken(env: ServerEnv): string {
  return createHmac('sha256', env.apiKey || 'mock-mode').update('suno-callback-v1').digest('hex').slice(0, 32);
}

export function verifyCallbackToken(env: ServerEnv, token: string | null): boolean {
  if (!token) return false;
  return timingSafeEqual(digest(token), digest(callbackToken(env)));
}

export function callbackUrl(env: ServerEnv, req: Request): string {
  const base = env.callbackUrlOverride || `${(env.siteUrl || new URL(req.url).origin).replace(/\/+$/, '')}/api/suno-callback`;
  const url = new URL(base);
  url.searchParams.set('token', callbackToken(env));
  return url.toString();
}
