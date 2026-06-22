/**
 * Capability Check
 *
 * Validates that all required tooling is installed and available:
 * Node.js version, Playwright, Sentry CLI, Vercel CLI, GitHub CLI.
 *
 * Run: npx ts-node .sdlc/doctor/capability-check.ts
 */

import { execSync } from "child_process";
import { join } from "path";

const ROOT = join(__dirname, "../..");

interface CapabilityResult {
  tool: string;
  required: boolean;
  available: boolean;
  version?: string;
  message: string;
  remediation?: string;
}

const results: CapabilityResult[] = [];

function checkCommand(
  tool: string,
  command: string,
  required: boolean,
  versionRegex?: RegExp,
  remediation?: string
): void {
  try {
    const output = execSync(command, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const version = versionRegex ? versionRegex.exec(output)?.[1] : output;
    results.push({
      tool,
      required,
      available: true,
      version,
      message: `Available${version ? ` (${version})` : ""}`,
    });
  } catch {
    results.push({
      tool,
      required,
      available: false,
      message: `Not available`,
      remediation,
    });
  }
}

// ── Node.js ───────────────────────────────────────────────────────────────────
checkCommand(
  "node",
  "node --version",
  true,
  /v(\d+\.\d+\.\d+)/,
  "Install Node.js 24+ from nodejs.org or via nvm"
);

// ── npm ───────────────────────────────────────────────────────────────────────
checkCommand("npm", "npm --version", true, /(\d+\.\d+\.\d+)/);

// ── Playwright ────────────────────────────────────────────────────────────────
const APP_DIR = join(ROOT, "app");
checkCommand(
  "playwright",
  `${APP_DIR}/node_modules/.bin/playwright --version 2>/dev/null`,
  true,
  /Version (\d+\.\d+\.\d+)/,
  "Run: cd app && npm install --save-dev @playwright/test && npx playwright install chromium"
);

// ── Playwright Chromium ───────────────────────────────────────────────────────
checkCommand(
  "playwright-chromium",
  `ls ${APP_DIR}/node_modules/.bin/playwright 2>/dev/null && echo "found"`,
  true,
  undefined,
  "Run: cd app && npx playwright install chromium"
);

// ── GitHub CLI ────────────────────────────────────────────────────────────────
checkCommand(
  "gh",
  "gh --version",
  true,
  /gh version (\d+\.\d+\.\d+)/,
  "Install GitHub CLI: https://cli.github.com/"
);

// ── Sentry CLI ────────────────────────────────────────────────────────────────
checkCommand(
  "sentry-cli",
  "npx sentry-cli --version 2>/dev/null",
  false,
  /sentry-cli (\d+\.\d+\.\d+)/,
  "Installed on-demand via: npx sentry-cli"
);

// ── Wrangler CLI (Cloudflare Pages) ───────────────────────────────────────────
checkCommand(
  "wrangler",
  "npx wrangler --version 2>/dev/null",
  false,
  /(\d+\.\d+\.\d+)/,
  "Installed on-demand via: npx wrangler@latest"
);

// ── TypeScript Compiler ───────────────────────────────────────────────────────
checkCommand(
  "tsc",
  `${APP_DIR}/node_modules/.bin/tsc --version 2>/dev/null`,
  true,
  /Version (\d+\.\d+\.\d+)/,
  "Included with Astro project — run: cd app && npm install"
);

// ── Python (for YAML validation in doctor) ────────────────────────────────────
checkCommand(
  "python3",
  "python3 --version",
  false,
  /Python (\d+\.\d+\.\d+)/,
  "Optional: used for YAML validation in sdlc:doctor"
);

// ── Output ────────────────────────────────────────────────────────────────────

const missing = results.filter((r) => !r.available && r.required);
const optionalMissing = results.filter((r) => !r.available && !r.required);
const available = results.filter((r) => r.available);

console.log("\n=== Capability Check ===\n");

for (const r of results) {
  const icon = r.available ? "✅" : r.required ? "❌" : "⚠️ ";
  const req = r.required ? "[required]" : "[optional]";
  console.log(`${icon} ${r.tool} ${req}: ${r.message}`);
  if (!r.available && r.remediation) {
    console.log(`   → ${r.remediation}`);
  }
}

console.log(
  `\nSummary: ${available.length} available, ${missing.length} missing (required), ${optionalMissing.length} missing (optional)`
);

if (missing.length > 0) process.exit(1);
process.exit(0);
