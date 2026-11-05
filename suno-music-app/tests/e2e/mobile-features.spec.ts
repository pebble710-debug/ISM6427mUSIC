import { expect, test } from '@playwright/test';

test('mobile: theme switch, library toolbar and player controls fit and work', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  const sw = page.getByRole('radiogroup', { name: 'Appearance' });
  await expect(sw).toBeVisible();
  await sw.getByRole('radio', { name: 'Light' }).tap();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');

  await page.getByRole('button', { name: 'Surprise Me' }).tap();
  await page.getByRole('button', { name: 'Generate song' }).tap();
  const card = page.getByTestId('task-card').first();
  await expect(card).toHaveAttribute('data-phase', 'complete', { timeout: 25_000 });
  await card.getByTestId('favorite').first().tap();
  await page.getByRole('radio', { name: 'Favorites' }).tap();
  await expect(page.locator('.track')).toHaveCount(1);
  await page.locator('.track-art').first().tap();

  for (const id of ['shuffle', 'repeat', 'player-toggle']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44); // comfortable touch targets
    await expect(page.getByTestId(id)).toBeInViewport();
  }
  await page.getByTestId('repeat').tap();
  await expect(page.getByTestId('repeat')).toHaveAttribute('data-repeat', 'all');
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/mobile-light.png' });

  await sw.getByRole('radio', { name: 'Dark' }).tap();
  await page.waitForTimeout(600);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/mobile-dark.png' });
});
