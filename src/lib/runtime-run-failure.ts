import { getCachedServerSdkMessageContext, sdkDispatchAuthMessage, sdkLocalSessionAuthFailedMessage } from './runtime-sdk-messages';

const FAILED_RUN_STATUSES = new Set(['error', 'failed', 'expired']);

export function isFailedRunStatus(status: string): boolean {
  return FAILED_RUN_STATUSES.has(status.trim().toLowerCase());
}

export function isRunAuthFailureText(text: string | undefined): boolean {
  if (!text?.trim()) {
    return false;
  }

  const normalized = text.toLowerCase();
  return (
    normalized.includes('authentication error') ||
    normalized.includes('[unauthenticated]') ||
    normalized.includes('invalid api key') ||
    normalized.includes('not authenticated') ||
    normalized.includes('log out and back in')
  );
}

export function formatRunFailureMessage(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return 'A execução do assistente falhou antes de produzir uma resposta.';
  }

  const ctx = getCachedServerSdkMessageContext();

  if (isRunAuthFailureText(trimmed)) {
    const normalized = trimmed.toLowerCase();
    if (normalized.includes('log out and back in') || normalized.includes('logging out and back in')) {
      return sdkLocalSessionAuthFailedMessage(ctx);
    }
    return sdkDispatchAuthMessage(ctx);
  }

  return trimmed;
}

export interface RunTerminalOutcome {
  status: string;
  cancelled: boolean;
  authFailed: boolean;
  failed: boolean;
  errorMessage?: string;
}

export function mergeRunFailureDetail(rawResult?: string, errorDetail?: string): string | undefined {
  const resultText = rawResult?.trim();
  if (resultText) {
    return resultText;
  }
  return errorDetail?.trim() || undefined;
}

export function classifyRunTerminalOutcome(
  status: string,
  rawResult?: string,
  errorDetail?: string,
): RunTerminalOutcome {
  const failureDetail = mergeRunFailureDetail(rawResult, errorDetail);
  const cancelled = status.trim().toLowerCase() === 'cancelled';
  const authFailed = isRunAuthFailureText(failureDetail);
  const failed = isFailedRunStatus(status) || authFailed;
  const errorMessage = failed ? formatRunFailureMessage(failureDetail) : undefined;

  return {
    status,
    cancelled,
    authFailed,
    failed,
    errorMessage,
  };
}
