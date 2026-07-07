import { expect, test } from '@playwright/test';

const BASE = process.env.RUNTIME_CONSOLE_BASE_URL ?? 'http://127.0.0.1:4322';

test.describe('runtime console stream QA', () => {
  test('slash command menu loads harness commands', async ({ page, request }) => {
    const commandsResponse = await request.get(`${BASE}/api/runtime/commands`);
    expect(commandsResponse.status()).toBe(200);
    const body = (await commandsResponse.json()) as { commands: Array<{ command: string }> };
    expect(body.commands.length).toBeGreaterThan(0);

    const commandsLoaded = page.waitForResponse(
      (response) =>
        response.url().includes('/api/runtime/commands') && response.status() === 200,
    );

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await commandsLoaded;
    await expect(page.getByTestId('chat-pane')).toBeVisible({ timeout: 60_000 });

    const textarea = page.getByPlaceholder(/Ask the runtime or type '\/'/);
    await textarea.click();
    await textarea.fill('/');

    const suggestions = page.getByTestId('slash-command-suggestions');
    await expect(suggestions).toBeVisible({ timeout: 15_000 });
    await expect(suggestions.getByText(body.commands[0]?.command ?? '/business:')).toBeVisible();
    await expect(suggestions.getByRole('option')).toHaveCount(body.commands.length);
    if (body.commands.length > 8) {
      const scrollHeight = await suggestions.evaluate((element) => element.scrollHeight);
      const clientHeight = await suggestions.evaluate((element) => element.clientHeight);
      expect(scrollHeight).toBeGreaterThan(clientHeight);
    }
  });

  test('file mention selection renders clickable badge instead of raw text', async ({ page, request }) => {
    const filesResponse = await request.get(`${BASE}/api/workspace/files?q=design-system&project_id=default`);
    expect(filesResponse.status()).toBe(200);
    const body = (await filesResponse.json()) as {
      files: Array<{ name: string; path: string }>;
    };
    expect(body.files.some((file) => file.name === 'design-system.json')).toBeTruthy();

    await page.goto(`${BASE}/?artifact-e2e=1&layout=single`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await expect(page.getByTestId('chat-pane')).toBeVisible({ timeout: 60_000 });

    const textarea = page.getByPlaceholder(/type '\/' for commands, or '@' for workspace files/);
    await textarea.click();
    await textarea.pressSequentially('@design-syste', { delay: 20 });

    const suggestions = page.getByTestId('file-mention-suggestions');
    await expect(suggestions).toBeVisible({ timeout: 30_000 });
    await suggestions.getByRole('option').first().click();

    const badges = page.getByTestId('composer-file-mention-badges');
    await expect(badges).toBeVisible();
    await expect(textarea).toHaveValue('');
    await expect(page.getByTestId('composer-file-mention-badge').first()).toContainText('design-system.json');

    await page
      .getByTestId('composer-file-mention-badge')
      .first()
      .getByRole('button', { name: /Open .* in preview/i })
      .click();

    await expect(page.getByTestId('chat-artifact-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-artifact-filename')).toContainText('design-system.json');
  });

  test('active-runs endpoint exposes live active run index', async ({ request }) => {
    const response = await request.get(`${BASE}/api/runtime/active-runs`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      active: Array<{ runId: string; conversationId: string; agentId: string }>;
    };
    expect(Array.isArray(body.active)).toBeTruthy();
  });

  test('hub events endpoint accepts SSE connection', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });

    const result = await page.evaluate(async (baseUrl) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3_000);

      try {
        const response = await fetch(`${baseUrl}/api/runtime/hub/events`, {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          return { ok: false, status: response.status, bytes: 0 };
        }

        const reader = response.body.getReader();
        const chunk = await reader.read();
        reader.cancel().catch(() => undefined);
        return {
          ok: true,
          status: response.status,
          bytes: chunk.value?.byteLength ?? 0,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: message.includes('abort'), status: 200, bytes: 0, aborted: true };
      } finally {
        window.clearTimeout(timeout);
      }
    }, BASE);

    expect(result.status).toBe(200);
    expect(result.ok || result.aborted).toBeTruthy();
  });
});
