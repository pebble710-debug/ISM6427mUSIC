import type { Config } from '@netlify/functions';
import { MODELS, type AppConfigResponse } from '../../shared/types.ts';
import { json, requireMethod, toErrorResponse } from '../lib/http.ts';
import { readEnv } from '../lib/security.ts';

/** GET /api/config — public, non-secret settings the UI needs at start-up. */
export default async (req: Request): Promise<Response> => {
  try {
    requireMethod(req, 'GET');
    const env = readEnv();
    const body: AppConfigResponse = {
      accessCodeRequired: Boolean(env.accessCode),
      mock: env.mock,
      models: MODELS,
      dailyLimit: env.dailyLimit,
    };
    return json(200, body);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const config: Config = {
  path: '/api/config',
  method: 'GET',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
