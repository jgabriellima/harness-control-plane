/**
 * Runtime Alignment Check — Complete DSL Materialization Validator
 *
 * Reads .sdlc/sdlc.yaml as the single source of declared intent and verifies
 * that EVERY declared entity is materialized on disk or in a live system.
 *
 * Coverage:
 *   - runtime.rules        → .cursor/rules/*.mdc files
 *   - runtime.commands     → .cursor/commands/*.md files (derived from slash names)
 *   - runtime.agents       → .cursor/agents/*.md files
 *   - runtime.skills       → .cursor/skills/{name}/SKILL.md (canonical; flat .md deprecated)
 *   - runtime.mcps         → .cursor/settings.json mcpServers entries
 *   - runtime.hooks        → .cursor/hooks.json exists + sessionStart hook script
 *   - workflows            → .sdlc/workflows/*.yaml files
 *   - source_of_truth      → INDEX, LATEST handoff, memories
 *   - plane                → integration config, live API reachability
 *   - integrations         → each integration config file
 *   - autonomous_maintenance → materialized GitHub Actions workflows
 *   - constraints          → critical constraints have enforcement mechanisms
 *   - handoff.storage      → handoffs directory and LATEST.md
 *   - templates            → ticket template file
 *   - contextSources       → settings.json contextSources entries exist on disk
 *
 * Run: npx ts-node .sdlc/doctor/runtime-alignment.ts [--mode=structural|operational]
 *
 * Modes (ADR-011):
 *   structural   — pre-secrets; directories, commands, rules; no secret validation
 *   operational  — end of init / after config; validates secrets for status:active only
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

type DoctorMode = "structural" | "operational";

interface CheckResult {
  group: string;
  check: string;
  status: "pass" | "warn" | "fail";
  message: string;
  remediation?: string;
}

interface ProviderIntegrationEntry {
  config: string;
  status: "active" | "pending_credentials";
  serves_slots?: string[];
}

interface LegacyIntegrationEntry {
  config: string;
  required?: boolean;
  enabled?: boolean;
  provider?: string;
  status?: string;
  serves_slots?: string[];
}

interface ResolvedIntegration {
  providerId: string;
  config: string;
  status: "active" | "pending_credentials" | "none";
  required: boolean;
  servesSlots: string[];
}

const CANONICAL_SLOT_IDS = new Set([
  "work_items",
  "source_control",
  "ci",
  "qa",
  "observability",
  "deploy",
  "post_deploy",
  "incident",
]);

const REQUIRED_OPERATIONAL_SLOTS = ["work_items", "source_control"] as const;

function isProviderIntegrationEntry(entry: unknown): entry is ProviderIntegrationEntry {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "config" in entry &&
    "status" in entry &&
    !("provider" in entry)
  );
}

function isLegacySlotEntry(entry: unknown): entry is { provider: string; config: string; status: string } {
  return typeof entry === "object" && entry !== null && "provider" in entry && "status" in entry;
}

function resolveIntegrations(
  index: Record<string, ProviderIntegrationEntry | LegacyIntegrationEntry | { provider: string; config: string; status: string }>
): ResolvedIntegration[] {
  return Object.entries(index).map(([key, entry]) => {
    if (isLegacySlotEntry(entry)) {
      return {
        providerId: entry.provider,
        config: entry.config,
        status: entry.status as ResolvedIntegration["status"],
        required: entry.status === "active",
        servesSlots: [],
      };
    }
    if (isProviderIntegrationEntry(entry)) {
      return {
        providerId: key,
        config: entry.config,
        status: entry.status,
        required: entry.status === "active",
        servesSlots: entry.serves_slots ?? [],
      };
    }
    const legacy = entry as LegacyIntegrationEntry;
    return {
      providerId: legacy.provider ?? key,
      config: legacy.config,
      status: (legacy.status as ResolvedIntegration["status"]) ?? "active",
      required: legacy.required ?? false,
      servesSlots: legacy.serves_slots ?? [],
    };
  });
}

interface SecretEntry {
  env_var: string;
  scope: "local" | "ci" | "both";
  required: boolean;
  description?: string;
  layer?: "sdlc" | "app" | "ci" | "runtime";
}

function parseDoctorMode(argv: string[]): DoctorMode {
  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      const mode = arg.slice("--mode=".length) as DoctorMode;
      if (mode === "structural" || mode === "operational") return mode;
      console.error(`Invalid --mode=${mode}. Use structural or operational.`);
      process.exit(1);
    }
  }
  return "operational";
}

const ROOT = join(__dirname, "../..");
const DOCTOR_MODE = parseDoctorMode(process.argv.slice(2));
const results: CheckResult[] = [];

function pass(group: string, check: string, message = "OK"): void {
  results.push({ group, check, status: "pass", message });
}

function warn(group: string, check: string, message: string, remediation?: string): void {
  results.push({ group, check, status: "warn", message, remediation });
}

function fail(group: string, check: string, message: string, remediation?: string): void {
  results.push({ group, check, status: "fail", message, remediation });
}

function hookCommandScriptPath(command: string): string {
  const trimmed = command.trim();
  const match = trimmed.match(/^(?:\S+\s+)(.+)$/);
  return match ? match[1] : trimmed;
}

function fileCheck(
  group: string,
  label: string,
  filePath: string,
  required = true,
  remediationNote?: string
): void {
  const full = join(ROOT, filePath);
  if (existsSync(full)) {
    pass(group, label);
  } else if (required) {
    fail(group, label, `Missing: ${filePath}`, remediationNote ?? `Create ${filePath}`);
  } else {
    warn(group, label, `Optional file missing: ${filePath}`, remediationNote);
  }
}

/** Directory skill (canonical): `.cursor/skills/{name}/SKILL.md` — flat `.cursor/skills/{name}.md` is deprecated */
function resolveSkillPath(skill: string): { path: string; layout: "flat" | "directory" } | null {
  const flatPath = `.cursor/skills/${skill}.md`;
  const directoryPath = `.cursor/skills/${skill}/SKILL.md`;
  if (existsSync(join(ROOT, directoryPath))) {
    return { path: directoryPath, layout: "directory" };
  }
  if (existsSync(join(ROOT, flatPath))) {
    return { path: flatPath, layout: "flat" };
  }
  return null;
}

