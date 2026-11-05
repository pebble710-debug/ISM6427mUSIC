import type { Config } from '@netlify/functions';
import { json, toErrorResponse, HttpError } from '../lib/http.ts';
import { readEnv, verifyCallbackToken } from '../lib/security.ts';

/**
 * POST /api/suno-callback?token=… — receives SunoAPI webhooks (callBackUrl is a required
 * parameter of Generate Music). The browser tracks progress by polling /api/status, so this
 * endpoint only verifies the secret token, logs the stage, and acknowledges with 200 quickly
 * (SunoAPI's callback timeout is 15 s).
 */
export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use POST.', { Allow: 'POST' });
    const env = readEnv();
    if (!verifyCallbackToken(env, new URL(req.url).searchParams.get('token'))) {
      throw new HttpError(401, 'invalid_token', 'Invalid callback token.');
    }
    const text = await req.text();
    let body: { code?: number; msg?: string; data?: { callbackType?: string; task_id?: string } } = {};
    try {
      body = JSON.parse(text.slice(0, 256 * 1024));
    } catch {
      /* ignore malformed bodies */
    }
    console.log('[suno-callback]', {
      taskId: body.data?.task_id,
      stage: body.data?.callbackType,
      code: body.code,
      msg: body.msg?.slice(0, 200),
    });
    return json(200, { status: 'received' });
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const config: Config = {
  path: '/api/suno-callback',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
