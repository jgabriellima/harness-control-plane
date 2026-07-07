import { readFile } from 'node:fs/promises';

import { parse as parseYaml } from 'yaml';

import * as Sentry from '@sentry/astro';

import { resolveHarnessBinding } from './harness-binding';
import { loadBusinessConfig } from './harness-reader';
import { loadComputerUseStatus } from './runtime-computer-use-preferences';
import type { ComputerUsePreferences } from './runtime-computer-use-types';

export interface IntegrationSlotSummary {
  slotId: string;
  provider: string;
  status: string;
  tenantScope: string | null;
}

export interface RuntimeProfileSummary {
  engine: string;
  specializationLayer: string;
  commandCount: number;
  commands: string[];
}

export interface ComputerUseSettingsSummary {
  enabled: boolean;
  requireConsent: boolean;
  hostControlEnabled: boolean;
  allowForegroundCursor: boolean;
  driverOnPath: boolean;
  consentedAt: string | null;
  active: boolean;
  setupPhase: string;
  setupReady: boolean;
}

export interface SettingsSnapshot {
  project: {
    name: string;
    description: string;
    status: string;
    initialized: string | null;
  };
  execution: {
    defaultWorkflow: string | null;
  };
  runtime: RuntimeProfileSummary | null;
  integrations: IntegrationSlotSummary[];
  computerUse: ComputerUseSettingsSummary | null;
  generatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function parseIntegrations(root: Record<string, unknown>): IntegrationSlotSummary[] {
  const integrations = root.integrations;
  if (!isRecord(integrations)) {
    return [];
  }

  return Object.entries(integrations)
    .map(([slotId, raw]) => {
      if (!isRecord(raw)) {
        return null;
      }
      return {
        slotId,
        provider: asString(raw.provider, 'unknown'),
        status: asString(raw.status, 'unknown'),
        tenantScope:
          typeof raw.tenant_scope === 'string'
            ? raw.tenant_scope
            : raw.tenant_scope === null
              ? null
              : null,
      };
    })
    .filter((entry): entry is IntegrationSlotSummary => entry !== null)
    .sort((left, right) => left.slotId.localeCompare(right.slotId));
}

function parseRuntimeProfile(root: Record<string, unknown>): RuntimeProfileSummary | null {
  const runtime = root.runtime;
  if (!isRecord(runtime)) {
    return null;
  }

  const commandsRaw = runtime.commands;
  const commands = Array.isArray(commandsRaw)
    ? commandsRaw.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return {
    engine: asString(runtime.engine, 'unknown'),
    specializationLayer: asString(runtime.specialization_layer, ''),
    commandCount: commands.length,
    commands,
  };
}

function parseComputerUseContract(root: Record<string, unknown>): { enabled: boolean; requireConsent: boolean } | null {
  const runtime = root.runtime;
  if (!isRecord(runtime)) {
    return null;
  }

  const computerUse = runtime.computer_use;
  if (!isRecord(computerUse)) {
    return null;
  }

  return {
    enabled: computerUse.enabled === true,
    requireConsent: computerUse.require_consent !== false,
  };
}

function buildComputerUseSummary(
  contract: { enabled: boolean; requireConsent: boolean } | null,
  status: Awaited<ReturnType<typeof loadComputerUseStatus>> | null,
): ComputerUseSettingsSummary | null {
  if (!contract?.enabled) {
    return null;
  }

  const preferences: ComputerUsePreferences = status?.preferences ?? {
    hostControlEnabled: false,
    allowForegroundCursor: false,
    consentedAt: null,
    updatedAt: new Date().toISOString(),
  };

  return {
    enabled: contract.enabled,
    requireConsent: contract.requireConsent,
    hostControlEnabled: preferences.hostControlEnabled,
    allowForegroundCursor: preferences.allowForegroundCursor,
    driverOnPath: status?.driverOnPath ?? false,
    consentedAt: preferences.consentedAt,
    active: status?.active ?? false,
    setupPhase: status?.setup.phase ?? 'idle',
    setupReady: status?.setup.ready ?? false,
  };
}

export async function loadSettingsSnapshot(): Promise<SettingsSnapshot> {
  return Sentry.startSpan({ name: 'loadSettingsSnapshot', op: 'fs.read' }, async () => {
    const binding = await resolveHarnessBinding();
    const [config, rawYaml] = await Promise.all([
      loadBusinessConfig(binding.workspaceRoot),
      readFile(binding.dslPath, 'utf8'),
    ]);

    const parsed = parseYaml(rawYaml);
    const root = isRecord(parsed) ? parsed : {};

    const execution = config.execution;
    const defaultWorkflow =
      execution?.defaultWorkflow ?? execution?.default_workflow ?? null;

    const computerUseContract = parseComputerUseContract(root);
    let computerUseStatus: Awaited<ReturnType<typeof loadComputerUseStatus>> | null = null;

    if (computerUseContract?.enabled) {
      try {
        computerUseStatus = await loadComputerUseStatus(binding.workspaceRoot);
      } catch {
        computerUseStatus = null;
      }
    }

    return {
      project: {
        name: config.project.name,
        description: config.project.description,
        status: config.status,
        initialized: config.initialized,
      },
      execution: {
        defaultWorkflow,
      },
      runtime: parseRuntimeProfile(root),
      integrations: parseIntegrations(root),
      computerUse: buildComputerUseSummary(computerUseContract, computerUseStatus),
      generatedAt: new Date().toISOString(),
    };
  });
}
