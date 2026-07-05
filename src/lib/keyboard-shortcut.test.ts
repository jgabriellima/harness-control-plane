import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseKeyboardShortcut } from './keyboard-shortcut.ts';

describe('keyboard-shortcut', () => {
  it('parses Alt+V', () => {
    const parsed = parseKeyboardShortcut('Alt+V');
    assert.deepEqual(parsed, {
      mod: false,
      shift: false,
      alt: true,
      ctrl: false,
      key: 'v',
    });
  });
});
