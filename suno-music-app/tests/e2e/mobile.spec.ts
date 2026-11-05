import { expect, test } from '@playwright/test';

test('mobile layout: no horizontal overflow, full flow works', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.getByLabel('Describe your song').fill('Sunny acoustic folk song about road trips');
  await page.getByRole('button', { name: 'Folk', exact: true }).tap();
  await page.getByRole('button', { name: 'Generate song' }).tap();
  const card = page.getByTestId('task-card').first();
  await expect(card).toHaveAttribute('data-phase', 'complete', { timeout: 25_000 });
  await card.locator('.track-art').first().tap();
  const player = page.getByRole('region', { name: 'Now playing' });
  await expect(player).toBeInViewport();
  await expect(page.getByTestId('player-toggle')).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: false });
  await page.getByRole('radio', { name: 'Custom' }).tap();
  await page.screenshot({ path: 'test-results/mobile-custom.png', fullPage: true });
  expect(await overflow()).toBeLessThanOrEqual(0);
});
