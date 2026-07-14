import { expect, test } from '@playwright/test';

test.describe('Design daemon health', () => {
  test('GET /api/design/health returns structured payload', async ({ request }) => {
    const response = await request.get('/api/design/health');
    expect(response.ok()).toBeTruthy();

    const payload = (await response.json()) as {
      ok: boolean;
      port?: number;
      version?: string;
      error?: string;
    };

    expect(typeof payload.ok).toBe('boolean');
    if (payload.ok) {
      expect(payload.port).toBe(7456);
      expect(typeof payload.version).toBe('string');
    } else {
      expect(typeof payload.error).toBe('string');
    }
  });
});
