export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '';
}

const INTERNAL_ERROR_PATTERNS: RegExp[] = [
  /\/Users\//,
  /\/home\//,
  /\.db\b/i,
  /\bSELECT\b[\s\S]*\bFROM\b/i,
  /Command failed:/i,
  /\bsqlite3\b/i,
  /Error: in prepare/i,
  /\bENOENT\b/,
  /\bEACCES\b/,
  /\bENOTFOUND\b/,
  /\bat\s+[^\s]+\s+\(/,
];

export function looksLikeInternalErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const ARTIFACT_UNAVAILABLE =
  "This file couldn't be opened. It may have been moved or removed.";

export function toUserFacingArtifactErrorMessage(
  error: unknown,
  fallback: string = ARTIFACT_UNAVAILABLE,
): string {
  const raw = extractErrorMessage(error).trim();
  if (raw.length === 0) {
    return fallback;
  }

  const lower = raw.toLowerCase();
  if (lower === 'file not found' || lower.includes('enoent')) {
    return ARTIFACT_UNAVAILABLE;
  }

  return toUserFacingErrorMessage(error, fallback);
}

const ACTIVITY_UNAVAILABLE = 'Unable to load activity right now. Try again in a moment.';
const ACTIVITY_PARTIAL = 'Some activity details may be incomplete.';

export function toUserFacingActivityErrorMessage(error: unknown): string {
  return toUserFacingErrorMessage(error, ACTIVITY_UNAVAILABLE);
}

export function activityPanelWarningMessage(error: unknown): string {
  const raw = extractErrorMessage(error).trim();
  if (raw.length === 0) {
    return ACTIVITY_PARTIAL;
  }

  if (looksLikeInternalErrorMessage(raw)) {
    return ACTIVITY_PARTIAL;
  }

  return toUserFacingErrorMessage(error, ACTIVITY_PARTIAL);
}

export function logInternalActivityError(scope: string, error: unknown): void {
  const raw = extractErrorMessage(error).trim();
  if (raw.length === 0) {
    return;
  }

  console.error(`[activity:${scope}]`, error);
}

export function toUserFacingErrorMessage(error: unknown, fallback: string): string {
  const raw = extractErrorMessage(error).trim();
  if (raw.length === 0) {
    return fallback;
  }

  const lower = raw.toLowerCase();

  if (lower.includes('database is locked')) {
    return 'The runtime store is temporarily busy. Try again in a moment.';
  }

  if (lower === 'failed to fetch' || lower === 'load failed') {
    return 'Runtime observability is temporarily unreachable. Live activity may still appear.';
  }

  if (looksLikeInternalErrorMessage(raw)) {
    return fallback;
  }

  if (raw.length <= 160) {
    return raw;
  }

  return fallback;
}
