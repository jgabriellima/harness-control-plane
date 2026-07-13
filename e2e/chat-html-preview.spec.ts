import { expect, test } from '@playwright/test';

const BASE = process.env.RUNTIME_CONSOLE_BASE_URL ?? 'http://127.0.0.1:4321';

test.describe('Chat inline HTML preview', () => {
  test('renders fenced HTML as iframe preview instead of raw code', async ({ page }) => {
    await page.goto(`${BASE}/?html-preview-e2e=1&layout=single`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await expect(page.getByTestId('chat-pane')).toBeVisible({ timeout: 60_000 });

    const preview = page.getByTestId('chat-html-preview');
    await expect(preview).toBeVisible({ timeout: 30_000 });

    const frame = page.frameLocator('[data-testid="chat-html-preview-frame"]');
    await expect(frame.locator('h1')).toContainText('AI Team Assessment', { timeout: 15_000 });

    await page.getByTestId('chat-html-preview-tab-source').click();
    await expect(preview.locator('code')).toContainText('<!DOCTYPE html>');
  });
});