function skillCheck(
  group: string,
  skill: string,
  required = true,
  checkLabel?: string
): void {
  const label = checkLabel ?? `skill:${skill}`;
  const resolved = resolveSkillPath(skill);
  const remediation =
    `Create .cursor/skills/${skill}/SKILL.md (Agent Skills directory layout)`;

  if (resolved) {
    if (resolved.layout === "flat") {
      warn(
        group,
        label,
        `Deprecated flat layout: ${resolved.path} — migrate to .cursor/skills/${skill}/SKILL.md`,
        remediation
      );
    } else {
      pass(group, label, resolved.path);
    }
    return;
  }
  if (required) {
    fail(group, label, `Missing skill: ${skill}`, remediation);
  } else {
    warn(group, label, `Optional skill missing: ${skill}`, remediation);
  }
}

// ── Load DSL ──────────────────────────────────────────────────────────────────

const sdlcPath = join(ROOT, ".sdlc/sdlc.yaml");
if (!existsSync(sdlcPath)) {
  console.error("❌ FATAL: .sdlc/sdlc.yaml not found. Run /sdlc:init first.");
  process.exit(1);
}

const sdlc = parseYaml(readFileSync(sdlcPath, "utf-8"));
const projectStatus: string = sdlc?.status ?? "operational";
const workspace = (sdlc?.workspace ?? {}) as { target_root?: string; profile?: string };
const targetRoot = workspace.target_root ?? ".";

// ════════════════════════════════════════════════════════════════════════════
// GROUP 0: Workspace (ADR-011)
// ════════════════════════════════════════════════════════════════════════════

const G0 = "0:workspace";

if (workspace.target_root) {
  pass(G0, "workspace:target_root-declared", `target_root=${workspace.target_root}`);
} else {
  warn(
    G0,
    "workspace:target_root-declared",
    "workspace.target_root missing — defaulting to repo root (.)",
    "Add workspace.target_root to .sdlc/sdlc.yaml per ADR-011"
  );
}

if (workspace.profile) {
  pass(G0, "workspace:profile-declared", `profile=${workspace.profile}`);
} else if (projectStatus === "operational") {
  warn(G0, "workspace:profile-declared", "workspace.profile not set", "Set profile during /sdlc:init");
}

if (projectStatus === "uninitialized") {
  pass(G0, "workspace:status-uninitialized", "Fresh install — awaiting /sdlc:init");
} else if (projectStatus === "operational") {
  pass(G0, "workspace:status-operational");
} else {
  warn(G0, "workspace:status", `Non-standard status: ${projectStatus}`, "Use uninitialized or operational");
}

if (projectStatus === "operational") {
  const targetPath = join(ROOT, targetRoot);
  if (existsSync(targetPath)) {
    pass(G0, `workspace:target_root-exists:${targetRoot}`);
  } else {
    fail(
      G0,
      `workspace:target_root-exists:${targetRoot}`,
      `Application root missing: ${targetRoot}`,
      `Create ${targetRoot}/ or update workspace.target_root`
    );
  }
}

// CI working-directory alignment (ADR-013) — paths from github gate_contract
function resolveCiCheckPathsFromContract(): string[] {
  const githubCfg = join(ROOT, ".sdlc/integrations/github/github.yaml");
  if (!existsSync(githubCfg)) return [];
  try {
    const github = parseYaml(readFileSync(githubCfg, "utf-8")) as {
      gate_contract?: {
        gates?: {
          "ci-target-aligned"?: { checks?: Array<{ paths?: string[] }> };
        };
      };
    };
    const checks = github?.gate_contract?.gates?.["ci-target-aligned"]?.checks ?? [];
    const paths: string[] = [];
    for (const check of checks) {
      for (const p of check.paths ?? []) {
        if (p && !paths.includes(p)) paths.push(p);
      }
    }
    return paths;
  } catch {
    return [];
  }
}

const ciWorkflows = resolveCiCheckPathsFromContract();
if (ciWorkflows.length === 0) {
  warn(
    G0,
    "workspace:ci-target-aligned",
    "No ci-target-aligned paths in active github gate_contract",
    "Add gate_contract.gates.ci-target-aligned.checks to github integration (ADR-013)"
  );
}
for (const wf of ciWorkflows) {
  const full = join(ROOT, wf);
  if (!existsSync(full)) {
    fail(G0, `workspace:ci-target-aligned:${wf}`, `Missing ${wf}`);
    continue;
  }
  const content = readFileSync(full, "utf-8");
  if (content.includes(`working-directory: ${targetRoot}`)) {
    pass(G0, `workspace:ci-target-aligned:${wf}`, `working-directory: ${targetRoot}`);
  } else {
    fail(
      G0,
      `workspace:ci-target-aligned:${wf}`,
      `${wf} missing working-directory: ${targetRoot}`,
      `Run python3 .sdlc/bin/sdlc_workspace_rebind.py --target ${targetRoot}`
    );
  }
}

