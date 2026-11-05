import { describe, expect, it, vi } from 'vitest';
import { SunoClient, UpstreamError, mapSunoError, normalizeRecord } from '../../netlify/lib/suno.ts';
import { CREDITS_OK, GENERATE_OK, RECORD_SUCCESS, jsonResponse, record } from './fixtures.ts';

const payload = { customMode: false, instrumental: false, model: 'V6' as const, callBackUrl: 'https://x/cb', prompt: 'p', style: 'Pop' };

describe('SunoClient', () => {
  it('POSTs to /api/v1/generate with Bearer auth and returns the taskId', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GENERATE_OK));
    const client = new SunoClient({ apiKey: 'sk-test', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.generate(payload)).resolves.toBe('5c79abcdbe8e');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.sunoapi.org/api/v1/generate');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it('GETs record-info with an encoded taskId', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(RECORD_SUCCESS));
    const client = new SunoClient({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    const rec = await client.recordInfo('5c79abcdbe8e');
    expect(rec.status).toBe('SUCCESS');
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://api.sunoapi.org/api/v1/generate/record-info?taskId=5c79abcdbe8e');
  });

  it('reads credits from /api/v1/generate/credit', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(CREDITS_OK));
    const client = new SunoClient({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.credits()).resolves.toBe(100);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://api.sunoapi.org/api/v1/generate/credit');
  });

  it('honours a base URL override', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(CREDITS_OK));
    const client = new SunoClient({ apiKey: 'k', baseUrl: 'https://proxy.example/', fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.credits();
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://proxy.example/api/v1/generate/credit');
  });

  it.each([
    [400, 400, 'invalid_parameters'],
    [401, 502, 'upstream_unauthorized'],
    [405, 429, 'upstream_rate_limited'],
    [413, 400, 'too_long'],
    [429, 402, 'insufficient_credits'],
    [430, 429, 'upstream_rate_limited'],
    [455, 503, 'maintenance'],
    [500, 502, 'upstream_error'],
  ])('maps body code %i (HTTP 200) to status %i / %s', async (code, status, errCode) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code, msg: 'upstream message', data: null }));
    const client = new SunoClient({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = await client.generate(payload).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.status).toBe(status);
    expect(err.code).toBe(errCode);
  });

  it('maps HTTP errors without a JSON body', async () => {
    const fetchImpl = vi.fn(async () => new Response('Bad gateway', { status: 502 }));
    const client = new SunoClient({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.credits()).rejects.toMatchObject({ code: 'upstream_error' });
  });

  it('never leaks the API key in errors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: 401, msg: 'bad key sk-secret' }));
    const client = new SunoClient({ apiKey: 'sk-secret', fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = await client.credits().catch((e) => e);
    expect(err.message).not.toContain('sk-secret');
  });

  it('reports network failures and timeouts', async () => {
    const net = new SunoClient({ apiKey: 'k', fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch });
    await expect(net.credits()).rejects.toMatchObject({ code: 'upstream_unreachable', status: 504 });
    const timeout = new SunoClient({ apiKey: 'k', fetchImpl: (async () => { throw new DOMException('t', 'TimeoutError'); }) as unknown as typeof fetch });
    await expect(timeout.credits()).rejects.toMatchObject({ code: 'upstream_timeout' });
  });

  it('rejects a success envelope with no taskId', async () => {
    const client = new SunoClient({ apiKey: 'k', fetchImpl: (async () => jsonResponse({ code: 200, msg: 'success', data: {} })) as unknown as typeof fetch });
    await expect(client.generate(payload)).rejects.toMatchObject({ code: 'upstream_bad_response' });
  });
});

describe('normalizeRecord', () => {
  it('normalises the documented SUCCESS example', () => {
    const s = normalizeRecord('5c79abcdbe8e', RECORD_SUCCESS.data);
    expect(s.phase).toBe('complete');
    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0]).toMatchObject({
      id: 'e231aaaa-bbbb-cccc-dddd-eeee8cadc7dc',
      title: 'Iron Man',
      tags: 'electrifying, rock',
      audioUrl: 'https://cdn.example.cn/track1.mp3',
      streamUrl: 'https://cdn.example.cn/stream1',
      imageUrl: 'https://cdn.example.cn/cover1.jpeg',
      duration: 198.44,
      lyrics: '[Verse] Night city lights shining bright',
    });
  });

  it.each([
    ['PENDING', 'pending'],
    ['GENERATING', 'pending'],
    ['TEXT_SUCCESS', 'text'],
    ['FIRST_SUCCESS', 'first'],
    ['SUCCESS', 'complete'],
    ['SOMETHING_NEW', 'pending'],
  ])('maps %s → %s', (raw, phase) => {
    expect(normalizeRecord('t1234567', record(raw).data).phase).toBe(phase);
  });

  it.each(['CREATE_TASK_FAILED', 'GENERATE_AUDIO_FAILED', 'SENSITIVE_WORD_ERROR', 'CALLBACK_EXCEPTION'])('treats %s as failed with a message', (raw) => {
    const s = normalizeRecord('t1234567', record(raw).data);
    expect(s.phase).toBe('failed');
    expect(s.errorMessage).toBeTruthy();
  });

  it('uses the upstream errorMessage when present', () => {
    expect(normalizeRecord('t1234567', record('GENERATE_AUDIO_FAILED', [], { errorMessage: 'Prompt rejected' }).data).errorMessage).toBe('Prompt rejected');
  });

  it('treats CALLBACK_EXCEPTION with finished audio as complete', () => {
    const s = normalizeRecord('t1234567', record('CALLBACK_EXCEPTION', RECORD_SUCCESS.data.response.sunoData).data);
    expect(s.phase).toBe('complete');
  });

  it('accepts the quick-start `response.data` field name too', () => {
    const s = normalizeRecord('t1234567', { status: 'SUCCESS', response: { data: [{ id: 'audio_123', audio_url: 'https://e.com/a.mp3', title: 'Generated Song', tags: 'folk', duration: 180.5 }] } });
    expect(s.tracks[0].audioUrl).toBe('https://e.com/a.mp3');
  });

  it('drops unsafe URLs and malformed tracks', () => {
    const s = normalizeRecord('t1234567', record('FIRST_SUCCESS', [{ id: 'a1', audio_url: 'javascript:alert(1)', image_url: 'data:x', stream_audio_url: 'https://ok/s' }, null, { title: 'no id' }]).data);
    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0].audioUrl).toBe('');
    expect(s.tracks[0].imageUrl).toBe('');
    expect(s.tracks[0].streamUrl).toBe('https://ok/s');
    expect(s.tracks[0].title).toBe('Untitled');
  });
});

describe('mapSunoError', () => {
  it('appends upstream detail only for input errors', () => {
    expect(mapSunoError(400, 'style too long').message).toContain('style too long');
    expect(mapSunoError(500, 'internal stack trace').message).not.toContain('stack');
  });
});
