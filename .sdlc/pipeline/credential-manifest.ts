import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  CredentialManifest,
  CredentialManifestSecret,
  IntegrationIndexEntry,
  IntegrationYaml,
  ManifestSource,
  SecretLayer,
  SlotId,
} from "./types";

function inferLayer(envVar: string, scope: string, integration: string, explicit?: SecretLayer): SecretLayer {
  if (explicit) return explicit;
  if (scope === "ci") return "ci";
  if (envVar.startsWith("PUBLIC_")) return "app";
  if (envVar.startsWith("PLANE_") || envVar === "CURSOR_API_KEY") return "sdlc";
  if (integration === "posthog" || integration === "sentry") return "app";
  if (integration === "vercel") return "ci";
  return "sdlc";
}

function inferSlotForSecret(envVar: string, servesSlots: SlotId[]): SlotId {
  const rules: Array<[RegExp, SlotId]> = [
    [/PLANE_/i, "work_items"],
    [/GITHUB_|GH_/i, "source_control"],
    [/CURSOR_|ANTHROPIC_/i, "incident"],
    [/VERCEL_|ASTRO_SITE/i, "deploy"],
    [/POSTHOG_|SENTRY_|DATADOG_/i, "observability"],
  ];

  for (const [pattern, slot] of rules) {
    if (pattern.test(envVar) && servesSlots.includes(slot)) return slot;
  }

  return servesSlots[0] ?? "work_items";
}

export function readIntegrationSecrets(
  repoRoot: string,
  providerId: string,
  entry: IntegrationIndexEntry
): CredentialManifestSecret[] {
  const configPath = join(repoRoot, entry.config);
  if (!existsSync(configPath)) return [];

  const parsed = parseYaml(readFileSync(configPath, "utf-8")) as IntegrationYaml;
  const secrets = parsed.secrets_required ?? [];

  return secrets.map((secret) => ({
    env_var: secret.env_var,
    scope: secret.scope,
    layer: inferLayer(secret.env_var, secret.scope, providerId, secret.layer),
    integration: providerId,
    slot: (secret as { slot?: SlotId }).slot ?? inferSlotForSecret(secret.env_var, entry.serves_slots),
    required: secret.required !== false,
    description: secret.description,
  }));
}

export function buildCredentialManifest(
  repoRoot: string,
  integrations: Record<string, IntegrationIndexEntry>,
  source: ManifestSource
): CredentialManifest {
  const allSecrets: CredentialManifestSecret[] = [];
  const seen = new Set<string>();

  for (const [providerId, entry] of Object.entries(integrations)) {
    const secrets = readIntegrationSecrets(repoRoot, providerId, entry);
    for (const secret of secrets) {
      const key = `${secret.integration}:${secret.env_var}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allSecrets.push(secret);
    }
  }

  allSecrets.sort((a, b) => a.env_var.localeCompare(b.env_var));

  return {
    generated_at: new Date().toISOString(),
    source,
    secrets: allSecrets,
  };
}

export function writeCredentialManifest(
  repoRoot: string,
  manifest: CredentialManifest
): string {
  const path = join(repoRoot, ".sdlc/credential-manifest.yaml");
  writeFileSync(path, stringifyYaml(manifest, { lineWidth: 0 }), "utf-8");
  return path;
}

export function previewManifestCount(
  repoRoot: string,
  integrations: Record<string, IntegrationIndexEntry>
): { secrets_count: number; integrations: string[] } {
  const manifest = buildCredentialManifest(repoRoot, integrations, "doctor-regen");
  return {
    secrets_count: manifest.secrets.length,
    integrations: Object.keys(integrations),
  };
}
