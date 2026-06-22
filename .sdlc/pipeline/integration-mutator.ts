#!/usr/bin/env npx ts-node
/**
 * Integration Mutation Pipeline (ADR-011 W3)
 *
 * Shared engine for /sdlc:init (batch) and /sdlc:config (delta).
 *
 * Usage:
 *   npx ts-node pipeline/integration-mutator.ts plan --action batch --slots-file slots.json --source init
 *   npx ts-node pipeline/integration-mutator.ts plan --action add --provider posthog --slots observability
 *   npx ts-node pipeline/integration-mutator.ts plan --action remove --provider sentry
 *   npx ts-node pipeline/integration-mutator.ts plan --action swap --from sentry --to posthog --slots observability
 *   npx ts-node pipeline/integration-mutator.ts apply --plan-file .sdlc/pipeline/.last-plan.json
 *   npx ts-node pipeline/integration-mutator.ts manifest --source doctor-regen
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  collapseSlotSelections,
  normalizeSlotSelections,
  copyCatalogToIntegration,
  integrationConfigPath,
  listCatalogProviders,
  removeIntegrationDir,
  resolveProviderId,
} from "./catalog";
import { loadInitSelections, patchMaterializedIntegration } from "./catalog-patch";
import {
  buildCredentialManifest,
  previewManifestCount,
  writeCredentialManifest,
} from "./credential-manifest";
import { buildAgentTasks, discoverProviderReferences } from "./discovery";
import type {
  IntegrationIndexEntry,
  IntegrationStatus,
  ManifestSource,
  MutationAction,
  MutationPlan,
  ProviderPlan,
  SlotId,
  SlotSelections,
  InitSelections,
  RuntimeMcpEntry,
  SdlcYaml,
} from "./types";

const ROOT = join(__dirname, "../..");
const DEFAULT_PLAN_PATH = join(ROOT, ".sdlc/pipeline/.last-plan.json");

interface CliArgs {
  command: "plan" | "apply" | "manifest" | "help";
  action?: MutationAction;
  provider?: string;
  from?: string;
  to?: string;
  slots: SlotId[];
  slotsFile?: string;
  initFile?: string;
  source: ManifestSource;
  planFile?: string;
  output?: string;
  force: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const command = (args[0] ?? "help") as CliArgs["command"];
  const result: CliArgs = {
    command,
    slots: [],
    source: "config-add",
    force: false,
    json: false,
  };

  for (let i = 1; i < args.length; i++) {
    const flag = args[i];
    const next = args[i + 1];

    switch (flag) {
      case "--action":
        result.action = next as MutationAction;
        i++;
        break;
      case "--provider":
        result.provider = next;
        i++;
        break;
      case "--from":
        result.from = next;
        i++;
        break;
      case "--to":
        result.to = next;
        i++;
        break;
      case "--remove":
        result.provider = next;
        result.action = "remove";
        i++;
        break;
      case "--slots":
        result.slots = (next ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) as SlotId[];
        i++;
        break;
      case "--slots-file":
        result.slotsFile = next;
        i++;
        break;
      case "--init-file":
        result.initFile = next;
        i++;
        break;
      case "--source":
        result.source = next as ManifestSource;
        i++;
        break;
      case "--plan-file":
        result.planFile = next;
        i++;
        break;
      case "--output":
        result.output = next;
        i++;
        break;
      case "--force":
        result.force = true;
        break;
      case "--json":
        result.json = true;
        break;
      default:
        break;
    }
  }

  return result;
}

function loadSdlc(): SdlcYaml {
  const path = join(ROOT, ".sdlc/sdlc.yaml");
  return parseYaml(readFileSync(path, "utf-8")) as SdlcYaml;
}

function saveSdlc(sdlc: SdlcYaml): void {
  const path = join(ROOT, ".sdlc/sdlc.yaml");
  writeFileSync(path, stringifyYaml(sdlc, { lineWidth: 0 }), "utf-8");
}

function loadSlotSelections(path: string): SlotSelections {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as SlotSelections & InitSelections;
  if (raw.slots && typeof raw.slots === "object") {
    return raw.slots;
  }
  return raw;
}

function resolveInitFile(args: CliArgs): InitSelections | null {
  const path = args.initFile ?? args.slotsFile;
  if (!path) return null;
  const raw = JSON.parse(readFileSync(path, "utf-8")) as InitSelections & { slots?: SlotSelections };
  if (raw.version === 1 && raw.confirmed_at && raw.slots) {
    return loadInitSelections(ROOT, path);
  }
  return null;
}

function applyInitSelectionsToSdlc(sdlc: SdlcYaml, init: InitSelections): void {
  sdlc.workspace = {
    ...(sdlc.workspace ?? {}),
    target_root: init.workspace.target_root,
    profile: init.workspace.profile,
  };
  (sdlc as Record<string, unknown>).delivery = init.delivery;
}

function defaultStatus(providerId?: string): IntegrationStatus {
  if (providerId === "local-work-items") return "active";
  return "pending_credentials";
}

function buildBatchPlan(
  selections: SlotSelections,
  source: ManifestSource,
  existing: Record<string, IntegrationIndexEntry>
): MutationPlan {
  const { providers, stackUpdates, nonMaterialized } = collapseSlotSelections(
    normalizeSlotSelections(selections)
  );
  const providerPlans: ProviderPlan[] = [];
  const materialize: string[] = [];
  const discovery: MutationPlan["discovery"] = {};

  for (const [providerId, slotSet] of providers) {
    const serves_slots = [...slotSet].sort() as SlotId[];
    const operation = existing[providerId] ? "update" : "add";
    providerPlans.push({ providerId, serves_slots, operation });
    if (operation === "add") materialize.push(providerId);
    discovery[providerId] = discoverProviderReferences(ROOT, providerId);
  }

  const mergedIntegrations = { ...existing };
  for (const plan of providerPlans) {
    mergedIntegrations[plan.providerId] = {
      config: integrationConfigPath(plan.providerId),
      status: existing[plan.providerId]?.status ?? defaultStatus(plan.providerId),
      serves_slots: plan.serves_slots,
    };
  }

  return {
    version: 1,
    action: "batch",
    source,
    created_at: new Date().toISOString(),
    providers: providerPlans,
    materialize,
    remove: [],
    stack_updates: stackUpdates,
    non_materialized: nonMaterialized,
    discovery,
    agent_tasks: providerPlans.flatMap((p) =>
      buildAgentTasks("add", p.providerId, undefined, discovery[p.providerId] ?? [], loadSdlc().workspace?.profile)
    ),
    credential_manifest_preview: previewManifestCount(ROOT, mergedIntegrations),
  };
}

function buildAddPlan(
  providerId: string,
  slots: SlotId[],
  source: ManifestSource,
  existing: Record<string, IntegrationIndexEntry>
): MutationPlan {
  const discovery = { [providerId]: discoverProviderReferences(ROOT, providerId) };
  const merged = {
    ...existing,
    [providerId]: {
      config: integrationConfigPath(providerId),
      status: existing[providerId]?.status ?? defaultStatus(providerId),
      serves_slots: slots,
    },
  };

  return {
    version: 1,
    action: "add",
    source,
    created_at: new Date().toISOString(),
    providers: [{ providerId, serves_slots: slots, operation: existing[providerId] ? "update" : "add" }],
    materialize: existing[providerId] ? [] : [providerId],
    remove: [],
    stack_updates: {},
    non_materialized: [],
    discovery,
    agent_tasks: buildAgentTasks(
      "add",
      providerId,
      undefined,
      discovery[providerId] ?? [],
      loadSdlc().workspace?.profile
    ),
    credential_manifest_preview: previewManifestCount(ROOT, merged),
  };
}

const STACK_FIELD_FOR_SLOT: Partial<Record<SlotId, string>> = {
  observability: "observability",
  deploy: "deployment",
  ci: "ci",
};

function stackUpdatesForRemovedSlots(slots: SlotId[]): Record<string, string> {
  const updates: Record<string, string> = {};
  for (const slot of slots) {
    const field = STACK_FIELD_FOR_SLOT[slot];
    if (field) {
      updates[field] = "none";
    }
  }
  return updates;
}

function buildRemovePlan(
  providerId: string,
  source: ManifestSource,
  existing: Record<string, IntegrationIndexEntry>
): MutationPlan {
  const discovery = { [providerId]: discoverProviderReferences(ROOT, providerId) };
  const merged = { ...existing };
  delete merged[providerId];
  const servedSlots = existing[providerId]?.serves_slots ?? [];

  return {
    version: 1,
    action: "remove",
    source,
    created_at: new Date().toISOString(),
    providers: [{ providerId, serves_slots: servedSlots, operation: "remove" }],
    materialize: [],
    remove: [providerId],
    stack_updates: stackUpdatesForRemovedSlots(servedSlots),
    non_materialized: [],
    discovery,
    agent_tasks: buildAgentTasks(
      "remove",
      providerId,
      providerId,
      discovery[providerId] ?? [],
      loadSdlc().workspace?.profile
    ),
    credential_manifest_preview: previewManifestCount(ROOT, merged),
  };
}

function buildSwapPlan(
  fromId: string,
  toId: string,
  slots: SlotId[],
  source: ManifestSource,
  existing: Record<string, IntegrationIndexEntry>
): MutationPlan {
  const removeDiscovery = discoverProviderReferences(ROOT, fromId);
  const addDiscovery = discoverProviderReferences(ROOT, toId);
  const merged = { ...existing };
  delete merged[fromId];
  merged[toId] = {
    config: integrationConfigPath(toId),
    status: defaultStatus(toId),
    serves_slots: slots,
  };

  return {
    version: 1,
    action: "swap",
    source,
    created_at: new Date().toISOString(),
    providers: [
      { providerId: fromId, serves_slots: existing[fromId]?.serves_slots ?? [], operation: "remove" },
      { providerId: toId, serves_slots: slots, operation: existing[toId] ? "update" : "add" },
    ],
    materialize: existing[toId] ? [] : [toId],
    remove: [fromId],
    stack_updates: {},
    non_materialized: [],
    discovery: {
      [fromId]: removeDiscovery,
      [toId]: addDiscovery,
    },
    agent_tasks: [
      ...buildAgentTasks("remove", fromId, fromId, removeDiscovery),
      ...buildAgentTasks("add", toId, fromId, addDiscovery, loadSdlc().workspace?.profile),
    ],
    credential_manifest_preview: previewManifestCount(ROOT, merged),
  };
}

function runPlan(args: CliArgs): MutationPlan {
  const sdlc = loadSdlc();
  const existing = sdlc.integrations ?? {};

  let plan: MutationPlan;

  switch (args.action) {
    case "batch": {
      const initPath = args.initFile ?? args.slotsFile;
      if (!initPath) {
        throw new Error("--init-file or --slots-file required for batch action");
      }
      const selections = loadSlotSelections(initPath);
      plan = buildBatchPlan(selections, args.source, existing);
      break;
    }
    case "add": {
      if (!args.provider) throw new Error("--provider required for add");
      const providerId = resolveProviderId(args.provider);
      if (!providerId) throw new Error(`Non-materialized provider: ${args.provider}`);
      if (args.slots.length === 0) throw new Error("--slots required for add");
      plan = buildAddPlan(providerId, args.slots, args.source, existing);
      break;
    }
    case "remove": {
      if (!args.provider && !args.from) throw new Error("--provider or --from required for remove");
      const providerId = resolveProviderId(args.provider ?? args.from ?? "") ?? args.provider ?? args.from!;
      plan = buildRemovePlan(providerId, args.source, existing);
      break;
    }
    case "swap": {
      if (!args.from || !args.to) throw new Error("--from and --to required for swap");
      const fromId = resolveProviderId(args.from) ?? args.from;
      const toId = resolveProviderId(args.to) ?? args.to;
      if (args.slots.length === 0) throw new Error("--slots required for swap");
      plan = buildSwapPlan(fromId, toId, args.slots, args.source, existing);
      break;
    }
    default:
      throw new Error(`Unknown action: ${args.action}. Use batch|add|remove|swap`);
  }

  const outPath = args.output ?? DEFAULT_PLAN_PATH;
  writeFileSync(outPath, JSON.stringify(plan, null, 2), "utf-8");

  if (args.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    printPlanSummary(plan, outPath);
  }

  return plan;
}

function applyPlan(plan: MutationPlan, force: boolean, init: InitSelections | null): void {
  const sdlc = loadSdlc();
  const integrations = { ...(sdlc.integrations ?? {}) };
  const materialized: string[] = [];
  const removed: string[] = [];
  const skipped: string[] = [];

  for (const providerId of plan.remove) {
    if (removeIntegrationDir(ROOT, providerId)) removed.push(providerId);
    delete integrations[providerId];
  }

  for (const providerId of plan.materialize) {
    const result = copyCatalogToIntegration(ROOT, providerId, force);
    if (result.copied) {
      materialized.push(providerId);
      if (init) {
        patchMaterializedIntegration(ROOT, providerId, init);
      }
    } else if (result.reason === "already_materialized") {
      skipped.push(providerId);
      if (init) {
        patchMaterializedIntegration(ROOT, providerId, init);
      }
    } else if (result.reason === "catalog_missing") {
      console.error(`catalog missing for ${providerId} — seed .sdlc/templates/integrations/${providerId}/`);
      process.exit(1);
    }
  }

  for (const entry of plan.providers) {
    if (entry.operation === "remove") continue;
    integrations[entry.providerId] = {
      config: integrationConfigPath(entry.providerId),
      status: integrations[entry.providerId]?.status ?? defaultStatus(entry.providerId),
      serves_slots: entry.serves_slots,
    };
  }

  sdlc.integrations = integrations;

  if (init) {
    applyInitSelectionsToSdlc(sdlc, init);
  }

  const workItemsProvider = Object.entries(integrations).find(([, entry]) =>
    Array.isArray(entry.serves_slots) && entry.serves_slots.includes("work_items")
  )?.[0];
  if (workItemsProvider) {
    sdlc.source_of_truth = {
      ...(sdlc.source_of_truth ?? {}),
      work_items: workItemsProvider,
    };
  }

  if (Object.keys(plan.stack_updates).length > 0) {
    sdlc.project = sdlc.project ?? {};
    sdlc.project.stack = { ...(sdlc.project.stack ?? {}), ...plan.stack_updates };
  }

  if (plan.remove.length > 0) {
    const runtime = sdlc.runtime ?? {};
    const mcps = Array.isArray(runtime.mcps) ? runtime.mcps : [];
    const removeSet = new Set(plan.remove);
    runtime.mcps = mcps.filter(
      (entry: RuntimeMcpEntry) => !removeSet.has(entry.name ?? ""),
    );
    sdlc.runtime = runtime;
  }

  saveSdlc(sdlc);

  const manifest = buildCredentialManifest(ROOT, integrations, plan.source);
  const manifestPath = writeCredentialManifest(ROOT, manifest);

  console.log("\n=== Integration Mutation Applied ===\n");
  console.log(`Action:      ${plan.action}`);
  console.log(`Materialized: ${materialized.length ? materialized.join(", ") : "(none)"}`);
  console.log(`Removed:     ${removed.length ? removed.join(", ") : "(none)"}`);
  console.log(`Skipped:     ${skipped.length ? skipped.join(", ") : "(none)"}`);
  console.log(`Manifest:    ${manifestPath} (${manifest.secrets.length} secrets)`);
  console.log(`sdlc.yaml:   integrations updated (${Object.keys(integrations).length} providers)`);

  if (plan.agent_tasks.length > 0) {
    console.log("\nAgent tasks (manual patches):");
    for (const task of [...new Set(plan.agent_tasks)]) {
      console.log(`  - ${task}`);
    }
  }

  console.log("\nNext: cd .sdlc && npm run doctor:operational");
}

function runManifest(source: ManifestSource): void {
  const sdlc = loadSdlc();
  const integrations = sdlc.integrations ?? {};
  const manifest = buildCredentialManifest(ROOT, integrations, source);
  const path = writeCredentialManifest(ROOT, manifest);
  console.log(`Credential manifest regenerated: ${path}`);
  console.log(`Secrets: ${manifest.secrets.length} across ${Object.keys(integrations).length} integrations`);
}

function printPlanSummary(plan: MutationPlan, outPath: string): void {
  console.log("\n=== Integration Mutation Plan (dry-run) ===\n");
  console.log(`Action:     ${plan.action}`);
  console.log(`Source:     ${plan.source}`);
  console.log(`Materialize: ${plan.materialize.join(", ") || "(none)"}`);
  console.log(`Remove:     ${plan.remove.join(", ") || "(none)"}`);
  if (plan.non_materialized.length) {
    console.log(`Stack-only: ${plan.non_materialized.join(", ")}`);
  }
  console.log(
    `Manifest preview: ${plan.credential_manifest_preview.secrets_count} secrets for [${plan.credential_manifest_preview.integrations.join(", ")}]`
  );
  console.log(`Plan written: ${outPath}`);
  console.log("\nApply with:");
  console.log(`  npx ts-node pipeline/integration-mutator.ts apply --plan-file ${outPath}`);
}

function printHelp(): void {
  console.log(`Integration Mutation Pipeline (ADR-011 W3)

Commands:
  plan     Build mutation plan (dry-run)
  apply    Execute plan from --plan-file
  manifest Regenerate credential-manifest.yaml

Plan examples:
  plan --action batch --init-file .sdlc/pipeline/.init-selections.json --source init
  plan --action batch --slots-file slots.json --source init
  plan --action add --provider posthog --slots observability --source config-add
  plan --action remove --provider sentry --source config-remove
  plan --action swap --from sentry --to posthog --slots observability --source config-swap

Catalog providers: ${listCatalogProviders(ROOT).join(", ") || "(none — seed .sdlc/templates/integrations/)"}
`);
}

function main(): void {
  const args = parseArgs(process.argv);

  try {
    switch (args.command) {
      case "plan":
        runPlan(args);
        break;
      case "apply": {
        const planPath = args.planFile ?? DEFAULT_PLAN_PATH;
        if (!existsSync(planPath)) {
          console.error(`Plan file not found: ${planPath}`);
          process.exit(1);
        }
        const plan = JSON.parse(readFileSync(planPath, "utf-8")) as MutationPlan;
        let init: InitSelections | null = null;
        if (args.initFile) {
          init = loadInitSelections(ROOT, args.initFile);
        } else if (plan.source === "init") {
          const defaultInit = join(ROOT, ".sdlc/pipeline/.init-selections.json");
          if (existsSync(defaultInit)) {
            init = loadInitSelections(ROOT, defaultInit);
          }
        }
        applyPlan(plan, args.force, init);
        break;
      }
      case "manifest":
        runManifest(args.source);
        break;
      case "help":
      default:
        printHelp();
        break;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
