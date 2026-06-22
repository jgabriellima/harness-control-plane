import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import type { SlotId, SlotSelections } from "./types";

/** Slot selection tokens that map to a materialized provider id. */
export const PROVIDER_ALIASES: Record<string, string> = {
  "github-actions": "github",
  "gitlab-ci": "gitlab",
  "github-issues": "github",
  "github-issues-cursor-sdk": "github",
  "github-issues-claude": "github",
  "github-issues-human-hitl": "github",
  "fly.io": "fly",
  "pagerduty-webhook": "pagerduty",
};

/** Providers that never get a `.sdlc/integrations/` directory. */
export const NON_MATERIALIZED_TOKENS = new Set([
  "none",
  "playwright",
  "cypress",
  "maestro",
  "browser-user",
  "pytest-only",
]);

export const CANONICAL_SLOTS: SlotId[] = [
  "work_items",
  "source_control",
  "ci",
  "qa",
  "observability",
  "deploy",
  "post_deploy",
  "incident",
];

/** Stack field updates for non-materialized slot choices. */
export const SLOT_STACK_KEYS: Partial<Record<SlotId, string>> = {
  qa: "testing",
  observability: "observability",
  deploy: "deployment",
  ci: "ci",
  work_items: "work_items",
  source_control: "source_control",
};

export function resolveProviderId(token: string): string | null {
  const normalized = token.trim().toLowerCase();
  if (normalized === "none" || normalized === "") return null;
  if (NON_MATERIALIZED_TOKENS.has(normalized)) return null;
  return PROVIDER_ALIASES[normalized] ?? normalized;
}

/** work_items is mandatory — default to zero-credential local provider when unset (ADR-025). */
export function normalizeSlotSelections(selections: SlotSelections): SlotSelections {
  const normalized: SlotSelections = { ...selections };
  const raw = normalized.work_items;
  if (raw === undefined || raw === "none" || raw === "") {
    normalized.work_items = "local-work-items";
  }
  return normalized;
}

export function collapseSlotSelections(selections: SlotSelections): {
  providers: Map<string, Set<SlotId>>;
  stackUpdates: Record<string, string>;
  nonMaterialized: string[];
} {
  const providers = new Map<string, Set<SlotId>>();
  const stackUpdates: Record<string, string> = {};
  const nonMaterialized: string[] = [];

  for (const slot of CANONICAL_SLOTS) {
    const raw = selections[slot];
    if (raw === undefined || raw === "none") continue;

    if (NON_MATERIALIZED_TOKENS.has(raw)) {
      nonMaterialized.push(`${slot}:${raw}`);
      const stackKey = SLOT_STACK_KEYS[slot];
      if (stackKey) stackUpdates[stackKey] = raw;
      continue;
    }

    const providerId = resolveProviderId(raw);
    if (!providerId) continue;

    const slots = providers.get(providerId) ?? new Set<SlotId>();
    slots.add(slot);
    providers.set(providerId, slots);

    const stackKey = SLOT_STACK_KEYS[slot];
    if (stackKey) stackUpdates[stackKey] = raw;
  }

  return { providers, stackUpdates, nonMaterialized };
}

export function catalogRoot(repoRoot: string): string {
  return join(repoRoot, ".sdlc/templates/integrations");
}

export function integrationRoot(repoRoot: string, providerId: string): string {
  return join(repoRoot, ".sdlc/integrations", providerId);
}

export function integrationConfigPath(providerId: string): string {
  return `.sdlc/integrations/${providerId}/${providerId}.yaml`;
}

export function resolveCatalogPath(repoRoot: string, providerId: string): string | null {
  const local = join(catalogRoot(repoRoot), providerId);
  if (existsSync(local)) return local;

  const packagePath = join(
    repoRoot,
    "node_modules/@jambu/ai-native-sdlc/templates/integrations",
    providerId
  );
  if (existsSync(packagePath)) return packagePath;

  return null;
}

export function copyCatalogToIntegration(
  repoRoot: string,
  providerId: string,
  force: boolean
): { copied: boolean; reason?: string } {
  const targetDir = integrationRoot(repoRoot, providerId);
  if (existsSync(targetDir) && !force) {
    return { copied: false, reason: "already_materialized" };
  }

  const catalog = resolveCatalogPath(repoRoot, providerId);
  if (!catalog) {
    return { copied: false, reason: "catalog_missing" };
  }

  mkdirSync(join(repoRoot, ".sdlc/integrations"), { recursive: true });
  cpSync(catalog, targetDir, { recursive: true, force: true });
  return { copied: true };
}

export function removeIntegrationDir(repoRoot: string, providerId: string): boolean {
  const targetDir = integrationRoot(repoRoot, providerId);
  if (!existsSync(targetDir)) return false;
  rmSync(targetDir, { recursive: true, force: true });
  return true;
}

export function listCatalogProviders(repoRoot: string): string[] {
  const root = catalogRoot(repoRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => {
    const full = join(root, name);
    return statSync(full).isDirectory();
  });
}
