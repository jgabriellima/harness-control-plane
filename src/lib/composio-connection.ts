import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import {
  composioConnectAvailable,
  deleteConnectedAccount,
  getComposioApiKey,
  getConnectedAccountDetails,
  listAllConnectedAccountsForToolkit,
  listConnectedAccountsForToolkit,
  purgeAllConnectedAccountsForToolkit,
  toolkitSlugFromSlotId,
} from './composio-auth-config';
import type { ComposioAuthContract } from './composio-integration-contract';
import { parseComposioAuthContract } from './composio-integration-contract';
import { probeComposioToolkitCredential } from './composio-credential-probe';
import {
  isMalformedAtlassianSubdomain,
  loadComposioConnectionDataForSlot,
} from './composio-tenant-connection-data';
import { resolveHarnessBinding } from './harness-binding';
import { desktopKeychainHas, desktopKeychainSet, isDesktopKeychainContext } from './desktop-keychain';
import { storeCredential, probeCredentialPresence } from './credential-store';
import type { SecretStorage } from './credential-manifest';

const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3';

export type ComposioSlotFailureReason =
  | 'subdomain_malformed'
  | 'credential_invalid'
  | 'remote_inactive'
  | null;

export class ComposioSubdomainMalformedError extends Error {
  readonly code = 'composio_subdomain_malformed' as const;

  constructor(
    public readonly expectedSubdomain: string,
    public readonly receivedSubdomain: string,
  ) {
    super(
      `Confluence subdomain must be "${expectedSubdomain}" — not "${receivedSubdomain}". ` +
        'On the Composio page enter only the site slug before .atlassian.net.',
    );
    this.name = 'ComposioSubdomainMalformedError';
  }
}

export function normalizeComposioProjectId(projectId?: string): string {
  const trimmed = projectId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'default';
}

/** Legacy env var before per-workspace scoping (default project only). */
export function legacyComposioConnectionEnvVar(slotId: string): string {
  return `COMPOSIO_CONNECTED_${slotId.trim().replace(/\./g, '_').toUpperCase()}`;
}

export function composioConnectionEnvVar(slotId: string, projectId?: string): string {
  const project = normalizeComposioProjectId(projectId)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();
  const slot = slotId.trim().replace(/\./g, '_').toUpperCase();
  return `COMPOSIO_CONNECTED_${project}_${slot}`;
}

function composioConnectionEnvVarCandidates(slotId: string, projectId?: string): string[] {
  const scoped = composioConnectionEnvVar(slotId, projectId);
  const candidates = [scoped];
  if (normalizeComposioProjectId(projectId) === 'default') {
    const legacy = legacyComposioConnectionEnvVar(slotId);
    if (legacy !== scoped) {
      candidates.push(legacy);
    }
  }
  return candidates;
}

export function resolveComposioUserId(workspaceId: string, operatorId = 'local-operator'): string {
  const normalizedWorkspace = workspaceId.trim() || 'default';
  return `${normalizedWorkspace}:${operatorId.trim() || 'local-operator'}`;
}

