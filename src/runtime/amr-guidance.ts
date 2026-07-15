// Failure UI mapping — ported from open-design/apps/web/src/runtime/amr-guidance.ts
// with HCP/Tailwind product naming.

export const HOSTED_MODEL_CONSOLE_URL = 'https://open-design.ai/amr/wallet?source=harness';

export type RunFailurePrimaryAction =
  | 'retry'
  | 'authorize'
  | 'recharge'
  | 'upgrade'
  | 'launch-terminal-auth'
  | 'launch-terminal-switch-model'
  | 'none';

export interface RunFailureUi {
  primaryAction: RunFailurePrimaryAction;
  title: string;
  message: string | null;
  secondaryRetry: boolean;
  showSwitchCard: boolean;
}

const PROMOTE_HOSTED_CODES = new Set<string>([
  'AGENT_AUTH_REQUIRED',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
]);

function retryWithGuidance(title: string, message: string): RunFailureUi {
  return {
    primaryAction: 'retry',
    title,
    message,
    secondaryRetry: false,
    showSwitchCard: false,
  };
}

function switchToAlternative(title: string, message: string): RunFailureUi {
  return {
    primaryAction: 'none',
    title,
    message,
    secondaryRetry: false,
    showSwitchCard: true,
  };
}

const AGENT_AGNOSTIC_FAILURE_UI: Record<string, RunFailureUi> = {
  AGENT_UNAVAILABLE: retryWithGuidance(
    'CLI not installed',
    'Install the required agent CLI on your machine, then retry.',
  ),
  AGENT_PROMPT_TOO_LARGE: retryWithGuidance(
    'Prompt too large',
    'Reduce context or shorten your request, then retry.',
  ),
  AMR_MODEL_UNAVAILABLE: retryWithGuidance(
    'Model unavailable',
    'Switch to a different model, then retry.',
  ),
  TOOL_LOOP_DETECTED: retryWithGuidance(
    'Tool loop detected',
    'Check the target resource and retry with a narrower task.',
  ),
  ROLE_MARKER_HALLUCINATION: retryWithGuidance(
    'Invalid output',
    'The model produced an invalid response. Retry usually recovers.',
  ),
  AGENT_RUNTIME_DEF_INVALID: retryWithGuidance(
    'Runtime configuration error',
    'The agent runtime definition is invalid. Contact support.',
  ),
};

const DETAIL_FAILURE_UI: Record<string, RunFailureUi> = {
  hard_quota: switchToAlternative(
    'Usage limit reached',
    'Your provider quota is exhausted. Switch to the hosted model or wait for reset.',
  ),
  workspace_credits_exhausted: switchToAlternative(
    'Workspace credits exhausted',
    'Workspace credits are depleted. Switch to the hosted model or top up.',
  ),
  cli_not_installed: retryWithGuidance(
    'CLI not installed',
    'Install the required agent CLI on your machine, then retry.',
  ),
};

const AGENT_AGNOSTIC_DETAIL_FAILURE_UI: Record<string, RunFailureUi> = {
  timeout: retryWithGuidance(
    'Run timed out',
    'The run exceeded the time limit. Retry with a smaller task.',
  ),
  inactivity_timeout: retryWithGuidance(
    'Run stalled',
    'The agent stopped producing output. Retry to continue.',
  ),
  empty_output: retryWithGuidance(
    'Empty response',
    'The run completed without output. Retry usually recovers.',
  ),
  session_resume_expired: retryWithGuidance(
    'Session expired',
    'The resumed session expired. Retry starts a fresh run.',
  ),
  git_bash_missing: retryWithGuidance(
    'Git Bash required',
    'Install Git for Windows (Git Bash), then retry.',
  ),
};

export function resolveRunFailureUi(
  code: string | null | undefined,
  detail: string | null | undefined,
  agentId: string | null | undefined,
): RunFailureUi {
  const agnostic = typeof code === 'string' ? AGENT_AGNOSTIC_FAILURE_UI[code] : undefined;
  if (agnostic) {
    return agnostic;
  }

  const agnosticDetail =
    typeof detail === 'string' ? AGENT_AGNOSTIC_DETAIL_FAILURE_UI[detail] : undefined;
  if (agnosticDetail) {
    return agnosticDetail;
  }

  if (agentId === 'amr') {
    if (code === 'AMR_AUTH_REQUIRED') {
      return {
        primaryAction: 'authorize',
        title: 'Sign-in required',
        message: 'The hosted model is not signed in. Authorize to continue.',
        secondaryRetry: false,
        showSwitchCard: false,
      };
    }
    if (code === 'AMR_INSUFFICIENT_BALANCE') {
      return {
        primaryAction: 'recharge',
        title: 'Insufficient balance',
        message: 'Your hosted model wallet balance is too low. Top up, then retry.',
        secondaryRetry: true,
        showSwitchCard: false,
      };
    }
    if (code === 'AMR_TIER_UPGRADE_REQUIRED') {
      return {
        primaryAction: 'upgrade',
        title: 'Upgrade required',
        message: 'Your plan does not include this model. Upgrade to continue.',
        secondaryRetry: true,
        showSwitchCard: false,
      };
    }
    return {
      primaryAction: 'retry',
      title: 'Model call failed',
      message: null,
      secondaryRetry: false,
      showSwitchCard: false,
    };
  }

  const detailUi = typeof detail === 'string' ? DETAIL_FAILURE_UI[detail] : undefined;
  if (detailUi) {
    return detailUi;
  }

  if (code === 'AGENT_CONNECTION_DROPPED') {
    return retryWithGuidance(
      'Connection dropped',
      'The connection was lost mid-response. Retry to continue.',
    );
  }

  if (code === 'AGENT_AUTH_REQUIRED' || code === 'UNAUTHORIZED') {
    return {
      primaryAction: 'retry',
      title: 'Sign-in required',
      message: 'The local agent is not authenticated. Sign in locally, then retry.',
      secondaryRetry: false,
      showSwitchCard: true,
    };
  }

  if (code === 'RATE_LIMITED') {
    return {
      primaryAction: 'retry',
      title: 'Rate limited',
      message: 'The provider rate limit was hit. Wait briefly, then retry.',
      secondaryRetry: false,
      showSwitchCard: true,
    };
  }

  if (code === 'UPSTREAM_UNAVAILABLE') {
    return {
      primaryAction: 'retry',
      title: 'Upstream unavailable',
      message: 'The model service is temporarily unavailable. Retry shortly.',
      secondaryRetry: false,
      showSwitchCard: true,
    };
  }

  const promote = typeof code === 'string' && PROMOTE_HOSTED_CODES.has(code);
  return {
    primaryAction: 'retry',
    title: 'Model call failed',
    message: null,
    secondaryRetry: false,
    showSwitchCard: promote,
  };
}

export function inferFailureCodeFromMessage(message: string): string | null {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('insufficient balance') ||
    normalized.includes('amr_insufficient_balance')
  ) {
    return 'AMR_INSUFFICIENT_BALANCE';
  }
  if (normalized.includes('usage limit') || normalized.includes('quota')) {
    return 'RATE_LIMITED';
  }
  if (
    normalized.includes('authentication') ||
    normalized.includes('not authenticated') ||
    normalized.includes('sign in')
  ) {
    return 'AGENT_AUTH_REQUIRED';
  }
  if (normalized.includes('upstream') || normalized.includes('unavailable')) {
    return 'UPSTREAM_UNAVAILABLE';
  }
  return null;
}
