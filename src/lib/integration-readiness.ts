import { readFile } from 'node:fs/promises';

import { parse as parseYaml } from 'yaml';

import {
  composioConnectionEnvVar,
  isComposioSlotConnected,
  isComposioSlotCredentialVerified,
  loadIntegrationComposioConfig,
  verifyComposioSlotRemote,
} from './composio-connection';
import { loadCredentialManifest } from './credential-manifest';
import { probeCredentialPresence } from './credential-store';
import { loadReadinessSnapshot } from './harness-reader';
import type { ReadinessSlot, ReadinessSnapshot } from './harness-types';
import { resolveHarnessBinding } from './harness-binding';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function computeOverall(slots: ReadinessSlot[]): string {
  if (slots.length === 0) {
    return 'unknown';
  }
  if (slots.every((slot) => slot.ready)) {
    return 'pass';
  }
  if (slots.some((slot) => slot.ready)) {
    return 'warn';
  }
  return 'fail';
}

function mergeSlot(live: ReadinessSlot, fromFile?: ReadinessSlot): ReadinessSlot {
  if (!fromFile) {
    return live;
  }
  return {
    slotId: live.slotId,
    provider: live.provider || fromFile.provider,
    status: live.status || fromFile.status,
    secretsMissing: live.secretsMissing,
    ready: live.ready,
    oauthConnected: live.oauthConnected,
    oauthVerified: live.oauthVerified,
  };
}

export async function buildLiveIntegrationReadinessSlots(
  workspaceRoot?: string,
  projectId = 'default',
): Promise<ReadinessSlot[]> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const raw = parseYaml(await readFile(binding.dslPath, 'utf8'));
  const integrations =
    isRecord(raw) && isRecord(raw.integrations) ? raw.integrations : {};

  const manifest = await loadCredentialManifest(binding.workspaceRoot);
  const slots: ReadinessSlot[] = [];

  for (const [slotId, slotRaw] of Object.entries(integrations)) {
    if (!isRecord(slotRaw)) {
      continue;
    }

    const provider = asString(slotRaw.provider, 'unknown');
    const yamlStatus = asString(slotRaw.status, 'unknown');
    const composioConfig = await loadIntegrationComposioConfig(
      slotId,
      provider,
      binding.workspaceRoot,
    );

    const secretsMissing: string[] = [];

    if (composioConfig?.enabled) {
      const connected = await isComposioSlotConnected(slotId, projectId);
      if (!connected) {
        secretsMissing.push(composioConnectionEnvVar(slotId, projectId));
        slots.push({
          slotId,
          provider,
          status: yamlStatus,
          secretsMissing,
          ready: false,
        });
        continue;
      }

      const remote = await verifyComposioSlotRemote({
        slotId,
        provider,
        projectId,
        workspaceRoot: binding.workspaceRoot,
      });
      const verified = isComposioSlotCredentialVerified(remote);
      if (!verified) {
        secretsMissing.push('composio_reconnect_required');
      }

      slots.push({
        slotId,
        provider,
        status: verified ? 'active' : connected ? 'reconnect' : 'pending',
        secretsMissing,
        ready: verified,
        oauthConnected: connected,
        oauthVerified: verified,
      });
      continue;
    }

    const slotSecrets =
      manifest?.secrets.filter((entry) => entry.slot_id === slotId && entry.required) ?? [];

    for (const secret of slotSecrets) {
      const [presence] = await probeCredentialPresence(
        [
          {
            env_var: secret.env_var,
            storage: secret.storage,
            required: secret.required,
            description: secret.description,
          },
        ],
        provider,
      );
      if (!presence.present) {
        secretsMissing.push(secret.env_var);
      }
    }

    const activationMode = asString(slotRaw.activation_mode);
    if (activationMode === 'browser' && slotSecrets.length === 0) {
      secretsMissing.push('browser_session_required');
    }

    slots.push({
      slotId,
      provider,
      status: yamlStatus,
      secretsMissing,
      ready: secretsMissing.length === 0 && yamlStatus === 'active',
    });
  }

  return slots.sort((left, right) => left.slotId.localeCompare(right.slotId));
}

export async function resolveReadinessSnapshot(
  workspaceRoot?: string,
  projectId = 'default',
): Promise<ReadinessSnapshot> {
  const [fileSnapshot, liveSlots] = await Promise.all([
    loadReadinessSnapshot(),
    buildLiveIntegrationReadinessSlots(workspaceRoot, projectId),
  ]);

  const fileBySlot = new Map(
    (fileSnapshot?.slots ?? []).map((slot) => [slot.slotId, slot] as const),
  );

  const slots = liveSlots.map((live) => mergeSlot(live, fileBySlot.get(live.slotId)));

  return {
    apiVersion: fileSnapshot?.apiVersion ?? 'business.jambu/v1',
    kind: fileSnapshot?.kind ?? 'ReadinessSnapshot',
    generatedAt: new Date().toISOString(),
    overall: computeOverall(slots),
    doctorMode: fileSnapshot?.doctorMode,
    slots,
  };
}
