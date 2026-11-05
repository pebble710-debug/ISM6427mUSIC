# AI Music Studio

AI Music Studio is a music-generation web app built on [SunoAPI.org](https://docs.sunoapi.org/). You describe a song, pick a genre, choose vocal or instrumental (or write your own lyrics), and the app generates real tracks. You can follow progress, play the results in a built-in player, download the MP3s, and browse your past songs.

- **Frontend:** React 19, TypeScript and Vite. It's a static single-page app with a dark, frosted-glass design.
- **Backend:** Netlify Functions (v2). Every SunoAPI call happens on the server, and the API key stays in `SUNO_API_KEY`.
- **Tests:** 78 Vitest unit and handler tests that use mocked SunoAPI responses, plus 8 Playwright end-to-end tests that cover desktop and mobile.

## Features (all based on documented SunoAPI endpoints)

| Feature | SunoAPI endpoint |
| --- | --- |
| Generate from a description (Simple mode, lyrics written for you) | `POST /api/v1/generate` with `customMode: false` |
| Custom title, lyrics, style, excluded styles, voice gender and length (Custom mode) | `POST /api/v1/generate` with `customMode: true` |
| Vocal or instrumental | `instrumental` |
| Choice of model: V6 (default), V6_WILD or V6_MINI | `model` |
| Live progress: Queued → Writing → First track → Complete, or Failed | `GET /api/v1/generate/record-info` |
| Early playback from the stream URL while the final MP3 is still rendering | `stream_audio_url` |
| Artwork, title, tags, duration and lyrics | `image_url`, `title`, `tags`, `duration`, `prompt` |
| MP3 download, saved under the track title | `audio_url`, streamed through `/api/download` |
| Remaining credits shown in the header | `GET /api/v1/generate/credit` |
| History of your songs (stored in this browser) | — |

SunoAPI requires a `callBackUrl`. The app points it at `/api/suno-callback`, which is protected by a secret token and only acknowledges the call. Progress is tracked by polling, which the docs describe as an alternative to callbacks.

## Project structure

```
netlify/functions/   One file per API route (config.path is set in each file)
  generate.mts       POST /api/generate     validates input, enforces limits, starts the task
  status.mts         GET  /api/status       polls record-info and returns a simplified status
  download.mts       GET  /api/download     streams the finished MP3 with a filename
  credits.mts        GET  /api/credits      remaining credits (also checks the access code)
  app-config.mts     GET  /api/config       public, non-secret settings for the UI
  suno-callback.mts  POST /api/suno-callback  receives SunoAPI webhooks (checks the token)
  mock-media.mts     GET  /api/mock-media   sample audio and artwork (only in mock mode)
netlify/lib/         SunoAPI client, validation, security and limits, mock API
shared/types.ts      Types shared by the browser and the functions
src/                 React app (components, hooks, API client)
tests/unit/          Vitest tests (mocked SunoAPI responses taken from the docs)
tests/e2e/           Playwright tests (desktop and mobile, run against mock mode)
scripts/local-server.mjs  Local server that runs the real function handlers
```

## Security and abuse protection

- **No secrets in the browser.** The key exists only in the server's environment. Error messages never include it, and the tests check that it doesn't leak.
- **Optional access code (`APP_ACCESS_CODE`).** When set, every API call must send it, and the UI asks for it before anything else. The server compares it in constant time. **Set this for any public deployment**, or anyone who finds your URL can spend your credits.
- **Rate limits on two levels:**
  - Netlify's platform limiter, configured in each function's `config` (generate: 5 per minute per IP; status: 60 per minute; downloads: 15 per minute).
  - A backup in-memory limiter inside each function.
- **Daily cap (`DAILY_GENERATION_LIMIT`, default 50).** The count is stored in Netlify Blobs, so it holds across function instances.
- **Same-origin check.** Cross-site browser requests are rejected (`Origin` / `Sec-Fetch-Site`), and no CORS headers are sent.
- **Input validation.** Server-side checks follow the documented rules and character limits. Control characters are stripped, and request bodies are capped at 32 KB.
- **No open proxy.** `/api/download` looks up the audio URL on the server from the task ID, so it can't be used to fetch arbitrary URLs.
- **Security headers** (CSP, HSTS, frame-ancestors, nosniff) are set in `netlify.toml`.

## Configure the API key

| Variable | Required | Description |
| --- | --- | --- |
| `SUNO_API_KEY` | **Yes** | Your key from <https://sunoapi.org/api-key>. Keep it server-side only. |
| `APP_ACCESS_CODE` | Recommended | Shared code users must enter. Leave it empty for no gate. |
| `DAILY_GENERATION_LIMIT` | No | Generation requests per UTC day for the whole site. Default `50`; `0` means unlimited. |
| `SUNO_MOCK` | No | `true` uses the built-in mock: no key needed and no credits spent. |
| `SUNO_API_BASE_URL` | No | Override for the API base URL. Default `https://api.sunoapi.org`. |
| `SUNO_CALLBACK_URL` | No | Override for the callback URL. By default it's built from Netlify's `URL`. |

**On Netlify:**
1. Go to **Site configuration → Environment variables → Add a variable**.
2. Add `SUNO_API_KEY` with the **Functions** scope. Mark it as a secret if your plan supports that.
3. Redeploy so the functions pick up the new variable.

**Locally:** copy `.env.example` to `.env` and fill it in. `.env` is git-ignored, so never commit it.

## Deploy to Netlify (manual Git connection)

1. Push this project to GitHub.
2. In Netlify, go to **Add new site → Import an existing project → GitHub** and pick the repository.
3. Use these build settings. `netlify.toml` already provides them, so the defaults should fill in automatically:
   - **Base directory:** leave empty if the app is at the repository root. If it sits in a sub-folder, enter that folder, for example `suno-music-app`.
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions`
   - **Node version:** 22 (set in `netlify.toml`)
4. Add the environment variables listed above, then deploy.
5. Open the site and confirm that the header shows your credit balance. That proves the key works and costs nothing. After that, generate your first song.

## Local development

```bash
npm install
npm run build
SUNO_MOCK=true npm run preview:local     # http://localhost:8888, mock mode with no credits used
```

- To use your real key, put `SUNO_API_KEY` in `.env` and run `npm run preview:local`.
- For a closer match to production (platform rate limits, Blobs), use the [Netlify CLI](https://docs.netlify.com/cli/get-started/): `npx netlify dev`.
- To work on the UI with hot reload, run `npm run dev`. Vite forwards `/api` to port 8888, so the local server needs to be running too.

### Testing

```bash
npm run check       # typecheck + unit/handler tests (mocked SunoAPI)
npm run test:e2e    # build + Playwright end-to-end tests (mock mode)
```

In mock mode, you can force failures to test error handling:
- Include `[mock-fail]` in a prompt to make the generation fail.
- Include `[mock-sensitive]` in a prompt to trigger the "prohibited words" error.

## Limitations

- **History is per browser.** It lives in `localStorage`, and there are no user accounts.
- **Files expire.** SunoAPI keeps generated files for **14 days**. After that, links and downloads for older songs stop working, and the app warns you about them.
- **Downloads are proxied through a function** so they get a proper filename. This is bounded by Netlify's function response and time limits, which a normal song stays well under. If the proxy fails, the app opens the original file in a new tab instead.
- **Netlify's platform rate limits** are applied per region. The daily cap uses Blobs with a read-then-write update, so under heavy simultaneous use it can go slightly over the limit. Treat it as a cost safeguard, not exact billing control.
- **Deprecated models are not offered.** The docs mark everything before V6 as deprecated, so the app only offers V6, V6_WILD and V6_MINI.
- **Not every endpoint is used.** SunoAPI also offers extend, cover, stem separation, video and WAV conversion; this app doesn't use them.
