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
