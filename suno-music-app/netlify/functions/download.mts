import type { Config, Context } from '@netlify/functions';
import { HttpError, requireMethod, toErrorResponse } from '../lib/http.ts';
import { checkAccess, checkOrigin, clientIp, createClient, rateLimit, readEnv } from '../lib/security.ts';
import { normalizeRecord } from '../lib/suno.ts';
import { safeFilename, validateTaskId, validateTrackId } from '../lib/validation.ts';

const MAX_BYTES = 40 * 1024 * 1024;

/**
 * GET /api/download?taskId=…&trackId=… — streams the finished audio file with a
 * Content-Disposition header so browsers save it with a proper filename.
 * The audio URL is looked up server-side from the task (never taken from the client),
 * so this cannot be abused as an open proxy.
 */
export default async (req: Request, context: Context): Promise<Response> => {
  try {
    requireMethod(req, 'GET');
    checkOrigin(req);
    const env = readEnv();
    checkAccess(req, env);
    rateLimit(`download:${clientIp(req, context)}`, 15, 60_000);

    const params = new URL(req.url).searchParams;
    const taskId = validateTaskId(params.get('taskId'));
    const trackId = validateTrackId(params.get('trackId'));

    const client = createClient(env, req);
    const status = normalizeRecord(taskId, await client.recordInfo(taskId));
    const track = status.tracks.find((t) => t.id === trackId);
    if (!track) throw new HttpError(404, 'track_not_found', 'That track was not found for this task.');
    if (!track.audioUrl) throw new HttpError(409, 'not_ready', 'This track is not ready to download yet.');

    const source = new URL(track.audioUrl, req.url);
    const upstream = await fetch(source, { signal: AbortSignal.timeout(25_000) }).catch(() => null);
    if (!upstream || !upstream.ok || !upstream.body) {
      throw new HttpError(502, 'download_failed', 'Could not fetch the audio file. It may have expired (files are kept for 14 days).');
    }
    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > MAX_BYTES) throw new HttpError(413, 'file_too_large', 'The audio file is too large to proxy.');

    const type = upstream.headers.get('content-type') || 'audio/mpeg';
    const ext = type.includes('wav') ? 'wav' : 'mp3';
    const filename = safeFilename(track.title, ext);
    const headers: Record<string, string> = {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, max-age=0, no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (length) headers['Content-Length'] = String(length);
    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const config: Config = {
  path: '/api/download',
  method: 'GET',
  rateLimit: { windowLimit: 15, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
