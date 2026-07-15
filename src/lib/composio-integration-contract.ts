/**
 * Integration auth_contract — declarative OAuth/intermediary requirements per slot.
 * Parallels query_contract (data plane) and gate_contract (readiness plane).
 * Harness reads this from integration YAML; never hardcodes provider scopes.
 */

export interface ComposioAuthContract {
  version: string;
  intermediary: 'composio';
  toolsForAuthConfig: string[];
  probeTools: string[];
  /** Each inner array is OR; all groups must be satisfied (AND across groups). */
  scopeGroups: string[][];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseScopeGroups(raw: unknown): string[][] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const groups: string[][] = [];
  for (const entry of raw) {
    if (Array.isArray(entry)) {
      const scopes = asStringArray(entry);
      if (scopes.length > 0) {
        groups.push(scopes);
      }
      continue;
    }
    if (isRecord(entry) && Array.isArray(entry.any_of)) {
      const scopes = asStringArray(entry.any_of);
      if (scopes.length > 0) {
        groups.push(scopes);
      }
    }
  }
  return groups;
}

/** Parse composio_oauth.auth_contract from integration manifest YAML. */
export function parseComposioAuthContract(composioOAuth: Record<string, unknown>): ComposioAuthContract | null {
  const raw = composioOAuth.auth_contract;
  if (!isRecord(raw)) {
    return null;
  }

  const version = typeof raw.version === 'string' ? raw.version.trim() : '1.0';
  const intermediary =
    typeof raw.intermediary === 'string' && raw.intermediary.trim().toLowerCase() === 'composio'
      ? 'composio'
      : 'composio';

  const toolsForAuthConfig = asStringArray(raw.tools_for_auth_config);
  const probeTools = asStringArray(raw.probe_tools);
  const scopeGroups = parseScopeGroups(raw.scope_groups);

  if (toolsForAuthConfig.length === 0 && probeTools.length === 0 && scopeGroups.length === 0) {
    return null;
  }

  return {
    version,
    intermediary,
    toolsForAuthConfig:
      toolsForAuthConfig.length > 0 ? toolsForAuthConfig : [...probeTools],
    probeTools: probeTools.length > 0 ? probeTools : [...toolsForAuthConfig],
    scopeGroups,
  };
}

export function normalizeOAuthScopes(scopes: string[] | string | undefined): string[] {
  if (!scopes) {
    return [];
  }
  if (Array.isArray(scopes)) {
    return scopes.map((scope) => scope.trim()).filter(Boolean);
  }
  return scopes
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

/** True when every scope group has at least one granted scope. */
export function authContractSatisfiesGrantedScopes(
  contract: ComposioAuthContract | null | undefined,
  grantedScopes: string[] | string | undefined,
): boolean {
  if (!contract || contract.scopeGroups.length === 0) {
    return true;
  }

  const granted = new Set(normalizeOAuthScopes(grantedScopes));
  return contract.scopeGroups.every((group) => group.some((scope) => granted.has(scope)));
}

export function authContractCacheKey(contract: ComposioAuthContract | null | undefined): string {
  if (!contract) {
    return 'default';
  }
  const tools = [...contract.toolsForAuthConfig].sort().join(',');
  const groups = contract.scopeGroups.map((g) => [...g].sort().join('|')).join(';');
  return `${contract.version}:${tools}:${groups}`;
}
