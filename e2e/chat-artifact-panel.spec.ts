import { expect, test } from '@playwright/test';

const FIXTURE_PATH = 'e2e/fixtures/chat-artifact-target.md';
const PDF_FIXTURE_PATH = 'e2e/fixtures/sample.pdf';
const PY_FIXTURE_PATH = 'e2e/fixtures/sample.py';
const DECK_FIXTURE_PATH = 'e2e/fixtures/sample-deck.html';
const BASENAME_FIXTURE = 'basename-smoke.md';

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

  test('artifact panel opens with inline preview and close', async ({ page }) => {
    await page.goto(`/?artifact-e2e=1&layout=single&artifact-open=${encodeURIComponent(FIXTURE_PATH)}`);

    const panel = page.getByTestId('chat-artifact-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('runtime-console-shell')).toHaveAttribute('class', /grid-cols-/);
    await expect(page.getByTestId('chat-artifact-filename')).toContainText('chat-artifact-target.md');
    await expect(page.getByTestId('chat-artifact-content')).toContainText('Chat Artifact E2E Fixture');
    await expect(page.getByTestId('chat-artifact-tab-preview')).toHaveCount(0);
    await expect(page.getByTestId('chat-artifact-tab-code')).toHaveCount(0);

    await page.getByTestId('chat-artifact-close').click();
    await expect(panel).toHaveCount(0);
  });

  test('workspace file API resolves bare playbook artifact basename', async ({ request }) => {
    const response = await request.get(
      `/api/workspace/file?path=${encodeURIComponent(BASENAME_FIXTURE)}`,
    );
    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      path: string;
      content: string | null;
      mime: string;
      encoding: 'utf8' | 'binary';
    };
    expect(body.path).toContain('basename-smoke.md');
    expect(body.encoding).toBe('utf8');
    expect(body.content).toContain('Bare filename E2E fixture');
  });

  test('workspace file API returns binary metadata for PDF fixture', async ({ request }) => {
    const response = await request.get(
      `/api/workspace/file?path=${encodeURIComponent(PDF_FIXTURE_PATH)}`,
    );
    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      path: string;
      content: string | null;
      mime: string;
      encoding: 'utf8' | 'binary';
      size: number;
    };
    expect(body.path).toBe(PDF_FIXTURE_PATH);
    expect(body.mime).toBe('application/pdf');
    expect(body.encoding).toBe('binary');
    expect(body.content).toBeNull();
    expect(body.size).toBeGreaterThan(0);
  });

  test('workspace file API streams PDF bytes with raw=1', async ({ request }) => {
    const response = await request.get(
      `/api/workspace/file?path=${encodeURIComponent(PDF_FIXTURE_PATH)}&raw=1`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');

    const bytes = await response.body();
    expect(bytes.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });

  test('workspace file API streams HTML bytes with raw=1', async ({ request }) => {
    const response = await request.get(
      `/api/workspace/file?path=${encodeURIComponent(DECK_FIXTURE_PATH)}&raw=1`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');

    const body = await response.text();
    expect(body).toContain('id="deck-viewport"');
    expect(body).toContain('fitDeckToViewport');
  });

  test('artifact panel renders PDF preview and download action', async ({ page }) => {
    await page.goto(
      `/?artifact-e2e=1&layout=single&artifact-open=${encodeURIComponent(PDF_FIXTURE_PATH)}`,
    );

    const panel = page.getByTestId('chat-artifact-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-artifact-filename')).toContainText('sample.pdf');
    await expect(page.getByTestId('chat-artifact-pdf-preview')).toBeVisible();
    await expect(page.getByTestId('chat-artifact-actions-menu')).toBeVisible();

    await page.getByTestId('chat-artifact-actions-menu').click();
    await expect(page.getByTestId('chat-artifact-action-download')).toBeVisible();
    await expect(page.getByTestId('chat-artifact-action-fullscreen')).toBeVisible();
  });

  test('artifact panel renders syntax-highlighted code viewer for python', async ({ page }) => {
    await page.goto(
      `/?artifact-e2e=1&layout=single&artifact-open=${encodeURIComponent(PY_FIXTURE_PATH)}`,
    );

    const panel = page.getByTestId('chat-artifact-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-artifact-filename')).toContainText('sample.py');

    const codeViewer = page.getByTestId('chat-artifact-code-viewer');
    await expect(codeViewer).toBeVisible({ timeout: 15_000 });
    await expect(codeViewer.locator('.monaco-editor')).toBeVisible({ timeout: 15_000 });
    await expect(codeViewer).toContainText('export_pdf');
  });

  test('artifact panel opens presentation fullscreen overlay for html deck', async ({ page }) => {
    await page.goto(
      `/?artifact-e2e=1&layout=single&artifact-open=${encodeURIComponent(DECK_FIXTURE_PATH)}`,
    );

    const panel = page.getByTestId('chat-artifact-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-artifact-filename')).toContainText('sample-deck.html');

    const inlinePreview = page.getByTestId('chat-artifact-html-preview');
    await expect(inlinePreview).toBeVisible();
    await expect(inlinePreview).toHaveAttribute('src', /raw=1/);

    await page.getByTestId('chat-artifact-actions-menu').click();
    await expect(page.getByTestId('chat-artifact-action-fullscreen')).toContainText('Presentation fullscreen');
    await expect(page.getByTestId('chat-artifact-action-open-external')).toBeVisible();
    await page.getByTestId('chat-artifact-action-fullscreen').click();

    const overlay = page.getByTestId('chat-artifact-fullscreen-overlay');
    await expect(overlay).toBeVisible({ timeout: 15_000 });

    const fullscreenPreview = page.getByTestId('chat-artifact-fullscreen-html');
    await expect(fullscreenPreview).toBeVisible();
    await expect(fullscreenPreview).toHaveAttribute('src', /raw=1/);

    const deckFrame = page.frameLocator('[data-testid="chat-artifact-fullscreen-html"]');
    await expect(deckFrame.locator('#deck-viewport')).toBeVisible({ timeout: 15_000 });

    const noHorizontalOverflow = await deckFrame.locator('html').evaluate((element) => {
      return element.scrollWidth <= element.clientWidth + 1;
    });
    expect(noHorizontalOverflow).toBe(true);

    await page.getByTestId('chat-artifact-fullscreen-close').click();
    await expect(overlay).toHaveCount(0);
  });
});
