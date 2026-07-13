import { expect, test } from '@playwright/test';

const BASE = process.env.RUNTIME_CONSOLE_BASE_URL ?? 'http://127.0.0.1:4321';
const CONTEXT_CONVERSATION_ID = 'conv-20260713T130519-94huwc';

test.describe('Context usage markdown preview', () => {
  test('renders memory and rule content as markdown tables instead of raw pipes', async ({ page }) => {
    await page.goto(`${BASE}/conversation/${CONTEXT_CONVERSATION_ID}?layout=single`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await expect(page.getByTestId('chat-pane')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('context-usage-bar')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('chat-pane-context-usage').click();

    const panel = page.getByTestId('context-usage-report-panel');
    await expect(panel).toBeVisible({ timeout: 30_000 });

    await panel.getByTestId('context-usage-row-rules').click();
    await expect(panel.getByTestId('context-usage-rule-children')).toBeVisible({ timeout: 15_000 });

    const architectureRow = panel
      .locator('[data-testid^="context-usage-instruction-child-"]')
      .filter({ hasText: 'Architecture Memory' })
      .first();
    await architectureRow.click();

    const markdownPreview = panel.getByTestId(
      'context-usage-content-preview-.cursor/memories/architecture.md',
    );
    await expect(markdownPreview).toBeVisible({ timeout: 15_000 });
    await expect(markdownPreview.getByTestId('context-usage-content-preview-markdown')).toBeVisible();
    await expect(markdownPreview.locator('table').first()).toBeVisible();
    await expect(markdownPreview).not.toContainText('| --- |');
  });
});
