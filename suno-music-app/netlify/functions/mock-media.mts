import type { Config } from '@netlify/functions';
import { errorResponse } from '../lib/http.ts';
import { mockSvg, mockWav } from '../lib/mock.ts';
import { readEnv } from '../lib/security.ts';

/** GET /api/mock-media — synthetic audio/artwork, served only when SUNO_MOCK=true. */
export default async (req: Request): Promise<Response> => {
  if (!readEnv().mock) return errorResponse(404, 'not_found', 'Not found.');
  const params = new URL(req.url).searchParams;
  const seed = (params.get('seed') || 'seed').replace(/[^a-z0-9]/gi, '').slice(0, 32) || 'seed';
  if (params.get('type') === 'image') {
    return new Response(mockSvg(seed), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
    });
  }
  const wav = mockWav(seed);
  return new Response(wav, {
    headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(wav.byteLength), 'Accept-Ranges': 'none', 'Cache-Control': 'public, max-age=3600' },
  });
};

export const config: Config = { path: '/api/mock-media', method: 'GET' };
