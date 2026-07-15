import assert from 'node:assert/strict';
import test from 'node:test';

import { dataTransferHasFiles } from './useComposerFileDrop.ts';

test('dataTransferHasFiles returns true when Files type is present', () => {
  const dataTransfer = {
    types: ['Files', 'text/plain'],
  } as DataTransfer;

  assert.equal(dataTransferHasFiles(dataTransfer), true);
});

test('dataTransferHasFiles returns false when Files type is absent', () => {
  const dataTransfer = {
    types: ['text/plain'],
  } as DataTransfer;

  assert.equal(dataTransferHasFiles(dataTransfer), false);
});
