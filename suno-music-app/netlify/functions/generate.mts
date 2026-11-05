import type { Config, Context } from '@netlify/functions';
import type { GenerateResponse } from '../../shared/types.ts';
import { json, readJsonBody, requireMethod, toErrorResponse } from '../lib/http.ts';
import {
  callbackUrl,
  checkAccess,
  checkOrigin,
  clientIp,
  consumeDailyQuota,
  createClient,
  rateLimit,
  readEnv,
} from '../lib/security.ts';
import { validateGenerateRequest } from '../lib/validation.ts';

/** POST /api/generate — starts a SunoAPI music generation task. */
export default async (req: Request, context: Context): Promise<Response> => {
  try {
    requireMethod(req, 'POST');
    checkOrigin(req);
    const env = readEnv();
    checkAccess(req, env);
    rateLimit(`generate:${clientIp(req, context)}`, 5, 60_000);

    const body = await readJsonBody(req);
    const payload = validateGenerateRequest(body, callbackUrl(env, req));
    const client = createClient(env, req);
    await consumeDailyQuota(env);

    const taskId = await client.generate(payload);
    const response: GenerateResponse = { taskId };
    return json(202, response);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const config: Config = {
  path: '/api/generate',
  method: 'POST',
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
