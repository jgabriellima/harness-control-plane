import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { upsertParts, createOpenUISurfacePart, createTextPart } from './message-parts.ts';

describe('message parts reducer', () => {
  it('upserts text and openui parts by id', () => {
    const surface = createOpenUISurfacePart('surface-1', 'root = Stack([])');
    const parts = upsertParts(undefined, [createTextPart('Hello'), surface]);
    const updated = upsertParts(parts, [
      createTextPart('Hello world'),
      createOpenUISurfacePart('surface-1', 'root = Stack([card])', 'streaming'),
    ]);

    assert.equal(updated.length, 2);
    assert.equal(updated[0]?.type, 'text');
    if (updated[0]?.type === 'text') {
      assert.equal(updated[0].text, 'Hello world');
    }
    if (updated[1]?.type === 'openui') {
      assert.equal(updated[1].source, 'root = Stack([card])');
      assert.equal(updated[1].status, 'streaming');
    }
  });
});
