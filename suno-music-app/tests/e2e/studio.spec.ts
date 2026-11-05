import { expect, test, type Page } from '@playwright/test';

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'AI Music Studio' })).toBeVisible();
}

test.describe('AI Music Studio', () => {
  test('simple generation: progress → playback → download', async ({ page }) => {
    await fresh(page);
    await expect(page.getByText('Demo mode')).toBeVisible();
    await expect(page.getByTestId('credits')).toContainText('480');

    await page.getByLabel('Describe your song').fill('A dreamy late-night drive song about city lights');
    await page.getByRole('button', { name: 'Synthwave', exact: true }).click();

    const reqPromise = page.waitForRequest((r) => r.url().endsWith('/api/generate'));
    await page.getByRole('button', { name: 'Generate song' }).click();
    const sent = (await reqPromise).postDataJSON();
    expect(sent).toEqual({ mode: 'simple', model: 'V6', instrumental: false, prompt: 'A dreamy late-night drive song about city lights', style: 'Synthwave' });

    const card = page.getByTestId('task-card').first();
    await expect(card).toBeVisible();
    await expect(card.getByRole('progressbar')).toBeVisible();
    await expect(card).toHaveAttribute('data-phase', /text|first/, { timeout: 15_000 });
    await expect(card).toHaveAttribute('data-phase', 'complete', { timeout: 20_000 });
    await expect(page.getByText(/is ready/)).toBeVisible();

    const tracks = card.locator('.track');
    await expect(tracks).toHaveCount(2);
    await expect(tracks.first().locator('img')).toHaveAttribute('src', /mock-media\?type=image/);

    // Play
    await tracks.first().locator('.track-art').click();
    const title = await tracks.first().locator('.track-title').innerText();
    await expect(page.getByTestId('now-playing-title')).toHaveText(title);
    await expect(page.getByTestId('player-toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
    await expect.poll(async () => page.evaluate(() => (document.querySelector('[data-testid="player-time"]') as HTMLElement).innerText), { timeout: 10_000 }).not.toBe('0:00');
    await page.getByTestId('player-toggle').click();
    await expect(page.getByTestId('player-toggle')).toHaveAttribute('aria-label', 'Play');

    // Next track
    await page.getByRole('button', { name: 'Next track' }).click();
    await expect(page.getByTestId('now-playing-title')).toHaveText(await tracks.nth(1).locator('.track-title').innerText());

    // Download
    const dl = page.waitForEvent('download');
    await tracks.first().getByRole('button', { name: /^Download/ }).click();
    const download = await dl;
    expect(download.suggestedFilename()).toBe(`${title}.wav`);

    // History survives a reload
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(1);
    await expect(page.getByTestId('task-card').first()).toHaveAttribute('data-phase', 'complete');
  });

  test('custom mode sends title, lyrics, voice and length', async ({ page }) => {
    await fresh(page);
    await page.getByRole('radio', { name: 'Custom' }).click();
    await page.getByLabel(/Song title/).fill('Neon Afterglow');
    await page.getByRole('button', { name: 'Pop', exact: true }).click();
    await page.getByLabel('Describe the sound').fill('airy, 90 bpm');
    await page.getByRole('button', { name: '[Verse]' }).click();
    await page.getByLabel(/Lyrics/).pressSequentially('City lights are humming low');
    await page.getByRole('button', { name: 'Advanced settings' }).click();
    await page.getByRole('radio', { name: 'Female' }).click();

    const reqPromise = page.waitForRequest((r) => r.url().endsWith('/api/generate'));
    await page.getByRole('button', { name: 'Generate song' }).click();
    const sent = (await reqPromise).postDataJSON();
    expect(sent).toEqual({
      mode: 'custom', model: 'V6', instrumental: false, style: 'Pop, airy, 90 bpm', duration: 120,
      title: 'Neon Afterglow', lyrics: '[Verse]\nCity lights are humming low', vocalGender: 'f',
    });
    await expect(page.getByTestId('task-card').first()).toHaveAttribute('data-phase', 'complete', { timeout: 25_000 });
    // Lyrics viewer
    await page.getByRole('button', { name: 'Show lyrics' }).first().click();
    await expect(page.locator('.lyrics').first()).toContainText('[Verse]');
  });

  test('instrumental hides lyrics and validates before sending', async ({ page }) => {
    await fresh(page);
    let calls = 0;
    page.on('request', (r) => r.url().endsWith('/api/generate') && calls++);
    await page.getByRole('button', { name: 'Generate song' }).click();
    await expect(page.getByText('Describe the song you want to create.')).toBeVisible();
    await expect(page.getByText('Pick at least one genre or type a style.')).toBeVisible();
    expect(calls).toBe(0);

    await page.getByRole('radio', { name: 'Custom' }).click();
    await expect(page.getByLabel(/Lyrics/)).toBeVisible();
    await page.getByRole('radio', { name: /Instrumental/ }).click();
    await expect(page.getByLabel(/Lyrics/)).toHaveCount(0);
  });

  test('shows failed generations', async ({ page }) => {
    await fresh(page);
    await page.getByLabel('Describe your song').fill('This one should fail [mock-fail]');
    await page.getByRole('button', { name: 'Jazz', exact: true }).click();
    await page.getByRole('button', { name: 'Generate song' }).click();
    const card = page.getByTestId('task-card').first();
    await expect(card).toHaveAttribute('data-phase', 'failed', { timeout: 20_000 });
    await expect(card.getByText('Mock generation failure.')).toBeVisible();
  });

  test('surfaces API errors (insufficient credits, rate limits)', async ({ page }) => {
    await fresh(page);
    await page.route('**/api/generate', (route) =>
      route.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ error: { code: 'insufficient_credits', message: 'The SunoAPI account has insufficient credits.' } }) }),
    );
    await page.getByLabel('Describe your song').fill('Anything');
    await page.getByRole('button', { name: 'Rock', exact: true }).click();
    await page.getByRole('button', { name: 'Generate song' }).click();
    await expect(page.getByRole('alert')).toHaveText('The SunoAPI account has insufficient credits.');

    await page.unroute('**/api/generate');
    await page.route('**/api/generate', (route) => route.fulfill({ status: 429, body: 'Too Many Requests' }));
    await page.getByRole('button', { name: 'Generate song' }).click();
    await expect(page.getByRole('alert')).toContainText('Too many requests');
    await expect(page.getByTestId('task-card')).toHaveCount(0);
  });

  test('access code gate', async ({ page }) => {
    await page.route('**/api/config', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ accessCodeRequired: true, mock: true, models: ['V6'], dailyLimit: 50 }) }),
    );
    await page.route('**/api/credits', (route) => {
      const ok = route.request().headers()['x-access-code'] === 'letmein';
      return route.fulfill({ status: ok ? 200 : 401, contentType: 'application/json', body: JSON.stringify(ok ? { credits: 42 } : { error: { code: 'access_denied', message: 'A valid access code is required.' } }) });
    });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const gate = page.getByRole('dialog');
    await expect(gate).toBeVisible();
    await gate.getByLabel('Access code').fill('nope');
    await gate.getByRole('button', { name: 'Unlock studio' }).click();
    await expect(gate.getByRole('alert')).toHaveText('That access code is not valid.');
    await gate.getByLabel('Access code').fill('letmein');
    await gate.getByRole('button', { name: 'Unlock studio' }).click();
    await expect(gate).toHaveCount(0);
    await expect(page.getByTestId('credits')).toContainText('42');
  });

  test('desktop screenshot', async ({ page }) => {
    await fresh(page);
    await page.getByLabel('Describe your song').fill('Uplifting cinematic anthem with soaring strings');
    await page.getByRole('button', { name: 'Cinematic', exact: true }).click();
    await page.getByRole('button', { name: 'Generate song' }).click();
    await expect(page.getByTestId('task-card').first()).toHaveAttribute('data-phase', 'complete', { timeout: 25_000 });
    await page.locator('.track-art').first().click();
    await expect(page.getByTestId('player-toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/desktop.png' });
  });
});
