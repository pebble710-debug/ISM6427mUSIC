import { expect, test, type Page } from '@playwright/test';

/** Pre-existing library data, in the exact format already saved by the deployed app. */
function seedHistory() {
  const t = (id: string, title: string, seed: string) => ({
    id, title, tags: 'seeded, test', lyrics: '[Verse] hello', duration: 8,
    audioUrl: `/api/mock-media?type=audio&seed=${seed}`, streamUrl: '', imageUrl: `/api/mock-media?type=image&seed=${seed}`,
    modelName: 'chirp-v6', createTime: '',
  });
  const now = Date.now();
  const item = (taskId: string, ago: number, prompt: string, tracks: unknown[]) => ({
    taskId, createdAt: now - ago, updatedAt: now - ago, phase: 'complete', rawStatus: 'SUCCESS', errorMessage: null,
    request: { mode: 'simple', model: 'V6', instrumental: false, prompt, style: 'Pop' }, tracks,
  });
  return [
    item('seed-newest-1', 60_000, 'Newest song', [t('s1a', 'Midnight Ocean', 'a1'), t('s1b', 'Zephyr Lights', 'b1')]),
    item('seed-middle-2', 3_600_000, 'Middle song', [t('s2a', 'Banana Sunrise', 'a2'), t('s2b', 'Crystal Rain', 'b2')]),
    item('seed-oldest-3', 86_400_000, 'Oldest song', [t('s3a', 'Amber Echoes', 'a3'), t('s3b', 'Yellow Kites', 'b3')]),
  ];
}

async function seeded(page: Page, extra: Record<string, string> = {}) {
  await page.goto('/');
  const history = JSON.stringify(seedHistory());
  await page.evaluate(([h, e]) => {
    localStorage.clear();
    localStorage.setItem('ams.history.v1', h as string);
    for (const [k, v] of Object.entries(e as Record<string, string>)) localStorage.setItem(k, v);
  }, [history, extra] as const);
  await page.reload();
  await expect(page.getByTestId('task-card')).toHaveCount(3);
  return history;
}

// These tests reload many times; serve the credits badge locally so they don't use up the
// shared test server's per-IP /api/credits rate limit (20/min) needed by other test files.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/credits', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ credits: 480 }) }));
});

const theme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const titles = (page: Page) => page.locator('.track-title').allInnerTexts();

