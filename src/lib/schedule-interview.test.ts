import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseScheduleReadyBlock } from './schedule-interview.ts';

describe('parseScheduleReadyBlock', () => {
  it('parses schedule-ready fenced JSON', () => {
    const content = [
      'Before I schedule it, here is the registration payload:',
      '```schedule-ready',
      '{"title":"Daily brief","description":"Send daily AI briefing","cron":"0 9 * * *","icon":"sun"}',
      '```',
      'Registered.',
    ].join('\n');

    const parsed = parseScheduleReadyBlock(content);
    assert.deepEqual(parsed, {
      title: 'Daily brief',
      description: 'Send daily AI briefing',
      cron: '0 9 * * *',
      icon: 'sun',
    });
  });

  it('returns null when block is missing required fields', () => {
    const parsed = parseScheduleReadyBlock('```schedule-ready\n{"title":"Only title"}\n```');
    assert.equal(parsed, null);
  });

  it('parses generic json fence with schedule fields', () => {
    const content = [
      'Confirmed. Registration payload:',
      '```json',
      '{"title":"Daily tech briefing","description":"Produce a technical briefing on AI","cron":"0 12 * * *"}',
      '```',
    ].join('\n');

    const parsed = parseScheduleReadyBlock(content);
    assert.deepEqual(parsed, {
      title: 'Daily tech briefing',
      description: 'Produce a technical briefing on AI',
      cron: '0 12 * * *',
      icon: undefined,
    });
  });
});
