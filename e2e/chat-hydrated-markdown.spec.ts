import { expect, test } from '@playwright/test';

const BASE = process.env.RUNTIME_CONSOLE_BASE_URL ?? 'http://127.0.0.1:4321';
const EXECUTIVE_REPORT_CONVERSATION_ID = 'conv-20260713T002520-i0ezri';

test.describe('Hydrated transcript markdown', () => {
  test('renders saved assistant markdown instead of raw hash headings', async ({ page }) => {
    await page.goto(`${BASE}/conversation/${EXECUTIVE_REPORT_CONVERSATION_ID}?layout=single`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await expect(page.getByTestId('chat-pane')).toBeVisible({ timeout: 60_000 });

    const executiveMessage = page
      .getByTestId('chat-message-assistant')
      .filter({ hasText: 'Executive Assessment' })
      .first();

    await expect(executiveMessage).toBeVisible({ timeout: 30_000 });
    await expect(executiveMessage.locator('.chat-markdown h1')).toContainText(
      'Executive Assessment',
      { timeout: 15_000 },
    );
    await expect(executiveMessage.locator('.chat-markdown')).not.toContainText('# Executive');
  });
});
