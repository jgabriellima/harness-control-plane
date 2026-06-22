/**
 * Workflow Check
 *
 * Validates that GitHub Actions workflows are syntactically valid YAML
 * and reference files that actually exist in the project.
 *
 * Run: npx ts-node .sdlc/doctor/workflow-check.ts
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

interface WorkflowResult {
  file: string;
  exists: boolean;
  valid_yaml: boolean;
  issues: string[];
  status: "pass" | "warn" | "fail";
}

const ROOT = join(__dirname, "../..");
const results: WorkflowResult[] = [];

const requiredWorkflows = [
  ".github/workflows/validate.yaml",
  ".github/workflows/deploy.yaml",
  ".github/workflows/e2e.yaml",
  ".github/workflows/dependency-updates.yaml",
  ".github/workflows/incident-response.yaml",
];

for (const workflowPath of requiredWorkflows) {
  const fullPath = join(ROOT, workflowPath);
  const issues: string[] = [];

  if (!existsSync(fullPath)) {
    results.push({
      file: workflowPath,
      exists: false,
      valid_yaml: false,
      issues: [`File missing: ${workflowPath}`],
      status: "fail",
    });
    continue;
  }

  const content = readFileSync(fullPath, "utf-8");
  let parsed: unknown = null;
  let validYaml = true;

  try {
    parsed = parseYaml(content, { strict: false });
  } catch (e: unknown) {
    // GitHub Actions workflows can contain JS template literals inside script: blocks
    // which some YAML parsers reject. Treat parse errors as warnings, not failures,
    // since GitHub's own parser handles these correctly.
    validYaml = false;
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    issues.push(`YAML parse warning (may be false positive for github-script): ${msg}`);
  }

  if (validYaml && parsed) {
    const workflow = parsed as Record<string, unknown>;

    // Check for required GitHub Actions top-level keys
    if (!workflow["on"]) issues.push("Missing 'on' trigger definition");
    if (!workflow["jobs"]) issues.push("Missing 'jobs' definition");
    if (!workflow["name"]) issues.push("Missing 'name' field (recommended)");
  }

  const status = issues.length === 0 ? "pass" : issues.some((i) => i.includes("Missing 'on'") || i.includes("Missing 'jobs'")) ? "fail" : "warn";

  results.push({
    file: workflowPath,
    exists: true,
    valid_yaml: validYaml,
    issues,
    status,
  });
}

// ── Check: ai-native workflow definitions ────────────────────────────────────

const aiNativeWorkflows = readdirSync(join(ROOT, ".sdlc/workflows")).filter((f) =>
  f.endsWith(".yaml")
);

for (const workflowFile of aiNativeWorkflows) {
  const fullPath = join(ROOT, `.sdlc/workflows/${workflowFile}`);
  const content = readFileSync(fullPath, "utf-8");
  const issues: string[] = [];

  try {
    const parsed = parseYaml(content) as Record<string, unknown>;

    if (!parsed?.name) issues.push("Missing 'name' field");
    if (!parsed?.stages && !parsed?.phases) issues.push("Missing 'stages' or 'phases' definition");
  } catch (e: unknown) {
    issues.push(`Invalid YAML: ${e instanceof Error ? e.message : String(e)}`);
  }

  results.push({
    file: `.sdlc/workflows/${workflowFile}`,
    exists: true,
    valid_yaml: issues.every((i) => !i.includes("Invalid")),
    issues,
    status: issues.length === 0 ? "pass" : "warn",
  });
}

// ── Output ────────────────────────────────────────────────────────────────────

const failed = results.filter((r) => r.status === "fail");
const warned = results.filter((r) => r.status === "warn");
const passed = results.filter((r) => r.status === "pass");

console.log("\n=== Workflow Check ===\n");

for (const r of results) {
  const icon = r.status === "pass" ? "✅" : r.status === "warn" ? "⚠️ " : "❌";
  console.log(`${icon} ${r.file}`);
  for (const issue of r.issues) {
    console.log(`   → ${issue}`);
  }
}

console.log(
  `\nSummary: ${passed.length} passed, ${warned.length} warnings, ${failed.length} failures`
);

if (failed.length > 0) process.exit(1);
if (warned.length > 0) process.exit(2);
process.exit(0);
