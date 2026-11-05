import type { Config, Context } from '@netlify/functions';
import { json, requireMethod, toErrorResponse } from '../lib/http.ts';
import { checkAccess, checkOrigin, clientIp, createClient, rateLimit, readEnv } from '../lib/security.ts';

/** GET /api/credits — remaining SunoAPI credits (also used to verify an access code). */
export default async (req: Request, context: Context): Promise<Response> => {
  try {
    requireMethod(req, 'GET');
    checkOrigin(req);
    const env = readEnv();
    checkAccess(req, env);
    rateLimit(`credits:${clientIp(req, context)}`, 20, 60_000);
    const client = createClient(env, req);
    return json(200, { credits: await client.credits() });
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const config: Config = {
  path: '/api/credits',
  method: 'GET',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
