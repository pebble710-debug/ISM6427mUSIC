/** Response bodies copied from the SunoAPI.org documentation examples. */
import type { SunoRecord, SunoTrack } from '../../netlify/lib/suno.ts';
export const GENERATE_OK = { code: 200, msg: 'success', data: { taskId: '5c79abcdbe8e' } };

export const RECORD_SUCCESS = {
  code: 200,
  msg: 'success',
  data: {
    taskId: '5c79abcdbe8e',
    parentMusicId: '',
    param: '{"prompt":"A calm piano track","style":"Classical","title":"Peaceful Piano","customMode":true,"instrumental":true,"model":"V3_5"}',
    response: {
      taskId: '5c79abcdbe8e',
      sunoData: [
        {
          id: 'e231aaaa-bbbb-cccc-dddd-eeee8cadc7dc',
          audio_url: 'https://cdn.example.cn/track1.mp3',
          source_audio_url: '',
          stream_audio_url: 'https://cdn.example.cn/stream1',
          source_stream_audio_url: 'https://cdn.example.cn/srcstream1',
          image_url: 'https://cdn.example.cn/cover1.jpeg',
          source_image_url: 'https://cdn.example.cn/srccover1.jpeg',
          prompt: '[Verse] Night city lights shining bright',
          model_name: 'chirp-v3-5',
          title: 'Iron Man',
          tags: 'electrifying, rock',
          createTime: '2025-01-01 00:00:00',
          duration: 198.44,
        },
      ],
    },
    status: 'SUCCESS',
    type: 'GENERATE',
    operationType: 'generate',
    errorCode: null,
    errorMessage: null,
  },
};

export function record(status: string, tracks: unknown[] = [], extra: Record<string, unknown> = {}): { code: number; msg: string; data: SunoRecord } {
  return { code: 200, msg: 'success', data: { taskId: '5c79abcdbe8e', status, response: { taskId: '5c79abcdbe8e', sunoData: tracks as SunoTrack[] }, errorCode: null, errorMessage: null, ...extra } };
}

export const CREDITS_OK = { code: 200, msg: 'success', data: 100 };

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