// Gate declaration sync (ADR-012)
const declaredGates = (sdlc?.gates ?? {}) as Record<string, string[]>;
const IMPLEMENTED_STAGE_GATES: Record<string, string[]> = {
  integration: ["integration-report", "joint-e2e-pass"],
  deploy: ["ci-target-aligned", "staging-smoke-or-url"],
  "post-deploy": ["evidence-manifest", "production-http-200"],
  reflect: ["reflect-report-pass"],
  "workspace-rebind": ["rebind-report", "ci-target-aligned"],
};
if (Object.keys(declaredGates).length === 0) {
  fail(
    G0,
    "gates:declared-in-sdlc-yaml",
    "gates: section missing from .sdlc/sdlc.yaml",
    "Add gates section per ADR-012"
  );
} else {
  let gateSyncOk = true;
  for (const [stage, checks] of Object.entries(IMPLEMENTED_STAGE_GATES)) {
    const declared = declaredGates[stage] ?? [];
    for (const check of checks) {
      if (!declared.includes(check)) {
        fail(
          G0,
          `gates:declared:${stage}:${check}`,
          `gates.${stage} missing check '${check}'`,
          `Add '${check}' to gates.${stage} in sdlc.yaml`
        );
        gateSyncOk = false;
      }
    }
  }
  if (gateSyncOk) {
    pass(G0, "gates:declared-in-sdlc-yaml", `${Object.keys(declaredGates).length} stages declared`);
  }
}

const integrationIndex = (sdlc?.integrations ?? {}) as Record<
  string,
  ProviderIntegrationEntry | LegacyIntegrationEntry | { provider: string; config: string; status: string }
>;
const resolvedIntegrations = resolveIntegrations(integrationIndex);

// Integrations on disk must match declared active providers
const G0I = "0:integrations-disk";
const integrationsRoot = join(ROOT, ".sdlc/integrations");
const declaredProviders = new Set(
  resolvedIntegrations
    .filter((r) => r.status === "active" || r.status === "pending_credentials")
    .map((r) => r.providerId)
);

if (projectStatus === "uninitialized") {
  if (Object.keys(integrationIndex).length === 0) {
    pass(G0I, "integrations:empty-yaml");
  } else {
    fail(
      G0I,
      "integrations:empty-yaml",
      "status=uninitialized but integrations block is non-empty",
      "Clear integrations: {} until /sdlc:init completes slot selection"
    );
  }
}

// serves_slots validation — phase binding on integrations (ADR-011 option B)
const slotOwner = new Map<string, string>();
for (const integration of resolvedIntegrations) {
  if (integration.status !== "active" && integration.status !== "pending_credentials") {
    continue;
  }

  if (integration.servesSlots.length === 0) {
    if (projectStatus === "operational") {
      fail(
        G0I,
        `integration:serves_slots-missing:${integration.providerId}`,
        `integrations.${integration.providerId} has no serves_slots`,
        `Add serves_slots with at least one lifecycle phase id`
      );
    } else {
      warn(G0I, `integration:serves_slots-missing:${integration.providerId}`, "serves_slots empty during init");
    }
    continue;
  }

  for (const slot of integration.servesSlots) {
    if (!CANONICAL_SLOT_IDS.has(slot)) {
      fail(
        G0I,
        `integration:invalid-slot:${integration.providerId}:${slot}`,
        `Unknown slot id '${slot}' on integrations.${integration.providerId}`,
        `Use a canonical slot id from .sdlc/schemas/lifecycle-slots.schema.json`
      );
      continue;
    }
    if (slotOwner.has(slot)) {
      fail(
        G0I,
        `integration:duplicate-slot:${slot}`,
        `Slot '${slot}' claimed by both ${slotOwner.get(slot)} and ${integration.providerId}`,
        "Each slot must be covered by exactly one materialized integration"
      );
      continue;
    }
    slotOwner.set(slot, integration.providerId);
    pass(G0I, `integration:serves_slot:${integration.providerId}:${slot}`);
  }
}

const slotCoverage = slotOwner;

if (projectStatus === "operational") {
  for (const slot of REQUIRED_OPERATIONAL_SLOTS) {
    if (slotCoverage.has(slot)) {
      pass(G0I, `integrations:required-slot-covered:${slot}`, `${slotCoverage.get(slot)}`);
    } else {
      fail(
        G0I,
        `integrations:required-slot-covered:${slot}`,
        `Required slot '${slot}' not covered by any integration serves_slots`,
        `Add a provider with serves_slots including ${slot} via /sdlc:init or /sdlc:config`
      );
    }
  }
}

for (const integration of resolvedIntegrations) {
  if (integration.status === "none") continue;
  fileCheck(
    G0I,
    `integration:config:${integration.providerId}`,
    integration.config,
    integration.status === "active",
    `Materialize ${integration.providerId} via /sdlc:init or /sdlc:config add`
  );
}

