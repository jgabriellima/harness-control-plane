import { expect, test } from '@playwright/test';

const BASE = process.env.RUNTIME_CONSOLE_BASE_URL ?? 'http://127.0.0.1:4321';

test.describe('presentation rendering', () => {
  test('renders markdown tables, mermaid, and openui markdown fallback without debug panels', async ({
    page,
  }) => {
    await page.goto(`${BASE}/?presentation-e2e=1&layout=single`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await expect(page.getByTestId('chat-pane')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('chat-message-assistant')).toBeVisible({ timeout: 15_000 });

    const assistantMessage = page.getByTestId('chat-message-assistant').last();
    await expect(assistantMessage.locator('table')).toHaveCount(2, { timeout: 15_000 });
    await expect(assistantMessage.locator('th', { hasText: 'Tier' })).toBeVisible();
    await expect(assistantMessage.locator('th', { hasText: 'Role' })).toBeVisible();

    await expect(page.getByTestId('mermaid-diagram')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-render-mode="markdown-fallback"]')).toBeVisible();

    await expect(page.getByText('Raw OpenUI source')).toHaveCount(0);
    await expect(page.getByText(/parse-failed|parser\//i)).toHaveCount(0);
  });
});
