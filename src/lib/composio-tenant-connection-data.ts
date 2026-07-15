import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { resolveHarnessBinding } from './harness-binding';
import { loadIntegrationComposioConfig } from './composio-connection';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** True when operator entered a full hostname instead of the Atlassian slug. */
export function isMalformedAtlassianSubdomain(subdomain: string): boolean {
  return /\.atlassian\.net/i.test(subdomain.trim());
}

/** Extract Atlassian cloud subdomain slug from site URL or hostname. */
export function atlassianSubdomainFromSite(site: string): string | undefined {
  const trimmed = site.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const hostname = trimmed.includes('://') ? new URL(trimmed).hostname : trimmed;
    const match = hostname.match(/^([a-z0-9-]+)\.atlassian\.net$/i);
    return match?.[1]?.toLowerCase();
  } catch {
    const match = trimmed.match(/^([a-z0-9-]+)\.atlassian\.net$/i);
    return match?.[1]?.toLowerCase();
  }
}

/**
 * Pre-fill Composio link connection_data from integration tenant_scope.
 * Prevents operators from entering full URLs as subdomain during OAuth.
 */
export async function loadComposioConnectionDataForSlot(options: {
  slotId: string;
  provider: string;
  workspaceRoot?: string;
}): Promise<Record<string, string> | undefined> {
  const composioConfig = await loadIntegrationComposioConfig(
    options.slotId,
    options.provider,
    options.workspaceRoot,
  );
  if (!composioConfig?.enabled) {
    return undefined;
  }

  const binding = await resolveHarnessBinding(
    options.workspaceRoot ? { workspaceRoot: options.workspaceRoot } : {},
  );
  const bizPath = join(binding.harnessRoot, 'business.yaml');
  let bizRaw: unknown;
  try {
    bizRaw = parseYaml(await readFile(bizPath, 'utf8'));
  } catch {
    return undefined;
  }

  if (!isRecord(bizRaw) || !isRecord(bizRaw.integrations)) {
    return undefined;
  }

  const slot = bizRaw.integrations[options.slotId];
  if (!isRecord(slot) || typeof slot.config !== 'string') {
    return undefined;
  }

  const configPath = join(binding.harnessRoot, slot.config.replace(/^\/?\.business\//, ''));
  let integrationRaw: unknown;
  try {
    integrationRaw = parseYaml(await readFile(configPath, 'utf8'));
  } catch {
    return undefined;
  }

  if (!isRecord(integrationRaw)) {
    return undefined;
  }

  const tenantScope = integrationRaw.tenant_scope;
  if (!isRecord(tenantScope)) {
    return undefined;
  }

  const toolkit = composioConfig.toolkit;
  if (toolkit === 'confluence' || toolkit === 'jira') {
    const site =
      (typeof tenantScope.site === 'string' ? tenantScope.site : null) ??
      (typeof tenantScope.site_url === 'string' ? tenantScope.site_url : null) ??
      (typeof tenantScope.wiki_base === 'string' ? tenantScope.wiki_base : null);
    if (!site) {
      return undefined;
    }
    const subdomain = atlassianSubdomainFromSite(site);
    if (!subdomain) {
      return undefined;
    }
    return { subdomain };
  }

  return undefined;
}
