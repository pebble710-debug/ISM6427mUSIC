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
  const base = { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' };
  // Support byte ranges so the browser can seek inside mock audio (like a real CDN).
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (range && (range[1] || range[2])) {
    const size = wav.byteLength;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
    }
    const chunk = wav.slice(start, end + 1);
    return new Response(chunk, {
      status: 206,
      headers: { ...base, 'Content-Length': String(chunk.byteLength), 'Content-Range': `bytes ${start}-${end}/${size}` },
    });
  }
  return new Response(wav, { headers: { ...base, 'Content-Length': String(wav.byteLength) } });
};

export const config: Config = { path: '/api/mock-media', method: 'GET' };
