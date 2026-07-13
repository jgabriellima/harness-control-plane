import { expect, test } from '@playwright/test';

const BASE = process.env.RUNTIME_CONSOLE_BASE_URL ?? 'http://127.0.0.1:4322';
const CONVERSATION_ID = 'e2e-activity-conversation';

const MOCK_TOOL_CALLS = [
  {
    callId: 'call-shell',
    runId: 'run-1',
    turnNumber: 1,
    tool: 'shell',
    status: 'completed',
    recordedAt: '2026-07-12T21:47:59.000Z',
    startedAt: '2026-07-12T21:47:58.000Z',
    durationMs: 1200,
    args: { command: 'python3 check_accounts.py' },
    result: { stdout: 'Unauthorized: Authentication failed or missing credentials.' },
  },
  {
    callId: 'call-grep',
    runId: 'run-1',
    turnNumber: 2,
    tool: 'grep',
    status: 'completed',
    recordedAt: '2026-07-12T21:47:50.000Z',
    startedAt: '2026-07-12T21:47:49.800Z',
    durationMs: 195,
    args: { pattern: 'confluence' },
    result: { matches: 3 },
  },
  {
    callId: 'call-glob',
    runId: 'run-1',
    turnNumber: 3,
    tool: 'glob',
    status: 'running',
    recordedAt: '2026-07-12T21:48:10.000Z',
    startedAt: '2026-07-12T21:48:10.000Z',
  },
];

async function seedConversation(page: import('@playwright/test').Page): Promise<void> {
  await page.route(`**/api/conversations/${CONVERSATION_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: CONVERSATION_ID,
        title: 'Confluence access check',
        projectId: 'default',
        agentId: 'agent-e2e',
        updatedAt: '2026-07-12T21:47:59.000Z',
        messages: [],
      }),
    });
  });
}

async function openActivityPanel(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Open activity report' }).click();
}

test.describe('tool activity toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await seedConversation(page);

    await page.route('**/api/runtime/observability?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ toolCalls: MOCK_TOOL_CALLS }),
      });
    });

    await page.addInitScript(() => {
      localStorage.removeItem('runtime-hub-layout-mode');
      localStorage.removeItem('runtime-hub-pane-ids');
    });
  });

  test('renders search, filter, and sort controls above activity list', async ({ page }) => {
    await page.goto(`${BASE}/conversation/${CONVERSATION_ID}?layout=single`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await expect(page.getByTestId('chat-pane')).toBeVisible({ timeout: 60_000 });
    await openActivityPanel(page);

    const panel = page.getByTestId('tool-activity-report-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('tool-activity-toolbar')).toBeVisible();
    await expect(page.getByTestId('tool-activity-search')).toBeVisible();
    await expect(page.getByTestId('tool-activity-status-filter')).toBeVisible();
    await expect(page.getByTestId('tool-activity-tool-filter')).toBeVisible();
    await expect(page.getByTestId('tool-activity-sort')).toBeVisible();
    await expect(page.getByTestId('tool-activity-list')).toBeVisible();
    await expect(page.getByTestId('tool-row-call-shell')).toBeVisible();
    await expect(page.getByTestId('tool-row-call-grep')).toBeVisible();
  });

  test('filters invocations by search query and status', async ({ page }) => {
    await page.goto(`${BASE}/conversation/${CONVERSATION_ID}?layout=single`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await expect(page.getByTestId('chat-pane')).toBeVisible({ timeout: 60_000 });
    await openActivityPanel(page);

    await expect(page.getByTestId('tool-activity-report-panel')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('tool-activity-search').fill('unauthorized');
    await expect(page.getByTestId('tool-row-call-shell')).toBeVisible();
    await expect(page.getByTestId('tool-row-call-grep')).toHaveCount(0);
    await expect(page.getByTestId('tool-activity-filter-summary')).toContainText('Showing 1 of 3');

    await page.getByTestId('tool-activity-search').fill('');
    await page.getByTestId('tool-activity-status-filter').click();
    await page.getByRole('option', { name: 'Running' }).click();
    await expect(page.getByTestId('tool-row-call-glob')).toBeVisible();
    await expect(page.getByTestId('tool-row-call-shell')).toHaveCount(0);
  });

  test('shows friendly copy instead of internal observability errors', async ({ page }) => {
    await page.unroute('**/api/runtime/observability?**');
    await page.route('**/api/runtime/observability?**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error:
            "Command failed: sqlite3 /Users/dev/.cursor/projects/foo/index.db SELECT run_id FROM runs WHERE agent_id='agent-e2e';",
        }),
      });
    });

    await page.goto(`${BASE}/conversation/${CONVERSATION_ID}?layout=single`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await expect(page.getByTestId('chat-pane')).toBeVisible({ timeout: 60_000 });
    await openActivityPanel(page);

    const errorPanel = page.getByTestId('tool-activity-error');
    await expect(errorPanel).toBeVisible({ timeout: 15_000 });
    await expect(errorPanel).toContainText('Unable to load activity right now');
    await expect(errorPanel).not.toContainText('/Users/dev');
    await expect(errorPanel).not.toContainText('sqlite3');
  });
});
