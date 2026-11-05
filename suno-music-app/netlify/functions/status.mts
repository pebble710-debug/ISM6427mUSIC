import type { Config, Context } from '@netlify/functions';
import { json, requireMethod, toErrorResponse } from '../lib/http.ts';
import { checkAccess, checkOrigin, clientIp, createClient, rateLimit, readEnv } from '../lib/security.ts';
import { normalizeRecord } from '../lib/suno.ts';
import { validateTaskId } from '../lib/validation.ts';

/** GET /api/status?taskId=… — polls Get Music Generation Details and normalises it. */
export default async (req: Request, context: Context): Promise<Response> => {
  try {
    requireMethod(req, 'GET');
    checkOrigin(req);
    const env = readEnv();
    checkAccess(req, env);
    rateLimit(`status:${clientIp(req, context)}`, 60, 60_000);

    const taskId = validateTaskId(new URL(req.url).searchParams.get('taskId'));
    const client = createClient(env, req);
    const record = await client.recordInfo(taskId);
    return json(200, normalizeRecord(taskId, record));
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const config: Config = {
  path: '/api/status',
  method: 'GET',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
