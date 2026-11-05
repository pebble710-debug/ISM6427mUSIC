import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import generate from '../../netlify/functions/generate.mts';
import status from '../../netlify/functions/status.mts';
import credits from '../../netlify/functions/credits.mts';
import download from '../../netlify/functions/download.mts';
import appConfig from '../../netlify/functions/app-config.mts';
import callback from '../../netlify/functions/suno-callback.mts';
import mockMedia from '../../netlify/functions/mock-media.mts';
import { callbackToken, readEnv, resetRateLimits, setCounterStore } from '../../netlify/lib/security.ts';
import { CREDITS_OK, GENERATE_OK, RECORD_SUCCESS, jsonResponse, record } from './fixtures.ts';

type Ctx = Parameters<typeof generate>[1];
const ctx = (ip = '203.0.113.7') => ({ ip }) as unknown as Ctx;
const SITE = 'https://studio.example';

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${SITE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', host: 'studio.example', ...headers }, body: JSON.stringify(body) });
}
function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`${SITE}${path}`, { headers: { host: 'studio.example', ...headers } });
}
const SIMPLE = { mode: 'simple', model: 'V6', instrumental: false, prompt: 'A chill lo-fi beat with soft vocals', style: 'lo-fi, chill' };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetRateLimits();
  setCounterStore(null);
  process.env.SUNO_API_KEY = 'sk-test-key';
  delete process.env.SUNO_MOCK;
  delete process.env.APP_ACCESS_CODE;
  delete process.env.DAILY_GENERATION_LIMIT;
  delete process.env.SUNO_CALLBACK_URL;
  process.env.URL = SITE;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('POST /api/generate', () => {
  it('forwards a validated payload with a tokenised callback URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(GENERATE_OK));
    const res = await generate(post('/api/generate', SIMPLE), ctx());
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ taskId: '5c79abcdbe8e' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sunoapi.org/api/v1/generate');
    expect(init.headers.Authorization).toBe('Bearer sk-test-key');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ customMode: false, instrumental: false, model: 'V6', prompt: SIMPLE.prompt, style: SIMPLE.style });
    expect(sent.callBackUrl).toBe(`${SITE}/api/suno-callback?token=${callbackToken(readEnv())}`);
  });

  it('never returns the API key to the browser', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 401, msg: 'invalid key' }));
    const res = await generate(post('/api/generate', SIMPLE), ctx());
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).not.toContain('sk-test-key');
  });

  it('returns field errors for invalid input without calling SunoAPI', async () => {
    const res = await generate(post('/api/generate', { ...SIMPLE, prompt: '' }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.fields.prompt).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps insufficient credits (code 429) to 402', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 429, msg: 'Insufficient credits' }));
    const res = await generate(post('/api/generate', SIMPLE), ctx());
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe('insufficient_credits');
  });

  it('rejects wrong method, content type, bad JSON and oversize bodies', async () => {
    expect((await generate(get('/api/generate'), ctx())).status).toBe(405);
    const textReq = new Request(`${SITE}/api/generate`, { method: 'POST', headers: { 'content-type': 'text/plain', host: 'studio.example' }, body: 'x' });
    expect((await generate(textReq, ctx())).status).toBe(415);
    const bad = new Request(`${SITE}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json', host: 'studio.example' }, body: '{nope' });
    expect((await generate(bad, ctx())).status).toBe(400);
    expect((await generate(post('/api/generate', { ...SIMPLE, prompt: 'x'.repeat(40_000) }), ctx())).status).toBe(413);
  });

  it('blocks cross-site requests', async () => {
    expect((await generate(post('/api/generate', SIMPLE, { origin: 'https://evil.example' }), ctx())).status).toBe(403);
    expect((await generate(post('/api/generate', SIMPLE, { 'sec-fetch-site': 'cross-site' }), ctx())).status).toBe(403);
    fetchMock.mockResolvedValueOnce(jsonResponse(GENERATE_OK));
    expect((await generate(post('/api/generate', SIMPLE, { origin: SITE, 'sec-fetch-site': 'same-origin' }), ctx())).status).toBe(202);
  });

  it('requires the access code when APP_ACCESS_CODE is set', async () => {
    process.env.APP_ACCESS_CODE = 'open-sesame';
    expect((await generate(post('/api/generate', SIMPLE), ctx())).status).toBe(401);
    expect((await generate(post('/api/generate', SIMPLE, { 'x-access-code': 'wrong' }), ctx())).status).toBe(401);
    fetchMock.mockResolvedValueOnce(jsonResponse(GENERATE_OK));
    expect((await generate(post('/api/generate', SIMPLE, { 'x-access-code': 'open-sesame' }), ctx())).status).toBe(202);
  });

  it('rate-limits each IP to 5 generations per minute', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(GENERATE_OK));
    for (let i = 0; i < 5; i++) expect((await generate(post('/api/generate', SIMPLE), ctx('198.51.100.1'))).status).toBe(202);
    const limited = await generate(post('/api/generate', SIMPLE), ctx('198.51.100.1'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await generate(post('/api/generate', SIMPLE), ctx('198.51.100.2'))).status).toBe(202);
  });

  it('enforces the daily generation cap', async () => {
    process.env.DAILY_GENERATION_LIMIT = '2';
    fetchMock.mockImplementation(async () => jsonResponse(GENERATE_OK));
    expect((await generate(post('/api/generate', SIMPLE), ctx('192.0.2.1'))).status).toBe(202);
    expect((await generate(post('/api/generate', SIMPLE), ctx('192.0.2.2'))).status).toBe(202);
    const res = await generate(post('/api/generate', SIMPLE), ctx('192.0.2.3'));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('daily_limit_reached');
  });

  it('persists the daily counter in the injected (Blobs) store', async () => {
    const data = new Map<string, string>();
    setCounterStore({ get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v) });
    fetchMock.mockResolvedValueOnce(jsonResponse(GENERATE_OK));
    await generate(post('/api/generate', SIMPLE), ctx());
    expect([...data.values()]).toEqual(['1']);
  });

  it('reports a missing API key clearly', async () => {
    delete process.env.SUNO_API_KEY;
    const res = await generate(post('/api/generate', SIMPLE), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('not_configured');
  });
});

describe('GET /api/status', () => {
  it('returns the normalised record', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(RECORD_SUCCESS));
    const res = await status(get('/api/status?taskId=5c79abcdbe8e'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phase).toBe('complete');
    expect(body.tracks[0].title).toBe('Iron Man');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sunoapi.org/api/v1/generate/record-info?taskId=5c79abcdbe8e');
  });

  it('reports failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(record('SENSITIVE_WORD_ERROR')));
    const body = await (await status(get('/api/status?taskId=5c79abcdbe8e'), ctx())).json();
    expect(body.phase).toBe('failed');
    expect(body.errorMessage).toMatch(/not allowed/);
  });

  it('validates the taskId', async () => {
    expect((await status(get('/api/status'), ctx())).status).toBe(400);
    expect((await status(get('/api/status?taskId=%3Cscript%3E'), ctx())).status).toBe(400);
  });

  it('surfaces upstream outages as 5xx', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await status(get('/api/status?taskId=5c79abcdbe8e'), ctx())).status).toBe(504);
  });
});

describe('GET /api/credits', () => {
  it('returns the remaining credits', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(CREDITS_OK));
    expect(await (await credits(get('/api/credits'), ctx())).json()).toEqual({ credits: 100 });
  });
});

describe('GET /api/download', () => {
  const tid = 'e231aaaa-bbbb-cccc-dddd-eeee8cadc7dc';

  it('streams the audio looked up server-side, with a filename', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(RECORD_SUCCESS))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg', 'content-length': '3' } }));
    const res = await download(get(`/api/download?taskId=5c79abcdbe8e&trackId=${tid}`), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('filename="Iron Man.mp3"');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://cdn.example.cn/track1.mp3');
  });

  it('404s for unknown tracks and 409s for unfinished ones', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(RECORD_SUCCESS));
    expect((await download(get('/api/download?taskId=5c79abcdbe8e&trackId=unknown-id'), ctx())).status).toBe(404);
    fetchMock.mockResolvedValueOnce(jsonResponse(record('FIRST_SUCCESS', [{ id: tid, audio_url: '', stream_audio_url: 'https://s/x' }])));
    expect((await download(get(`/api/download?taskId=5c79abcdbe8e&trackId=${tid}`), ctx())).status).toBe(409);
  });

  it('reports expired files', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(RECORD_SUCCESS)).mockResolvedValueOnce(new Response('gone', { status: 404 }));
    const res = await download(get(`/api/download?taskId=5c79abcdbe8e&trackId=${tid}`), ctx());
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toMatch(/expired/);
  });
});

describe('other endpoints', () => {
  it('/api/config exposes only non-secret settings', async () => {
    process.env.APP_ACCESS_CODE = 'secret-code';
    const res = await appConfig(get('/api/config'));
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ accessCodeRequired: true, mock: false, dailyLimit: 50 });
    expect(text).not.toContain('secret-code');
    expect(text).not.toContain('sk-test-key');
  });

  it('/api/suno-callback accepts only the correct token', async () => {
    const good = callbackToken(readEnv());
    const cbBody = { code: 200, msg: 'All generated successfully.', data: { callbackType: 'complete', task_id: '2fac9f72', data: [] } };
    expect((await callback(post(`/api/suno-callback?token=${good}`, cbBody))).status).toBe(200);
    expect((await callback(post('/api/suno-callback?token=nope', cbBody))).status).toBe(401);
    expect((await callback(post('/api/suno-callback', cbBody))).status).toBe(401);
    expect((await callback(get(`/api/suno-callback?token=${good}`))).status).toBe(405);
  });

  it('/api/mock-media is disabled unless SUNO_MOCK=true', async () => {
    expect((await mockMedia(get('/api/mock-media?type=audio&seed=a'))).status).toBe(404);
    process.env.SUNO_MOCK = 'true';
    const res = await mockMedia(get('/api/mock-media?type=audio&seed=a'));
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    // Byte ranges (needed for seeking in demo mode).
    const part = await mockMedia(get('/api/mock-media?type=audio&seed=a', { range: 'bytes=0-99' }));
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toMatch(/^bytes 0-99\/\d+$/);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
    expect((await mockMedia(get('/api/mock-media?type=audio&seed=a', { range: 'bytes=99999999-' }))).status).toBe(416);
  });
});

describe('mock mode', () => {
  it('runs the full lifecycle without calling SunoAPI', async () => {
    process.env.SUNO_MOCK = 'true';
    delete process.env.SUNO_API_KEY;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { taskId } = await (await generate(post('/api/generate', SIMPLE), ctx())).json();
      const phase = async () => (await (await status(get(`/api/status?taskId=${taskId}`), ctx())).json()).phase;
      expect(await phase()).toBe('pending');
      vi.advanceTimersByTime(4_000);
      expect(await phase()).toBe('text');
      vi.advanceTimersByTime(4_000);
      expect(await phase()).toBe('first');
      vi.advanceTimersByTime(6_000);
      expect(await phase()).toBe('complete');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('simulates failures', async () => {
    process.env.SUNO_MOCK = 'true';
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { taskId } = await (await generate(post('/api/generate', { ...SIMPLE, prompt: 'x [mock-fail]' }), ctx())).json();
      vi.advanceTimersByTime(8_000);
      const body = await (await status(get(`/api/status?taskId=${taskId}`), ctx())).json();
      expect(body.phase).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });
});
