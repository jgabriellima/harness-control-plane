import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

export const UI_CONFIG_FILENAME = 'ui.config.yaml';

export type ControlPlaneSurface = 'web' | 'desktop' | 'embedded';
export type ControlPlaneTheme = 'system' | 'light' | 'dark';

export interface UIConfig {
  apiVersion: 'proc.jambu/v1';
  kind: 'ControlPlaneUI';
  metadata?: {
    name?: string;
    product_id?: string;
  };
  presentation?: {
    title?: string;
    theme?: ControlPlaneTheme;
    locale?: string;
  };
  features?: Record<string, boolean>;
  panels?: {
    default_layout?: string;
    enabled?: string[];
  };
  distribution?: {
    surface?: ControlPlaneSurface;
    desktop?: {
      identifier?: string;
      window_title?: string;
    };
  };
  integrator?: {
    project_root?: string;
    hooks_module?: string;
    policy_profile?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertOptionalString(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`);
  }
}

function assertOptionalStringArray(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${path} must be an array of strings`);
  }
}

function assertOptionalRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
}

function parseAndValidateUIConfig(raw: unknown): UIConfig {
  if (!isRecord(raw)) {
    throw new Error('ui.config.yaml root must be an object');
  }

  if (raw.apiVersion !== 'proc.jambu/v1') {
    throw new Error('ui.config.yaml apiVersion must be proc.jambu/v1');
  }
  if (raw.kind !== 'ControlPlaneUI') {
    throw new Error('ui.config.yaml kind must be ControlPlaneUI');
  }

  assertOptionalRecord(raw.metadata, 'metadata');
  if (raw.metadata) {
    assertOptionalString(raw.metadata.name, 'metadata.name');
    assertOptionalString(raw.metadata.product_id, 'metadata.product_id');
  }

  assertOptionalRecord(raw.presentation, 'presentation');
  if (raw.presentation) {
    assertOptionalString(raw.presentation.title, 'presentation.title');
    assertOptionalString(raw.presentation.locale, 'presentation.locale');
    if (
      raw.presentation.theme !== undefined &&
      raw.presentation.theme !== 'system' &&
      raw.presentation.theme !== 'light' &&
      raw.presentation.theme !== 'dark'
    ) {
      throw new Error('presentation.theme must be one of: system, light, dark');
    }
  }

  assertOptionalRecord(raw.features, 'features');
  if (raw.features) {
    for (const [featureName, enabled] of Object.entries(raw.features)) {
      if (typeof enabled !== 'boolean') {
        throw new Error(`features.${featureName} must be a boolean`);
      }
    }
  }

  assertOptionalRecord(raw.panels, 'panels');
  if (raw.panels) {
    assertOptionalString(raw.panels.default_layout, 'panels.default_layout');
    assertOptionalStringArray(raw.panels.enabled, 'panels.enabled');
  }

  assertOptionalRecord(raw.distribution, 'distribution');
  if (raw.distribution) {
    if (
      raw.distribution.surface !== undefined &&
      raw.distribution.surface !== 'web' &&
      raw.distribution.surface !== 'desktop' &&
      raw.distribution.surface !== 'embedded'
    ) {
      throw new Error('distribution.surface must be one of: web, desktop, embedded');
    }

    assertOptionalRecord(raw.distribution.desktop, 'distribution.desktop');
    if (raw.distribution.desktop) {
      assertOptionalString(raw.distribution.desktop.identifier, 'distribution.desktop.identifier');
      assertOptionalString(raw.distribution.desktop.window_title, 'distribution.desktop.window_title');
    }
  }

  assertOptionalRecord(raw.integrator, 'integrator');
  if (raw.integrator) {
    assertOptionalString(raw.integrator.project_root, 'integrator.project_root');
    assertOptionalString(raw.integrator.hooks_module, 'integrator.hooks_module');
    assertOptionalString(raw.integrator.policy_profile, 'integrator.policy_profile');
  }

  return raw as UIConfig;
}

export function uiConfigPath(projectRoot: string): string {
  return join(projectRoot, UI_CONFIG_FILENAME);
}

export function hasUIConfig(projectRoot: string): boolean {
  return existsSync(uiConfigPath(projectRoot));
}

export async function loadUIConfig(projectRoot: string): Promise<UIConfig> {
  const configPath = uiConfigPath(projectRoot);
  const raw = await readFile(configPath, 'utf8');
  const parsed = parseYaml(raw) as unknown;
  return parseAndValidateUIConfig(parsed);
}
