import { l as isRunAuthFailureText, b as sdkRuntimeReconnectingMessage, g as getCachedServerSdkMessageContext } from './runtime-run-failure_BzuNxIfC.mjs';

function extractErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}
const INTERNAL_ERROR_PATTERNS = [
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
  /\bphase:\s*\S+/i,
  /\brequest_id:\s*\S+/i
];
function looksLikeInternalErrorMessage(message) {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed));
}
const ARTIFACT_UNAVAILABLE = "This file couldn't be opened. It may have been moved or removed.";
function toUserFacingArtifactErrorMessage(error, fallback = ARTIFACT_UNAVAILABLE) {
  const raw = extractErrorMessage(error).trim();
  if (raw.length === 0) {
    return fallback;
  }
  const lower = raw.toLowerCase();
  if (lower === "file not found" || lower.includes("enoent")) {
    return ARTIFACT_UNAVAILABLE;
  }
  return toUserFacingErrorMessage(error, fallback);
}
const CONTEXT_USAGE_UNAVAILABLE = "Unable to load context usage right now. Try again in a moment.";
const RUNTIME_DISPATCH_UNAVAILABLE = "We couldn't start this run. Try again in a moment.";
const RUNTIME_STREAM_FAILED = "Something went wrong while generating the response. Try again in a moment.";
const RUNTIME_RUN_INCOMPLETE = "The assistant run ended before producing a response. Try again in a moment.";
function toUserFacingContextUsageErrorMessage(error) {
  return toUserFacingErrorMessage(error, CONTEXT_USAGE_UNAVAILABLE);
}
function toUserFacingRuntimeDispatchErrorMessage(error) {
  return toUserFacingErrorMessage(error, RUNTIME_DISPATCH_UNAVAILABLE);
}
function toUserFacingRuntimeStreamErrorMessage(error) {
  const raw = extractErrorMessage(error).trim();
  if (raw.length > 0 && isRunAuthFailureText(raw)) {
    return sdkRuntimeReconnectingMessage(getCachedServerSdkMessageContext());
  }
  return toUserFacingErrorMessage(error, RUNTIME_STREAM_FAILED);
}
function runtimeRunIncompleteMessage() {
  return RUNTIME_RUN_INCOMPLETE;
}
function logInternalRuntimeError(scope, error, fields) {
  const raw = extractErrorMessage(error).trim();
  if (raw.length === 0 && !fields) {
    return;
  }
  if (fields) {
    console.error(`[runtime:${scope}]`, error, fields);
    return;
  }
  console.error(`[runtime:${scope}]`, error);
}
function toUserFacingErrorMessage(error, fallback) {
  const raw = extractErrorMessage(error).trim();
  if (raw.length === 0) {
    return fallback;
  }
  const lower = raw.toLowerCase();
  if (lower.includes("database is locked")) {
    return "The runtime store is temporarily busy. Try again in a moment.";
  }
  if (lower === "failed to fetch" || lower === "load failed") {
    return "Runtime observability is temporarily unreachable. Live activity may still appear.";
  }
  if (looksLikeInternalErrorMessage(raw)) {
    return fallback;
  }
  if (raw.length <= 160) {
    return raw;
  }
  return fallback;
}

export { toUserFacingArtifactErrorMessage as a, toUserFacingRuntimeStreamErrorMessage as b, toUserFacingRuntimeDispatchErrorMessage as c, toUserFacingContextUsageErrorMessage as d, logInternalRuntimeError as l, runtimeRunIncompleteMessage as r, toUserFacingErrorMessage as t };