test.describe('Appearance', () => {
  test('Light, Dark and Auto modes apply and survive refresh', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const sw = page.getByRole('radiogroup', { name: 'Appearance' });
    await expect(sw.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
    expect(await theme(page)).toBe('dark');

    await sw.getByRole('radio', { name: 'Light' }).click();
    expect(await theme(page)).toBe('light');
    // Colours transition smoothly, so wait for the transition to finish.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(245, 243, 252)');
    await page.reload();
    expect(await theme(page)).toBe('light');
    await expect(sw.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');

    await sw.getByRole('radio', { name: 'Dark' }).click();
    expect(await theme(page)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' }); // OS change must NOT affect an explicit choice
    expect(await theme(page)).toBe('dark');
    await page.reload();
    expect(await theme(page)).toBe('dark');

    // Auto follows the OS immediately, without a reload.
    await sw.getByRole('radio', { name: 'Auto' }).click();
    expect(await theme(page)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => theme(page)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => theme(page)).toBe('light');
    await page.reload();
    await expect(sw.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
  });

  test('theme is applied before the app script runs (no flash)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('ams.prefs.v1', JSON.stringify({ theme: 'light' })));
    // Block the React bundle: only the tiny head script can set the theme.
    await page.route('**/assets/*.js', (r) => r.abort());
    await page.reload();
    expect(await theme(page)).toBe('light');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(245, 243, 252)');
  });

  test('all key components render in light mode', async ({ page }) => {
    await seeded(page, { 'ams.prefs.v1': JSON.stringify({ theme: 'light' }) });
    await page.getByRole('radio', { name: 'Custom' }).click();
    await page.getByRole('button', { name: 'Advanced settings' }).click();
    await page.locator('.track-art').first().click();
    await expect(page.getByTestId('player-toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
    // Readable dark text on light surfaces.
    const colors = await page.evaluate(() => ({
      text: getComputedStyle(document.querySelector('.track:not(.current) .track-title')!).color,
      input: getComputedStyle(document.querySelector('textarea, input[type=text]')!).backgroundColor,
      player: getComputedStyle(document.querySelector('.player')!).backgroundColor,
    }));
    expect(colors.text).toBe('rgb(27, 21, 48)');
    expect(colors.input).toMatch(/rgba\(255, 255, 255/);
    expect(colors.player).toMatch(/rgba\(255, 255, 255/);
    await page.screenshot({ path: 'test-results/light-components.png' });
  });
});

test.describe('Favorites and Library', () => {
  test('favorites persist across reload and filter the library', async ({ page }) => {
    await seeded(page);
    await page.getByRole('button', { name: 'Add Crystal Rain to favorites' }).click();
    await page.getByRole('button', { name: 'Add Amber Echoes to favorites' }).click();
    await expect(page.getByRole('button', { name: 'Remove Crystal Rain from favorites' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Remove Crystal Rain from favorites' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Amber Echoes from favorites' })).toBeVisible();

    await page.getByRole('radio', { name: 'Favorites' }).click();
    expect((await titles(page)).sort()).toEqual(['Amber Echoes', 'Crystal Rain']);
    await page.getByRole('button', { name: 'Remove Amber Echoes from favorites' }).click();
    expect(await titles(page)).toEqual(['Crystal Rain']);
    await page.getByRole('button', { name: 'Remove Crystal Rain from favorites' }).click();
    await expect(page.getByTestId('library-empty-filter')).toContainText('No favorites yet');
    await page.getByRole('radio', { name: 'All' }).click();
    await expect(page.locator('.track')).toHaveCount(6);
  });

  test('search by title and sort newest / oldest / title', async ({ page }) => {
    const original = await seeded(page);
    const search = page.getByLabel('Search songs by title');
    await search.fill('crystal');
    expect(await titles(page)).toEqual(['Crystal Rain']);
    await search.fill('ZEPHYR');
    expect(await titles(page)).toEqual(['Zephyr Lights']);
    await search.fill('no such song');
    await expect(page.getByTestId('library-empty-filter')).toHaveText('No songs match your search.');
    await search.fill('');

    const sort = page.getByLabel('Sort library');
    expect((await titles(page))[0]).toBe('Midnight Ocean'); // newest default
    await sort.selectOption('oldest');
    expect(await titles(page)).toEqual(['Amber Echoes', 'Yellow Kites', 'Banana Sunrise', 'Crystal Rain', 'Midnight Ocean', 'Zephyr Lights']);
    await sort.selectOption('title');
    const byTitle = (await page.locator('.task-card').evaluateAll((cards) => cards.map((c) => c.querySelector('.track-title')!.textContent)));
    expect(byTitle).toEqual(['Amber Echoes', 'Banana Sunrise', 'Midnight Ocean']);

    // Saved history is untouched by filtering/sorting.
    expect(await page.evaluate(() => localStorage.getItem('ams.history.v1'))).toBe(original);
  });

  test('existing saved songs are kept after upgrading', async ({ page }) => {
    const original = await seeded(page);
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(3);
    expect(await page.evaluate(() => localStorage.getItem('ams.history.v1'))).toBe(original);
  });
});

test.describe('Player', () => {
  async function seekNearEnd(page: Page) {
    await expect(page.getByTestId('seek')).toBeEnabled();
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="seek"]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, String(Number(el.max) - 0.4));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  const nowPlaying = (page: Page) => page.getByTestId('now-playing-title');
  const toggle = (page: Page) => page.getByTestId('player-toggle');

  test('repeat cycles off → all → one and persists', async ({ page }) => {
    await seeded(page);
    await page.locator('.track-art').first().click();
    const repeat = page.getByTestId('repeat');
    await expect(repeat).toHaveAttribute('data-repeat', 'off');
    await repeat.click();
    await expect(repeat).toHaveAttribute('data-repeat', 'all');
    await repeat.click();
    await expect(repeat).toHaveAttribute('data-repeat', 'one');
    await page.reload();
    await page.locator('.track-art').first().click();
    await expect(page.getByTestId('repeat')).toHaveAttribute('data-repeat', 'one');
  });

  test('repeat one replays the same song; repeat off stops at the end; repeat all wraps', async ({ page }) => {
    await seeded(page, { 'ams.prefs.v1': JSON.stringify({ repeat: 'one' }) });
    await page.locator('.track-art').first().click();
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
    await seekNearEnd(page);
    await page.waitForTimeout(1500);
    await expect(nowPlaying(page)).toHaveText('Midnight Ocean');
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Pause');

    // Last song in the queue with repeat off → stops.
    await page.getByTestId('repeat').click(); // one → off
    await expect(page.getByTestId('repeat')).toHaveAttribute('data-repeat', 'off');
    await page.locator('.track-art').last().click();
    await expect(nowPlaying(page)).toHaveText('Yellow Kites');
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
    await seekNearEnd(page);
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Play', { timeout: 5_000 });
    await expect(nowPlaying(page)).toHaveText('Yellow Kites');

    // Repeat all → wraps to the first song.
    await page.getByTestId('repeat').click(); // off → all
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
    await seekNearEnd(page);
    await expect(nowPlaying(page)).toHaveText('Midnight Ocean', { timeout: 5_000 });
  });

  test('shuffle picks other songs and persists; next/previous and seeking still work', async ({ page }) => {
    await seeded(page);
    await page.locator('.track-art').first().click();
    const shuffle = page.getByTestId('shuffle');
    await expect(shuffle).toHaveAttribute('aria-pressed', 'false');
    // Normal order: Next goes to the following song, Previous returns.
    await page.getByRole('button', { name: 'Next track' }).click();
    await expect(nowPlaying(page)).toHaveText('Zephyr Lights');
    await page.getByRole('button', { name: 'Previous track' }).click();
    await expect(nowPlaying(page)).toHaveText('Midnight Ocean');

    await shuffle.click();
    await expect(shuffle).toHaveAttribute('aria-pressed', 'true');
    const seen = new Set<string>();
    let prevTitle = await nowPlaying(page).innerText();
    for (let i = 0; i < 8; i++) {
      await page.getByRole('button', { name: 'Next track' }).click();
      await expect(nowPlaying(page)).not.toHaveText(prevTitle);
      prevTitle = await nowPlaying(page).innerText();
      seen.add(prevTitle);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    // Previous in shuffle goes back to the song played before.
    const before = await nowPlaying(page).innerText();
    await page.getByRole('button', { name: 'Next track' }).click();
    await page.getByRole('button', { name: 'Previous track' }).click();
    await expect(nowPlaying(page)).toHaveText(before);

    // Seeking shows clear elapsed / remaining time.
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
    await expect(page.getByTestId('player-remaining')).toHaveText(/^-\d:\d\d$/);

    await page.reload();
    await page.locator('.track-art').first().click();
    await expect(page.getByTestId('shuffle')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Composer', () => {
  test('Surprise Me fills a prompt without calling the API', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('credits')).toBeVisible(); // start-up requests have finished
    const apiCalls: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith('/api/')) apiCalls.push(u.pathname);
    });
    const prompt = page.getByLabel('Describe your song');
    await expect(prompt).toHaveValue('');
    await page.getByRole('button', { name: 'Surprise Me' }).click();
    const first = await prompt.inputValue();
    expect(first.length).toBeGreaterThan(40);
    await expect(page.locator('.chip.on')).toHaveCount(1); // a matching genre is suggested
    await page.getByRole('button', { name: 'Surprise Me' }).click();
    expect(await prompt.inputValue()).not.toBe(first);

    // Custom mode: fills the sound description, keeps the chosen genre.
    await page.getByRole('radio', { name: 'Custom' }).click();
    const chosen = await page.locator('.chip.on').innerText();
    await page.getByRole('button', { name: 'Surprise Me' }).click();
    expect((await page.getByLabel('Describe the sound').inputValue()).length).toBeGreaterThan(10);
    await expect(page.locator('.chip.on')).toHaveText(chosen);

    await page.waitForTimeout(500);
    expect(apiCalls).toEqual([]);
    await expect(page.getByTestId('task-card')).toHaveCount(0);
  });

  test('genre and vocal/instrumental preferences are remembered', async ({ page }) => {
    const original = await seeded(page);
    await page.getByRole('button', { name: 'Jazz', exact: true }).click();
    await page.getByRole('button', { name: 'Lo-fi', exact: true }).click();
    await page.getByRole('radio', { name: /Instrumental/ }).click();
    // Even if the unsent draft is lost, the preferences remain.
    await page.evaluate(() => localStorage.removeItem('ams.draft.v1'));
    await page.reload();
    await expect(page.locator('.chip.on')).toHaveText(['Lo-fi', 'Jazz']);
    await expect(page.getByRole('radio', { name: /Instrumental/ })).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ams.prefs.v1')!))).toMatchObject({ genres: ['Jazz', 'Lo-fi'], instrumental: true });
    expect(await page.evaluate(() => localStorage.getItem('ams.history.v1'))).toBe(original);
  });
});
