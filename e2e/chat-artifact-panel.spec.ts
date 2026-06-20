import { expect, test } from '@playwright/test';

const FIXTURE_PATH = 'e2e/fixtures/chat-artifact-target.md';

test.describe('Chat artifact split panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('runtime-hub-layout-mode');
      localStorage.removeItem('runtime-hub-pane-ids');
    });
  });

  test('workspace file API returns fixture content', async ({ request }) => {
    const response = await request.get(`/api/workspace/file?path=${encodeURIComponent(FIXTURE_PATH)}`);
    expect(response.status()).toBe(200);

    const body = (await response.json()) as { path: string; content: string; mime: string };
    expect(body.path).toBe(FIXTURE_PATH);
    expect(body.content).toContain('Chat Artifact E2E Fixture');
    expect(body.mime).toBe('text/markdown');
  });

  test('missing file returns 404 from workspace API', async ({ request }) => {
    const response = await request.get(
      '/api/workspace/file?path=e2e%2Ffixtures%2Fdoes-not-exist.md',
    );
    expect(response.status()).toBe(404);
  });

  test('assistant message renders clickable file reference', async ({ page }) => {
    await page.goto('/?artifact-e2e=1&layout=single');
    await page.waitForSelector('[data-testid="chat-message-assistant"]', { timeout: 15_000 });

    const fileReference = page.getByTestId('chat-file-reference');
    await expect(fileReference).toBeVisible();
    await expect(fileReference).toHaveAttribute('data-file-path', FIXTURE_PATH);
  });

  test('artifact panel opens with preview, code tab, and close', async ({ page }) => {
    await page.goto(`/?artifact-e2e=1&layout=single&artifact-open=${encodeURIComponent(FIXTURE_PATH)}`);

    const panel = page.getByTestId('chat-artifact-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('runtime-console-shell')).toHaveAttribute('class', /grid-cols-/);
    await expect(page.getByTestId('chat-artifact-filename')).toContainText('chat-artifact-target.md');
    await expect(page.getByTestId('chat-artifact-content')).toContainText('Chat Artifact E2E Fixture');

    await page.getByTestId('chat-artifact-tab-code').click();
    await expect(page.getByTestId('chat-artifact-content')).toContainText('# Chat Artifact E2E Fixture');

    await page.getByTestId('chat-artifact-close').click();
    await expect(panel).toHaveCount(0);
  });
});
