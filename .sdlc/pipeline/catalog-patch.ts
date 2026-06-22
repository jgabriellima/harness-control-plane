/**
 * Slot-aware catalog patching after copyCatalogToIntegration (ADR-029 PROJ-3).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { InitSelections, SlotId } from "./types";

type YamlRecord = Record<string, unknown>;

const INCIDENT_FRAGMENT_MAP: Record<string, string> = {
  "github-issues-cursor-sdk": "incident-cursor-sdk.yaml",
  "github-issues-claude": "incident-claude.yaml",
  "github-issues-human-hitl": "incident-human-hitl.yaml",
};

export const ORPHAN_SECRET_RULES: Record<
  string,
  { slot: SlotId; incidentTokens: string[] }
> = {
  CURSOR_API_KEY: { slot: "incident", incidentTokens: ["github-issues-cursor-sdk"] },
  ANTHROPIC_API_KEY: { slot: "incident", incidentTokens: ["github-issues-claude"] },
};

function deepMerge(base: YamlRecord, patch: YamlRecord): YamlRecord {
  const out: YamlRecord = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value) && Array.isArray(out[key])) {
      out[key] = [...(out[key] as unknown[]), ...value];
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      out[key] !== null &&
      typeof out[key] === "object" &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key] as YamlRecord, value as YamlRecord);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function dedupeSecrets(secrets: YamlRecord[]): YamlRecord[] {
  const seen = new Set<string>();
  const out: YamlRecord[] = [];
  for (const entry of secrets) {
    const env = String(entry.env_var ?? "");
    if (!env || seen.has(env)) continue;
    seen.add(env);
    out.push(entry);
  }
  return out;
}

function dedupeStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string"))];
}

function fragmentsDir(repoRoot: string, providerId: string): string {
  return join(repoRoot, ".sdlc/templates/integrations", providerId, "fragments");
}

function loadFragment(repoRoot: string, providerId: string, filename: string): YamlRecord | null {
  const path = join(fragmentsDir(repoRoot, providerId), filename);
  if (!existsSync(path)) return null;
  return (parseYaml(readFileSync(path, "utf-8")) as YamlRecord) ?? null;
}

export function resolveIncidentFragmentToken(selections: InitSelections): string | null {
  const token = selections.slots.incident;
  if (!token || token === "none") return null;
  if (token in INCIDENT_FRAGMENT_MAP) return token;
  return null;
}

export function patchGithubIntegration(
  repoRoot: string,
  configPath: string,
  selections: InitSelections
): void {
  if (!existsSync(configPath)) return;

  let doc = (parseYaml(readFileSync(configPath, "utf-8")) as YamlRecord) ?? {};
  const incidentToken = resolveIncidentFragmentToken(selections);

  if (incidentToken) {
    const fragmentName = INCIDENT_FRAGMENT_MAP[incidentToken];
    const fragment = loadFragment(repoRoot, "github", fragmentName);
    if (fragment) {
      doc = deepMerge(doc, fragment);
      const slots = new Set(
        Array.isArray(doc.serves_slots) ? (doc.serves_slots as string[]) : []
      );
      slots.add("incident");
      doc.serves_slots = [...slots];
    }
  }

  const secrets = Array.isArray(doc.secrets_required)
    ? dedupeSecrets(doc.secrets_required as YamlRecord[])
    : [];
  doc.secrets_required = filterSecretsBySlots(secrets, doc.serves_slots as string[], selections);

  const actions = (doc.actions as YamlRecord) ?? {};
  if (Array.isArray(actions.ci_secrets)) {
    actions.ci_secrets = dedupeStrings(actions.ci_secrets as unknown[]).filter((env) =>
      (doc.secrets_required as YamlRecord[]).some((s) => s.env_var === env)
    );
    doc.actions = actions;
  }

  writeFileSync(configPath, stringifyYaml(doc, { lineWidth: 0 }), "utf-8");
}

export function filterSecretsBySlots(
  secrets: YamlRecord[],
  servesSlots: string[],
  selections: InitSelections
): YamlRecord[] {
  const incidentToken = resolveIncidentFragmentToken(selections);
  return secrets.filter((secret) => {
    const env = String(secret.env_var ?? "");
    const rule = ORPHAN_SECRET_RULES[env];
    if (!rule) return true;
    if (!servesSlots.includes(rule.slot)) return false;
    if (!incidentToken) return false;
    return rule.incidentTokens.includes(incidentToken);
  });
}

export function patchMaterializedIntegration(
  repoRoot: string,
  providerId: string,
  selections: InitSelections
): void {
  const configPath = join(repoRoot, `.sdlc/integrations/${providerId}/${providerId}.yaml`);
  if (providerId === "github") {
    patchGithubIntegration(repoRoot, configPath, selections);
  }
}

export function listOrphanSecretsInYaml(
  doc: YamlRecord,
  servesSlots: SlotId[],
  incidentToken: string | null
): string[] {
  const secrets = (doc.secrets_required as YamlRecord[]) ?? [];
  const orphans: string[] = [];
  for (const secret of secrets) {
    const env = String(secret.env_var ?? "");
    const rule = ORPHAN_SECRET_RULES[env];
    if (!rule) continue;
    if (!servesSlots.includes(rule.slot)) {
      orphans.push(env);
      continue;
    }
    if (!incidentToken || !rule.incidentTokens.includes(incidentToken)) {
      orphans.push(env);
    }
  }
  return orphans;
}

export function loadInitSelections(repoRoot: string, initFile: string): InitSelections {
  const raw = JSON.parse(readFileSync(initFile, "utf-8")) as InitSelections;
  if (!raw.confirmed_at) {
    throw new Error("init-selections missing confirmed_at — user must confirm questionnaire");
  }
  return raw;
}

export function listFragmentFiles(repoRoot: string, providerId: string): string[] {
  const dir = fragmentsDir(repoRoot, providerId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".yaml"));
}
