const DEFAULT_CONTEXT_WINDOW_SIZE = 2e5;
const MODEL_CONTEXT_WINDOW_SIZES = {
  "composer-2.5": 2e5,
  "composer-2": 2e5,
  "composer-1.5": 2e5,
  "composer-1": 2e5
};
const MIN_TRUSTED_CONTEXT_WINDOW = 1e5;
function readProcessEnv(name) {
  if (typeof process === "undefined") {
    return void 0;
  }
  const value = process.env[name];
  if (typeof value !== "string") {
    return void 0;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function resolveContextUsagePanelEnabled(uiConfig) {
  const featureFlag = uiConfig.features?.context_usage_panel;
  if (featureFlag === false) {
    return false;
  }
  return true;
}
function resolveRuntimeModelId() {
  return readProcessEnv("CURSOR_RUNTIME_MODEL") ?? "composer-2.5";
}
function resolveContextWindowSizeForModel(modelId) {
  const normalized = modelId?.trim().toLowerCase() ?? resolveRuntimeModelId().toLowerCase();
  return MODEL_CONTEXT_WINDOW_SIZES[normalized] ?? DEFAULT_CONTEXT_WINDOW_SIZE;
}
function normalizeDecodedContextWindowSize(input) {
  const modelWindow = resolveContextWindowSizeForModel(input.modelId);
  const decoded = input.maxTokens;
  if (decoded >= MIN_TRUSTED_CONTEXT_WINDOW && decoded >= input.usedTokens) {
    return decoded;
  }
  return modelWindow;
}

export { resolveContextWindowSizeForModel as a, normalizeDecodedContextWindowSize as n, resolveContextUsagePanelEnabled as r };