const ORPHAN_INTEGRATION_ALLOWLIST = new Set(["sentry", "browser-remote.example"]);
if (existsSync(integrationsRoot)) {
  const onDisk = readdirSync(integrationsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of onDisk) {
    if (declaredProviders.has(dir)) continue;
    if (ORPHAN_INTEGRATION_ALLOWLIST.has(dir)) {
      warn(
        G0I,
        `integration:orphan:${dir}`,
        `Directory .sdlc/integrations/${dir}/ exists but is not in sdlc.yaml.integrations (migration debt)`,
        "Remove via /sdlc:config remove or delete after migration"
      );
      continue;
    }
    if (projectStatus === "uninitialized") {
      fail(
        G0I,
        `integration:orphan:${dir}`,
        `Unexpected integration directory before init: ${dir}`,
        "CLI install must not pre-materialize integrations"
      );
    } else {
      warn(
        G0I,
        `integration:orphan:${dir}`,
        `Orphan integration directory: ${dir}`,
        "Register in sdlc.yaml or remove"
      );
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 1: Runtime Rules
// ════════════════════════════════════════════════════════════════════════════

const G = "1:rules";
const declaredRules: string[] = sdlc?.runtime?.rules ?? [];

if (declaredRules.length === 0) {
  fail(G, "rules:declared", "No rules declared in sdlc.yaml runtime.rules");
}

for (const rulePath of declaredRules) {
  fileCheck(G, `rule:${rulePath}`, rulePath, true, `Create ${rulePath} with frontmatter and content`);
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 2: Commands
// ════════════════════════════════════════════════════════════════════════════

const G2 = "2:commands";
const declaredCommands: string[] = sdlc?.runtime?.commands ?? [];

// Auto-derive file path from slash command name
function commandToFile(cmd: string): string {
  const name = cmd.replace(/^\//, "").replace(/:/g, "-");
  return `.cursor/commands/${name}.md`;
}

for (const cmd of declaredCommands) {
  fileCheck(G2, `command:${cmd}`, commandToFile(cmd), true, `Create ${commandToFile(cmd)}`);
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 3: Agents
// ════════════════════════════════════════════════════════════════════════════

const G3 = "3:agents";
const declaredAgents: string[] = sdlc?.runtime?.agents ?? [];

for (const agent of declaredAgents) {
  fileCheck(G3, `agent:${agent}`, `.cursor/agents/${agent}.md`, true);
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 4: Skills
// ════════════════════════════════════════════════════════════════════════════

const G4 = "4:skills";
const declaredSkills: string[] = sdlc?.runtime?.skills ?? [];

if (declaredSkills.length === 0) {
  warn(G4, "skills:declared", "No skills declared in sdlc.yaml runtime.skills");
} else {
  for (const skill of declaredSkills) {
    skillCheck(G4, skill, true);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 5: MCP Servers
// ════════════════════════════════════════════════════════════════════════════

const G5 = "5:mcps";
const mcps: Array<{ name: string; required: boolean; plugin?: string }> = sdlc?.runtime?.mcps ?? [];
const settingsPath = join(ROOT, ".cursor/settings.json");
let settings: Record<string, unknown> = {};

if (existsSync(settingsPath)) {
  settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
} else {
  fail(G5, "settings.json", "Missing .cursor/settings.json");
}

const mcpServers: Record<string, unknown> = (settings as any)?.mcpServers ?? {};
const contextSources: string[] = (settings as any)?.contextSources ?? [];

for (const mcp of mcps) {
  const presentInSettings = mcp.name in mcpServers;
  const isPlugin = !!mcp.plugin;
  const materialized = presentInSettings || isPlugin;

  if (mcp.required) {
    if (materialized) {
      pass(G5, `mcp:${mcp.name}`);
    } else {
      fail(G5, `mcp:${mcp.name}`,
        `Required MCP not configured: ${mcp.name}`,
        `Add '${mcp.name}' to mcpServers in .cursor/settings.json`
      );
    }
  } else {
    if (materialized) {
      pass(G5, `mcp:${mcp.name}`);
    } else {
      warn(G5, `mcp:${mcp.name}`, `Optional MCP not configured: ${mcp.name}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 6: Hooks
// ════════════════════════════════════════════════════════════════════════════

const G6 = "6:hooks";
const declaredHooks: string = sdlc?.runtime?.hooks ?? "";

fileCheck(G6, "hooks.json", ".cursor/hooks.json", true,
  "Create .cursor/hooks.json with sessionStart and stop hooks");

if (existsSync(join(ROOT, ".cursor/hooks.json"))) {
  const hooksJson = JSON.parse(readFileSync(join(ROOT, ".cursor/hooks.json"), "utf-8"));
  const hookEvents = Object.keys(hooksJson?.hooks ?? {});

  if (hookEvents.includes("sessionStart")) {
    pass(G6, "hook:sessionStart");
    // Check the hook script exists and is executable
    const sessionHooks = hooksJson.hooks.sessionStart as Array<{ command?: string }>;
    for (const h of sessionHooks) {
      if (h.command) {
        const scriptPath = hookCommandScriptPath(h.command);
        fileCheck(G6, `hook-script:${h.command}`, scriptPath, true,
          `Create script at ${scriptPath} and make it executable (chmod +x)`);
      }
    }
  } else {
    fail(G6, "hook:sessionStart",
      "sessionStart hook not configured — context injection will not fire",
      "Add sessionStart entry to .cursor/hooks.json pointing to session-start.sh"
    );
  }

  if (!hookEvents.includes("stop")) {
    warn(G6, "hook:stop",
      "stop hook not configured — handoff prompting will not fire automatically",
      "Add stop hook to .cursor/hooks.json"
    );
  } else {
    pass(G6, "hook:stop");
  }
} else {
  fail(G6, "hooks.json:events", "Cannot check hook events — hooks.json missing");
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 7: Workflows
// ════════════════════════════════════════════════════════════════════════════

const G7 = "7:workflows";
const workflows: Record<string, { definition: string; trigger: string }> = sdlc?.workflows ?? {};

if (Object.keys(workflows).length === 0) {
  fail(G7, "workflows:declared", "No workflows declared in sdlc.yaml");
}

for (const [name, wf] of Object.entries(workflows)) {
  fileCheck(G7, `workflow:${name}`, wf.definition, true,
    `Create ${wf.definition}`);

  // Verify trigger command is also declared
  if (wf.trigger && !declaredCommands.includes(wf.trigger)) {
    warn(G7, `workflow:${name}:trigger`,
      `Workflow '${name}' trigger '${wf.trigger}' not found in runtime.commands`,
      `Add '${wf.trigger}' to sdlc.yaml runtime.commands`
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 8: Source of Truth
// ════════════════════════════════════════════════════════════════════════════

const G8 = "8:source-of-truth";
const sot = sdlc?.source_of_truth ?? {};

fileCheck(G8, "index", ".sdlc/INDEX.md", true,
  "Create .sdlc/INDEX.md — the navigational source of truth for all project docs");

fileCheck(G8, "handoff:latest", ".sdlc/handoffs/LATEST.md", false,
  "Run /handoff to create the first handoff record");

fileCheck(G8, "architecture-memory", ".cursor/memories/architecture.md", true);
fileCheck(G8, "operational-memory", ".cursor/memories/operational-context.md", true);
fileCheck(G8, "business-rules", ".cursor/memories/business-rules.md", true);
fileCheck(G8, "incidents-log", ".cursor/memories/incidents.md", true);

// Verify contextSources in settings.json reference files that exist
const expectedContextSources = [
  ".sdlc/INDEX.md",
  ".sdlc/handoffs/LATEST.md",
  ".cursor/memories/architecture.md",
  ".cursor/memories/operational-context.md",
  ".sdlc/sdlc.yaml",
];

for (const expected of expectedContextSources) {
  if (!contextSources.includes(expected)) {
    warn(G8, `contextSource:${expected}`,
      `'${expected}' not in settings.json contextSources — will not auto-load`,
      `Add '${expected}' to contextSources in .cursor/settings.json`
    );
  } else {
    pass(G8, `contextSource:${expected}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 9: Plane Integration
// Config is owned by .sdlc/integrations/plane/plane.yaml — read from there.
// ════════════════════════════════════════════════════════════════════════════

const G9 = "9:plane";

const planeIntegrationEntry = resolvedIntegrations.find((r) => r.providerId === "plane");
const planeRequired =
  planeIntegrationEntry !== undefined &&
  (planeIntegrationEntry.status === "active" || planeIntegrationEntry.status === "pending_credentials") &&
  planeIntegrationEntry.servesSlots.includes("work_items");

const planeIntegrationPath = join(ROOT, ".sdlc/integrations/plane/plane.yaml");

if (planeRequired) {
  fileCheck(G9, "plane:integration-config", ".sdlc/integrations/plane/plane.yaml", true,
    "Create .sdlc/integrations/plane/plane.yaml with connection, states, and ticket_structure");
  fileCheck(G9, "plane:ticket-template", ".sdlc/templates/plane-ticket.md", true,
    "Create .sdlc/templates/plane-ticket.md with the mandatory ticket structure");
  skillCheck(G9, "plane-ticket", true, "plane:skill");
} else {
  pass(G9, "plane:not-selected", "work_items slot does not use Plane — plane checks skipped");
}

// Load plane config from its integration file (the authoritative source)
let planeConfig: Record<string, unknown> = {};
if (planeRequired && existsSync(planeIntegrationPath)) {
  planeConfig = parseYaml(readFileSync(planeIntegrationPath, "utf-8")) ?? {};
}

if (planeRequired) {
  const planeConn = (planeConfig.connection ?? {}) as Record<string, unknown>;

  if (planeConn.workspace_slug) {
    pass(G9, "plane:workspace-slug");
  } else {
    fail(G9, "plane:workspace-slug",
      "connection.workspace_slug not set in plane.yaml",
      "Set workspace_slug in .sdlc/integrations/plane/plane.yaml connection block"
    );
  }

  if (planeConn.project_id) {
    pass(G9, "plane:project-id");
  } else {
    fail(G9, "plane:project-id",
      "connection.project_id not set in plane.yaml",
      "Set project_id in .sdlc/integrations/plane/plane.yaml connection block"
    );
  }

  const planeStates = (planeConfig.states ?? {}) as Record<string, unknown>;
  if (Object.keys(planeStates).length >= 4) {
    pass(G9, "plane:states");
  } else {
    fail(G9, "plane:states",
      "states not fully configured in plane.yaml — UUIDs required for ticket lifecycle automation",
      "Run: curl -H 'X-API-Key: $PLANE_API_KEY' https://api.plane.so/api/v1/workspaces/{slug}/projects/{id}/states/"
    );
  }

  // Live API check — operational mode only; non-blocking when key missing
  if (DOCTOR_MODE === "operational") {
    try {
      const apiKey = process.env.PLANE_API_KEY ?? "";
      if (apiKey) {
        const result = execSync(
          `curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: ${apiKey}" ` +
          `"https://api.plane.so/api/v1/workspaces/${planeConn.workspace_slug}/projects/${planeConn.project_id}/issues/?per_page=1"`,
          { timeout: 8000, encoding: "utf-8" }
        ).trim();
        if (result === "200") {
          pass(G9, "plane:api-live");
        } else {
          warn(G9, "plane:api-live",
            `Plane API returned HTTP ${result} — check PLANE_API_KEY`,
            "export PLANE_API_KEY=plane_api_..."
          );
        }
      } else if (planeIntegrationEntry?.status === "pending_credentials") {
        warn(G9, "plane:api-live",
          "PLANE_API_KEY not set — work_items integration pending_credentials",
          "Complete credential collection from .sdlc/credential-manifest.yaml"
        );
      } else {
        warn(G9, "plane:api-live",
          "PLANE_API_KEY not set — cannot verify live API connection",
          "export PLANE_API_KEY=plane_api_..."
        );
      }
    } catch {
      warn(G9, "plane:api-live", "Plane API check timed out or network unavailable");
    }
  } else {
    pass(G9, "plane:api-live-skipped", "structural mode — live API check deferred");
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 9b: Local work-items + deliverables (ADR-025, ADR-040)
// ════════════════════════════════════════════════════════════════════════════

const G9b = "9b:local-work-items-deliverables";
const workItemsSlot = String(sot.work_items ?? "").trim();
const localWorkItemsRequired = workItemsSlot === "local-work-items";

if (localWorkItemsRequired) {
  fileCheck(
    G9b,
    "local-work-items:integration-config",
    ".sdlc/integrations/local-work-items/local-work-items.yaml",
    true
  );
  fileCheck(G9b, "local-work-items:board-index", ".sdlc/work-items/INDEX.md", true);
  fileCheck(G9b, "local-work-items:ticket-template", ".sdlc/templates/plane-ticket.md", true);
  skillCheck(G9b, "local-ticket", true, "local-work-items:skill");
  skillCheck(G9b, "work-items-ticket", true, "local-work-items:resolver-skill");
} else {
  pass(G9b, "local-work-items:not-selected", "work_items slot is not local-work-items — checks skipped");
}

const deliverables = (sdlc?.deliverables ?? {}) as Record<string, unknown>;
const deliverablesRoot = String(deliverables.root ?? "output/").replace(/\/$/, "");
fileCheck(G9b, "deliverables:readme", `${deliverablesRoot}/README.md`, true,
  `Create ${deliverablesRoot}/README.md per ADR-040 directory index mandate`);

// ════════════════════════════════════════════════════════════════════════════
// GROUP 10: Autonomous Maintenance → GitHub Actions
// ════════════════════════════════════════════════════════════════════════════

const G10 = "10:autonomous-maintenance";
const am = sdlc?.autonomous_maintenance ?? {};

const maintenanceWorkflowMap: Record<string, string> = {
  dependency_updates: ".github/workflows/dependency-updates.yaml",
  flaky_tests: ".github/workflows/e2e.yaml",
  telemetry_driven_refactoring: ".github/workflows/incident-response.yaml",
};

for (const [feature, config] of Object.entries(am) as Array<[string, { enabled: boolean }]>) {
  if (!config.enabled) {
    warn(G10, `maintenance:${feature}:disabled`,
      `autonomous_maintenance.${feature} declared but disabled`,
      "Set enabled: true or remove from sdlc.yaml"
    );
    continue;
  }

  const workflowFile = maintenanceWorkflowMap[feature];
  if (workflowFile) {
    fileCheck(G10, `maintenance:${feature}:workflow`, workflowFile, true,
      `Create ${workflowFile} to materialize ${feature} autonomous maintenance`);
  } else {
    warn(G10, `maintenance:${feature}:unmapped`,
      `autonomous_maintenance.${feature} is enabled but has no known GitHub Actions workflow`,
      "Add a workflow file mapping in runtime-alignment.ts"
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 11: Constraints Enforcement
// ════════════════════════════════════════════════════════════════════════════

const G11 = "11:constraints";
const constraints = sdlc?.constraints ?? {};

if (constraints.worktrees_mandatory) {
  // Worktree skill must exist
  skillCheck(G11, "worktree", true, "constraint:worktrees_mandatory:skill");
  // Architecture rule must mention worktrees
  const archRule = join(ROOT, ".cursor/rules/architecture.mdc");
  if (existsSync(archRule)) {
    const content = readFileSync(archRule, "utf-8");
    if (content.toLowerCase().includes("worktree")) {
      pass(G11, "constraint:worktrees_mandatory:rule");
    } else {
      warn(G11, "constraint:worktrees_mandatory:rule",
        "architecture.mdc does not mention worktrees",
        "Add worktree mandate section to .cursor/rules/architecture.mdc"
      );
    }
  }
}

if (constraints.no_deploy_without_e2e) {
  fileCheck(G11, "constraint:no_deploy_without_e2e:workflow", ".github/workflows/e2e.yaml", true);
}

if (constraints.handoff_required_on_completion) {
  // Check stop hook exists
  if (existsSync(join(ROOT, ".cursor/hooks.json"))) {
    const hooksJson = JSON.parse(readFileSync(join(ROOT, ".cursor/hooks.json"), "utf-8"));
    if (hooksJson?.hooks?.stop) {
      pass(G11, "constraint:handoff_required:stop-hook");
    } else {
      fail(G11, "constraint:handoff_required:stop-hook",
        "handoff_required_on_completion=true but no stop hook configured",
        "Add stop hook to .cursor/hooks.json that prompts for /handoff"
      );
    }
  }
  skillCheck(G11, "handoff", true, "constraint:handoff_required:skill");
  fileCheck(G11, "constraint:handoff_required:command", ".cursor/commands/handoff.md", true);
}

if (constraints.index_must_be_updated) {
  fileCheck(G11, "constraint:index_must_be_updated:file", ".sdlc/INDEX.md", true);
}

if (constraints.plane_ticket_required) {
  skillCheck(G11, "work-items-ticket", true, "constraint:work_items_ticket_required:work-items-ticket");
  skillCheck(G11, "spec-writer", true, "constraint:work_items_ticket_required:spec-writer");
  const workItemsProvider = String(sot.work_items ?? "").trim();
  if (workItemsProvider === "local-work-items") {
    skillCheck(G11, "local-ticket", true, "constraint:work_items_ticket_required:local-ticket");
    fileCheck(G11, "constraint:work_items_ticket_required:board", ".sdlc/work-items/INDEX.md", true);
    fileCheck(
      G11,
      "constraint:work_items_ticket_required:integration",
      ".sdlc/integrations/local-work-items/local-work-items.yaml",
      true
    );
  } else if (workItemsProvider === "plane") {
    skillCheck(G11, "plane-ticket", true, "constraint:work_items_ticket_required:plane-ticket");
  } else if (workItemsProvider) {
    warn(
      G11,
      "constraint:work_items_ticket_required:provider-skill",
      `work_items provider ${workItemsProvider} — verify ticket skill via runtime.ticket_skill_ref`
    );
  }
}

if (constraints.no_pr_without_evidence) {
  skillCheck(G11, "qa-recording", true, "constraint:no_pr_without_evidence:skill");
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 12: Handoff System
// ════════════════════════════════════════════════════════════════════════════

const G12 = "12:handoff-system";
const handoffConfig = sdlc?.handoff ?? {};

fileCheck(G12, "handoff:storage-dir", ".sdlc/handoffs", true,
  "Create .sdlc/handoffs/ directory");
fileCheck(G12, "handoff:latest", ".sdlc/handoffs/LATEST.md", false,
  "Run /handoff to bootstrap the first handoff record");
skillCheck(G12, "handoff", true, "handoff:skill");
fileCheck(G12, "handoff:command", ".cursor/commands/handoff.md", true);

// Verify session-start hook reads handoffs
const hookScript = join(ROOT, ".cursor/hooks/session-start.sh");
if (existsSync(hookScript)) {
  const scriptContent = readFileSync(hookScript, "utf-8");
  if (scriptContent.includes("handoffs/LATEST.md")) {
    pass(G12, "handoff:hook-reads-latest");
  } else {
    fail(G12, "handoff:hook-reads-latest",
      "session-start.sh does not read .sdlc/handoffs/LATEST.md",
      "Add LATEST.md read to .cursor/hooks/session-start.sh"
    );
  }
} else {
  warn(G12, "handoff:hook-reads-latest", "session-start.sh not found — cannot verify");
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 13: Integration Secrets
// Iterates all .sdlc/integrations/*/*.yaml, reads secrets_required blocks,
// and validates presence in local env and (when gh is available) CI secrets.
// ════════════════════════════════════════════════════════════════════════════

const G13 = "13:integration-secrets";

if (DOCTOR_MODE === "structural") {
  pass(G13, "mode:structural", "Secret validation skipped — run --mode=operational after credential collection");
} else {
  const integrationFiles = resolvedIntegrations
    .filter((r) => r.status === "active" || r.status === "pending_credentials")
    .map((r) => r.config);

  // Attempt to list GitHub Actions secrets (non-blocking)
  let ciSecrets: Set<string> = new Set();
  let ghAvailable = false;
  try {
    const ghOutput = execSync("gh secret list 2>/dev/null", { timeout: 8000, encoding: "utf-8" });
    ciSecrets = new Set(
      ghOutput.split("\n").map((l) => l.trim().split(/\s+/)[0]).filter(Boolean)
    );
    ghAvailable = true;
  } catch {
    warn(G13, "ci-secrets:gh-cli",
      "gh CLI unavailable or not authenticated — CI secret validation skipped",
      "Run: gh auth login"
    );
  }

  for (const configPath of integrationFiles) {
    const fullPath = join(ROOT, configPath);
    if (!existsSync(fullPath)) continue;

    const integrationData = parseYaml(readFileSync(fullPath, "utf-8")) ?? {};
    const integrationName: string =
      (integrationData.integration as string) ??
      resolvedIntegrations.find((r) => r.config === configPath)?.providerId ??
      configPath;
    const integrationStatus =
      resolvedIntegrations.find((r) => r.config === configPath)?.status ?? "active";
    const secrets: SecretEntry[] = (integrationData.secrets_required as SecretEntry[]) ?? [];

    if (secrets.length === 0) {
      warn(G13, `${integrationName}:secrets-declared`,
        `${configPath} has no secrets_required block — cannot validate credentials`,
        `Add secrets_required block to ${configPath}`
      );
      continue;
    }

    for (const secret of secrets) {
      const { env_var, scope, required } = secret;
      const presentLocally = !!process.env[env_var];
      const presentInCi = ciSecrets.has(env_var);
      const secretRequired = required !== false;
      const failOnMissing = secretRequired && integrationStatus === "active";
      const warnOnMissing = integrationStatus === "pending_credentials" || !secretRequired;

      // Local check
      if (scope === "local" || scope === "both") {
        if (presentLocally) {
          pass(G13, `${integrationName}:local:${env_var}`);
        } else if (failOnMissing) {
          fail(G13, `${integrationName}:local:${env_var}`,
            `Required secret not set locally: ${env_var} (integration: ${integrationName})`,
            `export ${env_var}=... or add to .sdlc/.env or ${targetRoot}/.env per credential-manifest`
          );
        } else if (warnOnMissing) {
          warn(G13, `${integrationName}:local:${env_var}`,
            `Secret not set locally: ${env_var} (${integrationStatus})`,
          );
        }
      }

      // CI check (only when gh CLI is available)
      if (ghAvailable && (scope === "ci" || scope === "both")) {
        if (presentInCi) {
          pass(G13, `${integrationName}:ci:${env_var}`);
        } else if (failOnMissing) {
          fail(G13, `${integrationName}:ci:${env_var}`,
            `Required CI secret not registered: ${env_var} (integration: ${integrationName})`,
            `gh secret set ${env_var}`
          );
        } else if (warnOnMissing) {
          warn(G13, `${integrationName}:ci:${env_var}`,
            `CI secret not registered: ${env_var} (${integrationStatus})`,
          );
        }
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 13b: Orphan integration secrets (ADR-029)
// secrets_required env vars tied to incident slot must have incident in serves_slots
// ════════════════════════════════════════════════════════════════════════════

const G13b = "13b:orphan-secrets";
const ORPHAN_SECRET_SLOTS: Record<string, string> = {
  CURSOR_API_KEY: "incident",
  ANTHROPIC_API_KEY: "incident",
};

for (const resolved of resolvedIntegrations) {
  if (resolved.status !== "active" && resolved.status !== "pending_credentials") continue;
  const fullPath = join(ROOT, resolved.config);
  if (!existsSync(fullPath)) continue;
  const integrationData = parseYaml(readFileSync(fullPath, "utf-8")) ?? {};
  const serves = resolved.servesSlots ?? [];
  const secrets: Array<{ env_var?: string }> =
    (integrationData.secrets_required as Array<{ env_var?: string }>) ?? [];

  for (const secret of secrets) {
    const envVar = secret.env_var ?? "";
    const requiredSlot = ORPHAN_SECRET_SLOTS[envVar];
    if (!requiredSlot) continue;
    if (!serves.includes(requiredSlot)) {
      fail(
        G13b,
        `${resolved.providerId}:orphan:${envVar}`,
        `${envVar} declared in ${resolved.config} but serves_slots lacks '${requiredSlot}'`,
        `Remove secret from integration yaml or add '${requiredSlot}' via /sdlc:config / init questionnaire`
      );
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 14: Baseline (ADR-014)
// ════════════════════════════════════════════════════════════════════════════

const G14 = "14:baseline";
const baselineBlock = (sdlc?.baseline ?? {}) as Record<string, unknown>;
const sdlcBaselineTagRaw = baselineBlock.sdlc_baseline_tag;
const sdlcBaselineTag =
  typeof sdlcBaselineTagRaw === "string" && sdlcBaselineTagRaw.trim()
    ? sdlcBaselineTagRaw.trim()
    : null;

function gitTagRevParse(tag: string): string | null {
  try {
    return execSync(`git -C "${ROOT}" rev-parse "${tag}"`, {
      encoding: "utf-8",
      timeout: 8000,
    }).trim();
  } catch {
    return null;
  }
}

if (projectStatus === "operational") {
  if (!sdlcBaselineTag) {
    fail(
      G14,
      "baseline:sdlc_baseline_tag-set",
      "status=operational but baseline.sdlc_baseline_tag is null",
      'Run: python3 .sdlc/bin/sdlc_baseline.py init --reason "post-init bootstrap"'
    );
  } else {
    const rev = gitTagRevParse(sdlcBaselineTag);
    if (rev) {
      pass(G14, "baseline:sdlc_baseline_tag-exists", `${sdlcBaselineTag} → ${rev.slice(0, 12)}`);
    } else {
      fail(
        G14,
        "baseline:sdlc_baseline_tag-exists",
        `git tag not found: ${sdlcBaselineTag}`,
        "Run: python3 .sdlc/bin/sdlc_baseline.py verify"
      );
    }
  }
} else if (sdlcBaselineTag) {
  const rev = gitTagRevParse(sdlcBaselineTag);
  if (rev) {
    pass(G14, "baseline:sdlc_baseline_tag-exists", `${sdlcBaselineTag} (pre-operational)`);
  } else {
    warn(
      G14,
      "baseline:sdlc_baseline_tag-exists",
      `baseline tag declared but missing in git: ${sdlcBaselineTag}`,
      "Run: python3 .sdlc/bin/sdlc_baseline.py init"
    );
  }
} else {
  pass(G14, "baseline:not-required", `status=${projectStatus} — downstream tag not required yet`);
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP 15: Context Budget (memories, INDEX, directory indices)
// ════════════════════════════════════════════════════════════════════════════

const G15 = "15:context-budget";

try {
  const auditJson = execSync(`python3 "${join(ROOT, ".sdlc/bin/sdlc_context_optimize.py")}" audit --json`, {
    encoding: "utf-8",
    timeout: 60000,
    cwd: ROOT,
  }).trim();
  const audit = JSON.parse(auditJson) as {
    status: string;
    always_injected_tokens: number;
    index_tokens: number;
    warnings: string[];
    compressible_count: number;
    budget: { always_injected_warn_tokens: number };
  };

  pass(
    G15,
    "context:audit-ran",
    `always_injected=${audit.always_injected_tokens} index=${audit.index_tokens} compressible=${audit.compressible_count}`
  );

  if (audit.status === "OK") {
    pass(G15, "context:budget-within-limits", "memories and INDEX within configured thresholds");
  } else {
    for (const warning of audit.warnings.slice(0, 5)) {
      warn(
        G15,
        "context:budget-exceeded",
        warning,
        "python3 .sdlc/bin/sdlc_token_health.py --fix"
      );
    }
    if (audit.warnings.length > 5) {
      warn(
        G15,
        "context:budget-exceeded",
        `+${audit.warnings.length - 5} more warnings — run audit for full list`,
        "python3 .sdlc/bin/sdlc_context_optimize.py audit"
      );
    }
  }
} catch (err) {
  warn(
    G15,
    "context:audit-failed",
    err instanceof Error ? err.message : String(err),
    "Verify python3 .sdlc/bin/sdlc_context_optimize.py audit"
  );
}

// ════════════════════════════════════════════════════════════════════════════
// OUTPUT
// ════════════════════════════════════════════════════════════════════════════

const groups = [...new Set(results.map((r) => r.group))].sort();
const failed = results.filter((r) => r.status === "fail");
const warned = results.filter((r) => r.status === "warn");
const passed = results.filter((r) => r.status === "pass");

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log(`║   SDLC DSL → Runtime Materialization Audit (${DOCTOR_MODE})`.padEnd(63) + "║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

for (const group of groups) {
  const groupResults = results.filter((r) => r.group === group);
  const groupFail = groupResults.filter((r) => r.status === "fail").length;
  const groupWarn = groupResults.filter((r) => r.status === "warn").length;
  const groupIcon = groupFail > 0 ? "❌" : groupWarn > 0 ? "⚠️ " : "✅";
  console.log(`\n${groupIcon} Group ${group}`);

  for (const r of groupResults) {
    const icon = r.status === "pass" ? "  ✅" : r.status === "warn" ? "  ⚠️ " : "  ❌";
    console.log(`${icon} ${r.check}: ${r.message}`);
    if (r.remediation && r.status !== "pass") {
      console.log(`       → ${r.remediation}`);
    }
  }
}

console.log("\n──────────────────────────────────────────────────────────────");
console.log(
  `Totals: ${passed.length} passed  ${warned.length} warnings  ${failed.length} failures`
);

if (failed.length === 0 && warned.length === 0) {
  console.log("\n✅ FULLY MATERIALIZED — DSL intent is completely operational.");
} else if (failed.length === 0) {
  console.log(`\n⚠️  DEGRADED — ${warned.length} optional items not materialized.`);
} else {
  console.log(`\n❌ GAPS DETECTED — ${failed.length} required items not materialized.`);
  console.log("   Run /sdlc:init --fix or address each ❌ above.");
}
console.log("");

if (failed.length > 0) process.exit(1);
if (warned.length > 0) process.exit(2);
process.exit(0);
