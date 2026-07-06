import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveVoiceTranscriptionPaths } from './voice-transcription.ts';

describe('resolveVoiceTranscriptionPaths', () => {
  it('places venv and warm script under .business/runtime/voice-transcription', () => {
    const paths = resolveVoiceTranscriptionPaths('/tmp/jambu-app');
    assert.match(paths.runtimeDir, /\.business[/\\]runtime[/\\]voice-transcription$/);
    assert.match(paths.venvDir, /\.venv$/);
    assert.match(paths.requirementsPath, /requirements\.txt$/);
    assert.match(paths.statusPath, /status\.json$/);
    assert.match(paths.warmScriptPath, /warm\.py$/);
  });
});
