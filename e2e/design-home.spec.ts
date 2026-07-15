import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

test.describe('Design studio home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design');
    await page.waitForLoadState('networkidle');
  });

  test('renders hero, brief input, and skill chips', async ({ page }) => {
    await expect(page.getByTestId('design-shell')).toBeVisible();
    await expect(page.getByTestId('design-home-view')).toBeVisible();
    await expect(page.getByTestId('design-brief-input')).toBeVisible();
    const chips = page.getByTestId('design-skill-chips');
    await expect(chips).toBeVisible();
    await expect(chips.locator('button').first()).toBeVisible();
    await expect(page.getByTestId('design-activity-rail')).toBeVisible();
  });

  test('shows recent projects section', async ({ page }) => {
    await expect(page.getByTestId('design-recent-projects')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent projects' })).toBeVisible();
  });

  test('hero region visual baseline', async ({ page }) => {
    const hero = page.getByTestId('design-home-view');
    await expect(hero).toBeVisible();
    await expect(hero).toHaveScreenshot('design-home-hero.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('skill chips region visual baseline', async ({ page }) => {
    await expect(page.getByTestId('design-skill-chips')).toHaveScreenshot('design-home-chips.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('recent projects region visual baseline', async ({ page }) => {
    await expect(page.getByTestId('design-recent-projects')).toHaveScreenshot('design-home-recent.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});

test.describe('Design catalog routes', () => {
  test('design systems library renders', async ({ page }) => {
    await page.goto('/design/design-systems');
    await expect(page.getByTestId('design-systems-view')).toBeVisible();
    await expect(page.getByTestId('design-system-create-cta')).toBeVisible();
  });

  test('design system create wizard renders', async ({ page }) => {
    await page.goto('/design/design-systems/create');
    await expect(page.getByTestId('design-system-create-view')).toBeVisible();
    await expect(page.getByTestId('design-system-create-submit')).toBeVisible();
  });

  test('plugins library renders', async ({ page }) => {
    await page.goto('/design/plugins');
    await expect(page.getByTestId('design-plugins-view')).toBeVisible();
    await expect(page.getByTestId('design-plugin-install-source')).toBeVisible();
  });

  test('automations library renders', async ({ page }) => {
    await page.goto('/design/automations');
    await expect(page.getByTestId('design-automations-view')).toBeVisible();
    await expect(page.getByTestId('design-automation-create-toggle')).toBeVisible();
  });
});
