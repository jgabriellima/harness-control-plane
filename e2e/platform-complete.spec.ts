import { expect, test, type APIRequestContext } from '@playwright/test';
import http from 'node:http';

interface DispatchResponse {
  execution_id: string;
  status: string;
  run_id: string;
  workflow_id: string;
  error?: string;
}

interface ExecutionDetailResponse {
  id: string;
  manifest: {
    status: string;
    intent: string;
  };
  error?: string;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'blocked']);

async function dispatchStubExecution(request: APIRequestContext): Promise<DispatchResponse> {
  const response = await request.post('/api/executions', {
    data: {
      objective: 'platform-complete e2e stub dispatch',
      project_id: 'default',
      workflow_id: 'demo-stub',
      runtime: 'stub',
    },
  });

  expect(response.status()).toBe(200);
  const body = (await response.json()) as DispatchResponse;
  expect(body.execution_id).toBeTruthy();
  expect(body.status).toBe('QUEUED');
  expect(body.workflow_id).toBe('demo-stub');
  return body;
}

async function waitForExecutionManifest(
  request: APIRequestContext,
  executionId: string,
  timeoutMs = 30_000,
): Promise<ExecutionDetailResponse> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await request.get(`/api/executions/${encodeURIComponent(executionId)}`);
    if (response.status() === 200) {
      return (await response.json()) as ExecutionDetailResponse;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Execution manifest ${executionId} not found within ${timeoutMs}ms`);
}

async function waitForTerminalExecution(
  request: APIRequestContext,
  executionId: string,
  timeoutMs = 90_000,
): Promise<ExecutionDetailResponse> {
  const deadline = Date.now() + timeoutMs;
  await waitForExecutionManifest(request, executionId, Math.min(timeoutMs, 30_000));

  while (Date.now() < deadline) {
    const response = await request.get(`/api/executions/${encodeURIComponent(executionId)}`);
    expect(response.status()).toBe(200);

    const detail = (await response.json()) as ExecutionDetailResponse;
    if (TERMINAL_STATUSES.has(detail.manifest.status)) {
      return detail;
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Execution ${executionId} did not reach terminal state within ${timeoutMs}ms`);
}

async function collectSseEvents(executionId: string, timeoutMs = 60_000): Promise<number> {
  const port = Number(process.env.PLAYWRIGHT_PORT ?? 4321);

  return new Promise((resolve, reject) => {
    let buffer = '';
    const request = http.get(
      `http://127.0.0.1:${port}/api/executions/${encodeURIComponent(executionId)}/events`,
      (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`SSE endpoint returned ${response.statusCode ?? 'unknown'}`));
          return;
        }

        response.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const dataLines = buffer.split('\n').filter((line) => line.startsWith('data:'));
          if (dataLines.length > 0) {
            request.destroy();
            resolve(dataLines.length);
          }
        });

        response.on('end', () => {
          const dataLines = buffer.split('\n').filter((line) => line.startsWith('data:'));
          resolve(dataLines.length);
        });
      },
    );

    request.on('error', reject);

    setTimeout(() => {
      request.destroy();
      const dataLines = buffer.split('\n').filter((line) => line.startsWith('data:'));
      if (dataLines.length > 0) {
        resolve(dataLines.length);
        return;
      }
      reject(new Error(`SSE did not emit data events within ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

test.describe('platform complete flow', () => {
  test('POST dispatch returns queued execution job', async ({ request }) => {
    const dispatch = await dispatchStubExecution(request);
    expect(dispatch.run_id).toBe(dispatch.execution_id);
  });

  test('SSE stream emits events for dispatched execution', async ({ request }) => {
    const dispatch = await dispatchStubExecution(request);
    await waitForExecutionManifest(request, dispatch.execution_id);
    const eventCount = await collectSseEvents(dispatch.execution_id);
    expect(eventCount).toBeGreaterThan(0);
  });

  test('dispatch → SSE → terminal state end-to-end', async ({ request, page }) => {
    const dispatch = await dispatchStubExecution(request);
    await waitForExecutionManifest(request, dispatch.execution_id);

    const ssePromise = collectSseEvents(dispatch.execution_id);

    const terminal = await waitForTerminalExecution(request, dispatch.execution_id);
    expect(terminal.manifest.intent).toContain('platform-complete e2e');

    const eventCount = await ssePromise;
    expect(eventCount).toBeGreaterThan(0);

    await page.goto(
      `/execution/${encodeURIComponent(dispatch.execution_id)}?tab=tracing`,
      {
        waitUntil: 'load',
        timeout: 120_000,
      },
    );

    await expect(page.getByTestId('execution-view')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('execution-header')).toBeVisible();
    await expect(page.getByTestId('runtime-activity-stream')).toBeVisible();
  });

  test('context panel widgets load from live API', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load', timeout: 120_000 });
    await expect(page.getByTestId('context-panel')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('context-widget-attention')).toBeVisible();
    await expect(page.getByTestId('context-widget-health')).toBeVisible();
  });

  test('settings page renders runtime profile', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'load', timeout: 120_000 });
    await expect(page.getByTestId('settings-view')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('settings-section-project')).toBeVisible();
    await expect(page.getByTestId('settings-section-runtime-profile')).toBeVisible();
  });
});
