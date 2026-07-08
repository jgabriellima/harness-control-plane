import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatCronLabel, parseScheduleIntent } from './schedule-intent.ts';

describe('parseScheduleIntent', () => {
  it('detects daily schedule and strips timing phrase from description', () => {
    const parsed = parseScheduleIntent(
      'Scan my emails every day and let me know anything that needs attention',
    );
    assert.equal(parsed.needsSchedule, false);
    assert.equal(parsed.cron, '0 9 * * *');
    assert.match(parsed.description.toLowerCase(), /scan my emails/);
    assert.equal(parsed.icon, 'mail');
  });

  it('detects weekly Friday schedule', () => {
    const parsed = parseScheduleIntent(
      'Send me high-signal papers every Friday',
    );
    assert.equal(parsed.cron, '0 9 * * 5');
    assert.equal(parsed.needsSchedule, false);
  });

  it('requires schedule when timing is absent', () => {
    const parsed = parseScheduleIntent('Refresh my beach-running routine');
    assert.equal(parsed.needsSchedule, true);
    assert.equal(parsed.cron, null);
  });
});

describe('formatCronLabel', () => {
  it('formats daily cron', () => {
    assert.match(formatCronLabel('0 9 * * *'), /Daily at 09:00 UTC/);
  });
});
