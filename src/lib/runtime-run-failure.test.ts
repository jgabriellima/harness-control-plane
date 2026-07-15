import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyRunTerminalOutcome,
  formatRunFailureMessage,
  isFailedRunStatus,
  isRunAuthFailureText,
} from './runtime-run-failure.ts';
import { resolveServerSdkMessageContext, cacheServerSdkMessageContext } from './runtime-sdk-messages.ts';

describe('runtime-run-failure', () => {
  it('detects authentication failures from SDK run result text', () => {
    assert.equal(
      isRunAuthFailureText(
        'Authentication error If you are logged in, try logging out and back in.',
      ),
      true,
    );
    assert.equal(isRunAuthFailureText('[unauthenticated] Error'), true);
    assert.equal(isRunAuthFailureText('network timeout'), false);
  });

  it('classifies terminal ERROR runs as failed with operator-facing message', () => {
    cacheServerSdkMessageContext(
      resolveServerSdkMessageContext({
        distributionSurface: 'desktop',
        presentationTitle: 'Tailwind',
        operatorContext: false,
      }),
    );

    const outcome = classifyRunTerminalOutcome(
      'error',
      'Authentication error If you are logged in, try logging out and back in.',
    );

    assert.equal(outcome.failed, true);
    assert.equal(outcome.authFailed, true);
    assert.match(outcome.errorMessage ?? '', /Restabelecendo|reconect|Runtime/i);
  });

  it('maps failed statuses consistently', () => {
    assert.equal(isFailedRunStatus('error'), true);
    assert.equal(isFailedRunStatus('ERROR'), true);
    assert.equal(isFailedRunStatus('finished'), false);
  });

  it('classifies terminal ERROR runs using persisted store error detail', () => {
    cacheServerSdkMessageContext(
      resolveServerSdkMessageContext({
        distributionSurface: 'desktop',
        presentationTitle: 'Tailwind',
        operatorContext: false,
      }),
    );

    const outcome = classifyRunTerminalOutcome(
      'error',
      undefined,
      'Authentication error If you are logged in, try logging out and back in.',
    );

    assert.equal(outcome.failed, true);
    assert.equal(outcome.authFailed, true);
    assert.match(outcome.errorMessage ?? '', /Restabelecendo|reconect|Runtime/i);
  });

  it('uses generic failure copy when SDK omits result text', () => {
    const outcome = classifyRunTerminalOutcome('error');
    assert.equal(outcome.failed, true);
    assert.match(outcome.errorMessage ?? '', /falhou/i);
  });

  it('formats API key failures with shippable desktop copy', () => {
    cacheServerSdkMessageContext(
      resolveServerSdkMessageContext({
        distributionSurface: 'desktop',
        presentationTitle: 'Tailwind',
        operatorContext: false,
      }),
    );

    const message = formatRunFailureMessage('[unauthenticated] Error');
    assert.doesNotMatch(message, /app\/\.env/i);
    assert.match(message, /Runtime API Key|Configurações/i);
  });
});
