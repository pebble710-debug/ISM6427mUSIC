import { defineConfig, devices } from '@playwright/test';

const PORT = 8899;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: /mobile/ },
  ],
  webServer: {
    // Mock mode: never contacts SunoAPI, never spends credits. ~12 s per task.
    command: `node scripts/local-server.mjs`,
    env: { SUNO_MOCK: 'true', MOCK_SPEED: '1', PORT: String(PORT), SUNO_API_KEY: '', APP_ACCESS_CODE: '' },
    url: `http://localhost:${PORT}/api/config`,
    reuseExistingServer: false,
  },
});
