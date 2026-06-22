/**
 * catalog-patch unit checks (PROJ-3). Run: npx ts-node pipeline/catalog-patch.test.ts
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import {
  filterSecretsBySlots,
  patchGithubIntegration,
  listOrphanSecretsInYaml,
} from "./catalog-patch";
import type { InitSelections } from "./types";

const ROOT = join(__dirname, "../..");
let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

const baseInit: InitSelections = {
  version: 1,
  confirmed_at: "2026-06-08T12:00:00Z",
  workspace: { target_root: ".", profile: "python-library", mode: "bind" },
  delivery: {
    default_closure: "local-validated",
    surfaces: { local: true, preview: false, staging: false, production: false },
  },
  slots: {
    work_items: "local-work-items",
    source_control: "github",
    ci: "github-actions",
    incident: "none",
  },
  incident: null,
};

const secrets = [
  { env_var: "GITHUB_PERSONAL_ACCESS_TOKEN" },
  { env_var: "CURSOR_API_KEY" },
];
const filtered = filterSecretsBySlots(secrets, ["source_control", "ci"], baseInit);
assert(
  filtered.length === 1 && filtered[0].env_var === "GITHUB_PERSONAL_ACCESS_TOKEN",
  "incident none strips CURSOR_API_KEY"
);

const withCursor: InitSelections = {
  ...baseInit,
  slots: { ...baseInit.slots, incident: "github-issues-cursor-sdk" },
  incident: {
    provider_token: "github-issues-cursor-sdk",
    agent_runtime: "cursor-sdk",
    trigger: "github-issue-label",
    execution: "ci",
    auto_merge: false,
  },
};
const filtered2 = filterSecretsBySlots(secrets, ["source_control", "ci", "incident"], withCursor);
assert(filtered2.length === 2, "incident cursor-sdk keeps CURSOR_API_KEY");

const orphans = listOrphanSecretsInYaml(
  { secrets_required: [{ env_var: "CURSOR_API_KEY" }] },
  ["source_control", "ci"],
  null
);
assert(orphans.includes("CURSOR_API_KEY"), "orphan detection without incident slot");

const tmpDir = join(ROOT, ".sdlc/pipeline/.catalog-patch-test");
const configPath = join(tmpDir, "github.yaml");
try {
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(
    configPath,
    "integration: github\nsecrets_required:\n  - env_var: GITHUB_PERSONAL_ACCESS_TOKEN\nserves_slots: [source_control, ci]\n",
    "utf-8"
  );
  patchGithubIntegration(ROOT, configPath, baseInit);
  const doc = parseYaml(readFileSync(configPath, "utf-8")) as {
    secrets_required?: Array<{ env_var: string }>;
  };
  const envs = (doc.secrets_required ?? []).map((s) => s.env_var);
  assert(!envs.includes("CURSOR_API_KEY"), "patch does not add CURSOR when incident none");
} finally {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`catalog-patch.test.ts: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
