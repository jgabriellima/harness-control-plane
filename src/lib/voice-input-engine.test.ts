import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapVoiceRecognitionError } from './voice-input-engine.ts';

describe('mapVoiceRecognitionError', () => {
  it('returns null for no-speech', () => {
    assert.equal(mapVoiceRecognitionError('no-speech'), null);
  });

  it('maps permission errors on web', () => {
    assert.equal(mapVoiceRecognitionError('not-allowed'), 'Microphone access blocked');
  });
});
