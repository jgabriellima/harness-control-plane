/**
 * Integration Check
 *
 * Validates that all integrations declared in sdlc.yaml have their configuration
 * files present and that critical environment variables are documented.
 *
 * Run: npx ts-node .sdlc/doctor/integration-check.ts
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

interface IntegrationResult {
  integration: string;
  required: boolean;
  config_exists: boolean;
  env_vars_documented: boolean;
  status: "pass" | "warn" | "fail";
  issues: string[];
}

const ROOT = join(__dirname, "../..");
const results: IntegrationResult[] = [];

const sdlcPath = join(ROOT, ".sdlc/sdlc.yaml");
const sdlc = parseYaml(readFileSync(sdlcPath, "utf-8"));
const integrations: Record<string, { enabled?: boolean; config: string; required?: boolean; provider?: string; status?: string }> =
  sdlc?.integrations ?? {};

const envExamplePath = join(ROOT, sdlc?.workspace?.target_root ?? "app", ".env.example");
const envExample = existsSync(envExamplePath) ? readFileSync(envExamplePath, "utf-8") : "";

const integrationEnvVars: Record<string, string[]> = {
  sentry: ["PUBLIC_SENTRY_DSN", "SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"],
  github: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
  plane: ["PLANE_API_KEY", "PLANE_WORKSPACE_SLUG", "PLANE_PROJECT_ID"],
  cloudflare-pages: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_PAGES_PROJECT_NAME"],
};

for (const [name, config] of Object.entries(integrations)) {
  const issues: string[] = [];
  const provider = (config as { provider?: string }).provider ?? name;
  const isRequired =
    config.status === "active" ||
    (config.required === true && config.status !== "pending_credentials" && config.status !== "none");

  if (config.status === "none") continue;

  const configExists = existsSync(join(ROOT, config.config));
  if (!configExists) {
    issues.push(`Config file missing: ${config.config}`);
  }

  const requiredVars = integrationEnvVars[provider] ?? integrationEnvVars[name] ?? [];
  let allVarsDocumented = true;
  for (const envVar of requiredVars) {
    // Check if documented in .env.example OR in the integration config file itself
    const configContent = configExists
      ? readFileSync(join(ROOT, config.config), "utf-8")
      : "";
    if (!envExample.includes(envVar) && !configContent.includes(envVar)) {
      issues.push(`Env var not documented: ${envVar}`);
      allVarsDocumented = false;
    }
  }

  const status =
    issues.length === 0
      ? "pass"
      : isRequired
        ? "fail"
        : "warn";

  results.push({
    integration: provider,
    required: isRequired,
    config_exists: configExists,
    env_vars_documented: allVarsDocumented,
    status,
    issues,
  });
}

// ── Additional: Sentry SDK in app/astro.config.mjs ───────────────────────────

const astroConfigPath = join(ROOT, sdlc?.workspace?.target_root ?? "app", "astro.config.mjs");
if (existsSync(astroConfigPath)) {
  const astroConfig = readFileSync(astroConfigPath, "utf-8");
  const hasSentry = astroConfig.includes("sentry") || astroConfig.includes("@sentry/astro");

  results.push({
    integration: "sentry-sdk",
    required: true,
    config_exists: hasSentry,
    env_vars_documented: true,
    status: hasSentry ? "pass" : "warn",
    issues: hasSentry
      ? []
      : ["@sentry/astro not integrated in app/astro.config.mjs — run /sdlc:init to configure"],
  });
}

// ── Output ────────────────────────────────────────────────────────────────────

const failed = results.filter((r) => r.status === "fail");
const warned = results.filter((r) => r.status === "warn");
const passed = results.filter((r) => r.status === "pass");

console.log("\n=== Integration Check ===\n");

for (const r of results) {
  const icon = r.status === "pass" ? "✅" : r.status === "warn" ? "⚠️ " : "❌";
  const req = r.required ? "[required]" : "[optional]";
  console.log(`${icon} ${r.integration} ${req}`);
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