export interface IntegrationComposioConfig {
  enabled: boolean;
  toolkit: string;
  intermediary: 'composio';
  authContract: ComposioAuthContract | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function loadIntegrationComposioConfig(
  slotId: string,
  provider: string,
  workspaceRoot?: string,
): Promise<IntegrationComposioConfig | null> {
  const binding = await resolveHarnessBinding(
    workspaceRoot ? { workspaceRoot } : {},
  );
  const root = binding.harnessRoot;
  const bizPath = join(root, 'business.yaml');

  let bizRaw: unknown;
  try {
    bizRaw = parseYaml(await readFile(bizPath, 'utf8'));
  } catch {
    return null;
  }

  if (!isRecord(bizRaw)) {
    return null;
  }

  const integrations = bizRaw.integrations;
  if (!isRecord(integrations)) {
    return null;
  }

  const slot = integrations[slotId];
  if (!isRecord(slot)) {
    return null;
  }

  const configRel = slot.config;
  if (typeof configRel !== 'string') {
    return null;
  }

  const configPath = join(root, configRel.replace(/^\/?\.business\//, ''));
  let integrationRaw: unknown;
  try {
    integrationRaw = parseYaml(await readFile(configPath, 'utf8'));
  } catch {
    return null;
  }

  if (!isRecord(integrationRaw)) {
    return null;
  }

  const composioOAuth = integrationRaw.composio_oauth;
  if (!isRecord(composioOAuth) || composioOAuth.enabled !== true) {
    return null;
  }

  const toolkit =
    typeof composioOAuth.toolkit === 'string'
      ? composioOAuth.toolkit.trim().toLowerCase()
      : toolkitSlugFromSlotId(slotId, provider);

  const intermediary =
    typeof composioOAuth.intermediary === 'string' &&
    composioOAuth.intermediary.trim().toLowerCase() === 'composio'
      ? 'composio'
      : 'composio';

  const authContract = parseComposioAuthContract(composioOAuth);

  return { enabled: true, toolkit, intermediary, authContract };
}

export async function isComposioSlotConnectable(
  slotId: string,
  provider: string,
  workspaceRoot?: string,
): Promise<boolean> {
  const config = await loadIntegrationComposioConfig(slotId, provider, workspaceRoot);
  if (!config?.enabled) {
    return false;
  }
  return composioConnectAvailable(config.toolkit);
}

export async function isComposioSlotConnected(slotId: string, projectId?: string): Promise<boolean> {
  for (const envVar of composioConnectionEnvVarCandidates(slotId, projectId)) {
    if (isDesktopKeychainContext()) {
      if (await desktopKeychainHas(envVar)) {
        return true;
      }
      continue;
    }

    const presence = await probeCredentialPresence(
      [
        {
          env_var: envVar,
          storage: 'composio_connection' as SecretStorage,
          required: true,
          description: 'Composio connection',
        },
      ],
      '',
    );
    if (presence[0]?.present === true) {
      return true;
    }
  }
  return false;
}

export async function readStoredConnectedAccountId(
  slotId: string,
  projectId?: string,
): Promise<string | null> {
  for (const envVar of composioConnectionEnvVarCandidates(slotId, projectId)) {
    if (isDesktopKeychainContext()) {
      const { desktopKeychainGet } = await import('./desktop-keychain');
      const value = await desktopKeychainGet(envVar);
      if (value?.trim()) {
        return value.trim();
      }
      continue;
    }

    const script = `
import sys
from _business_secrets import keychain_get
print(keychain_get(sys.argv[1]) or "")
`;
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { resolveAppRoot } = await import('./app-root');
    const execFileAsync = promisify(execFile);

    try {
      const { stdout } = await execFileAsync('python3', ['-c', script, envVar], {
        cwd: resolveAppRoot(),
        maxBuffer: 1024 * 1024,
        env: credentialProbeEnv(),
      });
      const value = stdout.trim();
      if (value.length > 0) {
        return value;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function credentialProbeEnv(): NodeJS.ProcessEnv {
  const bundleId =
    process.env.JAMBU_HOST_BUNDLE_ID?.trim() ||
    process.env.TAURI_BUNDLE_IDENTIFIER?.trim() ||
    '';
  if (!bundleId) {
    return process.env;
  }
  return {
    ...process.env,
    JAMBU_HOST_BUNDLE_ID: bundleId,
    TAURI_BUNDLE_IDENTIFIER: bundleId,
  };
}

export async function storeComposioConnection(
  slotId: string,
  connectedAccountId: string,
  projectId?: string,
): Promise<void> {
  const envVar = composioConnectionEnvVar(slotId, projectId);
  if (isDesktopKeychainContext()) {
    await desktopKeychainSet(envVar, connectedAccountId);
    const { writeCredentialMetadata } = await import('./desktop-keychain');
    await writeCredentialMetadata(envVar);
    return;
  }

  await storeCredential(envVar, connectedAccountId);
}

async function clearStoredComposioConnection(slotId: string, projectId?: string): Promise<void> {
  for (const envVar of composioConnectionEnvVarCandidates(slotId, projectId)) {
    if (isDesktopKeychainContext()) {
      const { desktopKeychainDelete } = await import('./desktop-keychain');
      await desktopKeychainDelete(envVar);
      continue;
    }

    const script = `
import sys
from _business_secrets import keychain_delete
keychain_delete(sys.argv[1])
`;
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { resolveAppRoot } = await import('./app-root');
    const execFileAsync = promisify(execFile);
    await execFileAsync('python3', ['-c', script, envVar], {
      cwd: resolveAppRoot(),
      maxBuffer: 1024 * 1024,
      env: credentialProbeEnv(),
    }).catch(() => undefined);
  }
}

export interface ComposioSlotRemoteStatus {
  connectedLocally: boolean;
  connectedAccountId: string | null;
  remoteActive: boolean;
  credentialValid: boolean | null;
  userId: string;
  status: string | null;
  failureReason: ComposioSlotFailureReason;
  expectedSubdomain: string | null;
  storedSubdomain: string | null;
}

/** Live Composio check — keychain alone is not enough for MCP execution. */
export async function verifyComposioSlotRemote(options: {
  slotId: string;
  provider: string;
  projectId: string;
  workspaceRoot?: string;
  skipCredentialProbe?: boolean;
}): Promise<ComposioSlotRemoteStatus> {
  const userId = resolveComposioUserId(options.projectId);
  const connectedAccountId = await readStoredConnectedAccountId(options.slotId, options.projectId);
  const connectedLocally = Boolean(connectedAccountId);

  if (!connectedAccountId) {
    return {
      connectedLocally: false,
      connectedAccountId: null,
      remoteActive: false,
      credentialValid: null,
      userId,
      status: null,
      failureReason: null,
      expectedSubdomain: null,
      storedSubdomain: null,
    };
  }

  const composioConfig = await loadIntegrationComposioConfig(
    options.slotId,
    options.provider,
    options.workspaceRoot,
  );
  const toolkit = composioConfig?.toolkit ?? toolkitSlugFromSlotId(options.slotId, options.provider);
  const connectionData = await loadComposioConnectionDataForSlot({
    slotId: options.slotId,
    provider: options.provider,
    workspaceRoot: options.workspaceRoot,
  });
  const expectedSubdomain = connectionData?.subdomain ?? null;
  const accountDetails = await getConnectedAccountDetails(connectedAccountId);
  const storedSubdomain = accountDetails?.subdomain ?? null;

  if (storedSubdomain && isMalformedAtlassianSubdomain(storedSubdomain)) {
    return {
      connectedLocally: true,
      connectedAccountId,
      remoteActive: true,
      credentialValid: false,
      userId,
      status: accountDetails?.status ?? 'ACTIVE',
      failureReason: 'subdomain_malformed',
      expectedSubdomain,
      storedSubdomain,
    };
  }

  const apiKey = getComposioApiKey();
  if (!apiKey) {
    return {
      connectedLocally,
      connectedAccountId,
      remoteActive: false,
      credentialValid: null,
      userId,
      status: 'api_key_missing',
      failureReason: null,
      expectedSubdomain,
      storedSubdomain,
    };
  }

  try {
    const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/${connectedAccountId}`, {
      headers: { 'x-api-key': apiKey },
    });
    if (!response.ok) {
      if (response.status === 404) {
        await clearStoredComposioConnection(options.slotId, options.projectId);
        return {
          connectedLocally: false,
          connectedAccountId: null,
          remoteActive: false,
          credentialValid: null,
          userId,
          status: 'account_deleted',
          failureReason: null,
          expectedSubdomain,
          storedSubdomain: null,
        };
      }
      return {
        connectedLocally,
        connectedAccountId,
        remoteActive: false,
        credentialValid: null,
        userId,
        status: `http_${response.status}`,
        failureReason: 'remote_inactive',
        expectedSubdomain,
        storedSubdomain,
      };
    }

    const body = (await response.json()) as {
      status?: string;
      user_id?: string;
      toolkit?: { slug?: string };
    };

    const remoteActive =
      body.status?.toUpperCase() === 'ACTIVE' &&
      body.user_id === userId &&
      (body.toolkit?.slug?.toLowerCase() ?? toolkit) === toolkit;

    let credentialValid: boolean | null = null;
    let failureReason: ComposioSlotFailureReason = null;
    if (remoteActive && connectedAccountId && !options.skipCredentialProbe) {
      credentialValid = await probeComposioToolkitCredential({
        userId,
        toolkit,
        connectedAccountId,
        probeTools: composioConfig?.authContract?.probeTools,
      });
      if (credentialValid === false) {
        failureReason = 'credential_invalid';
      }
    } else if (remoteActive && options.skipCredentialProbe) {
      credentialValid = null;
    } else if (!remoteActive) {
      failureReason = 'remote_inactive';
    }

    return {
      connectedLocally,
      connectedAccountId,
      remoteActive,
      credentialValid,
      userId,
      status: body.status ?? null,
      failureReason,
      expectedSubdomain,
      storedSubdomain,
    };
  } catch {
    return {
      connectedLocally,
      connectedAccountId,
      remoteActive: false,
      credentialValid: null,
      userId,
      status: 'probe_failed',
      failureReason: 'remote_inactive',
      expectedSubdomain,
      storedSubdomain,
    };
  }
}

/** Credential probe must pass explicitly; null (skipped) is not verified. */
export function isComposioSlotCredentialVerified(remote: {
  remoteActive: boolean;
  credentialValid: boolean | null;
}): boolean {
  return remote.remoteActive && remote.credentialValid === true;
}

export async function isComposioSlotVerified(options: {
  slotId: string;
  provider: string;
  projectId: string;
  workspaceRoot?: string;
}): Promise<boolean> {
  const status = await verifyComposioSlotRemote(options);
  if (!status.connectedLocally || !status.remoteActive) {
    return false;
  }
  return isComposioSlotCredentialVerified(status);
}

export async function pollAndStoreComposioConnection(options: {
  slotId: string;
  provider: string;
  userId: string;
  projectId?: string;
  workspaceRoot?: string;
  maxAttempts?: number;
  intervalMs?: number;
}): Promise<{ connectedAccountId: string; toolkit: string }> {
  const composioConfig = await loadIntegrationComposioConfig(
    options.slotId,
    options.provider,
    options.workspaceRoot,
  );
  if (!composioConfig?.enabled) {
    throw new Error(`Slot ${options.slotId} is not configured for Composio OAuth`);
  }

  const maxAttempts = options.maxAttempts ?? 15;
  const intervalMs = options.intervalMs ?? 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const account = await listConnectedAccountsForToolkit({
      userId: options.userId,
      toolkitSlug: composioConfig.toolkit,
    });
    if (account?.id && account.status?.toUpperCase() === 'ACTIVE') {
      const details = await getConnectedAccountDetails(account.id);
      const connectionData = await loadComposioConnectionDataForSlot({
        slotId: options.slotId,
        provider: options.provider,
        workspaceRoot: options.workspaceRoot,
      });
      const expectedSubdomain = connectionData?.subdomain;
      const storedSubdomain = details?.subdomain;

      if (storedSubdomain && isMalformedAtlassianSubdomain(storedSubdomain)) {
        await deleteConnectedAccount(account.id);
        if (expectedSubdomain) {
          throw new ComposioSubdomainMalformedError(expectedSubdomain, storedSubdomain);
        }
        throw new Error(
          `Composio stored subdomain "${storedSubdomain}" is invalid — enter only the slug before .atlassian.net.`,
        );
      }

      await storeComposioConnection(options.slotId, account.id, options.projectId);
      await purgeAllConnectedAccountsForToolkit({
        userId: options.userId,
        toolkitSlug: composioConfig.toolkit,
        exceptAccountId: account.id,
      });
      return { connectedAccountId: account.id, toolkit: composioConfig.toolkit };
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(`Composio connection for ${composioConfig.toolkit} did not become ACTIVE in time`);
}

export async function disconnectComposioSlot(
  slotId: string,
  userId: string,
  toolkitSlug?: string,
  projectId?: string,
): Promise<void> {
  const connectedAccountId = await readStoredConnectedAccountId(slotId, projectId);
  const apiKey = getComposioApiKey();

  if (apiKey && toolkitSlug) {
    await purgeAllConnectedAccountsForToolkit({
      userId,
      toolkitSlug,
    });
  } else if (apiKey && connectedAccountId) {
    await deleteConnectedAccount(connectedAccountId);
  }

  if (isDesktopKeychainContext()) {
    const { desktopKeychainDelete } = await import('./desktop-keychain');
    for (const envVar of composioConnectionEnvVarCandidates(slotId, projectId)) {
      await desktopKeychainDelete(envVar);
    }
  } else {
    await clearStoredComposioConnection(slotId, projectId);
  }
}
