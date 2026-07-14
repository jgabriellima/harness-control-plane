import { expect, test } from '@playwright/test';

function randomId(): string {
  return `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

test.describe('Design studio', () => {
  test('studio renders 3-pane layout for a seeded project', async ({ page, request }) => {
    const health = await request.get('/api/design/health');
    const healthPayload = (await health.json()) as { ok: boolean };
    test.skip(!healthPayload.ok, 'Design daemon is not running');

    const projectId = randomId();
    const createResponse = await request.post('/api/design/projects', {
      data: {
        id: projectId,
        name: 'E2E studio project',
        skillId: 'web-prototype',
        pendingPrompt: 'Create a one-page pricing hero',
        skipDiscoveryBrief: true,
        metadata: { kind: 'prototype' },
        conversationMode: 'design',
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    await page.goto(`/design/projects/${encodeURIComponent(projectId)}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('design-studio-view')).toBeVisible();
    await expect(page.getByTestId('design-studio-messages')).toBeVisible();
    await expect(page.getByTestId('design-studio-composer')).toBeVisible();
    await expect(page.getByTestId('design-studio-preview-frame')).toBeVisible();
  });

  test('preview and code toggles switch surfaces', async ({ page, request }) => {
    const health = await request.get('/api/design/health');
    const healthPayload = (await health.json()) as { ok: boolean };
    test.skip(!healthPayload.ok, 'Design daemon is not running');

    const projectId = randomId();
    const createResponse = await request.post('/api/design/projects', {
      data: {
        id: projectId,
        name: 'E2E toggle project',
        skillId: 'web-prototype',
        pendingPrompt: 'Pricing page',
        skipDiscoveryBrief: true,
        metadata: { kind: 'prototype' },
        conversationMode: 'design',
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    await page.goto(`/design/projects/${encodeURIComponent(projectId)}`);
    await expect(page.getByTestId('design-studio-preview-toggle')).toBeVisible();
    await expect(page.getByTestId('design-studio-preview-frame')).toBeVisible();

    await page.getByTestId('design-studio-code-toggle').click();
    await expect(page.getByTestId('design-studio-preview-frame')).toHaveCount(0);
  });
});
