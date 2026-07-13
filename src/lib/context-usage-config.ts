import type { UIConfig } from './ui-config';

export const DEFAULT_CONTEXT_WINDOW_SIZE = 200_000;

const MODEL_CONTEXT_WINDOW_SIZES: Record<string, number> = {
  'composer-2.5': 200_000,
  'composer-2': 200_000,
  'composer-1.5': 200_000,
  'composer-1': 200_000,
};

const MIN_TRUSTED_CONTEXT_WINDOW = 100_000;

function readProcessEnv(name: string): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }

  const value = process.env[name];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveContextUsagePanelEnabled(uiConfig: UIConfig): boolean {
  const featureFlag = uiConfig.features?.context_usage_panel;
  if (featureFlag === false) {
    return false;
  }
  return true;
}

export function resolveRuntimeModelId(): string {
  return readProcessEnv('CURSOR_RUNTIME_MODEL') ?? 'composer-2.5';
}

export function resolveContextWindowSizeForModel(modelId?: string | null): number {
  const normalized = modelId?.trim().toLowerCase() ?? resolveRuntimeModelId().toLowerCase();
  return MODEL_CONTEXT_WINDOW_SIZES[normalized] ?? DEFAULT_CONTEXT_WINDOW_SIZE;
}

export function normalizeDecodedContextWindowSize(input: {
  maxTokens: number;
  usedTokens: number;
  modelId?: string | null;
}): number {
  const modelWindow = resolveContextWindowSizeForModel(input.modelId);
  const decoded = input.maxTokens;

  if (
    decoded >= MIN_TRUSTED_CONTEXT_WINDOW &&
    decoded >= input.usedTokens
  ) {
    return decoded;
  }

  return modelWindow;
}
