import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { DiscoveryHit } from "./types";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".astro",
  "playwright-report",
  "test-results",
]);

const SCAN_EXTENSIONS = new Set([
  ".md",
  ".mdc",
  ".yaml",
  ".yml",
  ".mjs",
  ".ts",
  ".tsx",
  ".json",
  ".sh",
  ".astro",
]);

function categorize(relPath: string): DiscoveryHit["category"] {
  if (relPath.includes(".sdlc/sdlc.yaml")) return "dsl";
  if (relPath.includes(".sdlc/integrations/")) return "integration";
  if (relPath.includes(".cursor/rules/")) return "rules";
  if (relPath.includes(".cursor/commands/")) return "commands";
  if (relPath.includes(".cursor/agents/")) return "agents";
  if (relPath.includes(".sdlc/workflows/") || relPath.includes(".github/workflows/")) {
    return relPath.includes(".github/") ? "ci" : "workflows";
  }
  if (relPath.includes(".cursor/memories/")) return "memory";
  if (relPath.startsWith("app/") || relPath.includes("/app/")) return "app";
  return "other";
}

function walk(dir: string, repoRoot: string, hits: DiscoveryHit[], needle: RegExp): void {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, repoRoot, hits, needle);
      continue;
    }

    const ext = entry.includes(".") ? `.${entry.split(".").pop()}` : "";
    if (!SCAN_EXTENSIONS.has(ext)) continue;

    const rel = relative(repoRoot, full).replace(/\\/g, "/");
    const content = readFileSync(full, "utf-8");
    if (!needle.test(content)) continue;

    const lines = content.split("\n");
    let lineNum: number | undefined;
    for (let i = 0; i < lines.length; i++) {
      if (needle.test(lines[i] ?? "")) {
        lineNum = i + 1;
        break;
      }
    }

    hits.push({
      file: rel,
      line: lineNum,
      category: categorize(rel),
      change_required: `Review and update or remove ${needle.source} references`,
    });
  }
}

export function discoverProviderReferences(
  repoRoot: string,
  providerId: string,
  extraNeedles: string[] = []
): DiscoveryHit[] {
  const needles = [providerId, ...extraNeedles]
    .filter(Boolean)
    .map((n) => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

  const hits: DiscoveryHit[] = [];
  const seen = new Set<string>();

  for (const needle of needles) {
    walk(repoRoot, repoRoot, hits, needle);
    walk(join(repoRoot, ".cursor"), repoRoot, hits, needle);
    walk(join(repoRoot, ".sdlc"), repoRoot, hits, needle);
    walk(join(repoRoot, ".github"), repoRoot, hits, needle);
    walk(join(repoRoot, "app"), repoRoot, hits, needle);
  }

  return hits.filter((h) => {
    if (seen.has(h.file)) return false;
    seen.add(h.file);
    return true;
  });
}

export function buildAgentTasks(
  action: "add" | "remove" | "swap",
  providerId: string,
  fromProvider: string | undefined,
  discovery: DiscoveryHit[],
  profile?: string
): string[] {
  const tasks: string[] = [];
  const categories = new Set(discovery.map((d) => d.category));

  if (action === "remove" || action === "swap") {
    const removed = fromProvider ?? providerId;
    tasks.push(`Remove or revert references to ${removed} in discovered files`);
    tasks.push(
      `Verify .sdlc/sdlc.yaml: integrations.${removed} and runtime.mcps.${removed} pruned (mutator apply handles both)`,
    );
  }

  if (action === "add" || action === "swap") {
    tasks.push(`Materialize SDK and app wiring for ${providerId} in workspace.target_root`);
    if (categories.has("rules")) {
      tasks.push(`Update .cursor/rules/ for ${providerId} instrumentation`);
    }
    if (categories.has("ci")) {
      tasks.push(`Update .github/workflows/ for ${providerId} CI/deploy steps`);
    }
    if (categories.has("memory")) {
      tasks.push(`Update .cursor/memories/architecture.md Stack table with ${providerId}`);
    }
    if (profile) {
      tasks.push(`Apply profile-aware patches for ${profile} + ${providerId}`);
    }
  }

  if (categories.has("app") && action !== "remove") {
    tasks.push(`Patch application source under target_root for ${providerId} SDK`);
  }

  tasks.push("Run `cd .sdlc && npm run doctor:operational` after agent patches complete");

  return tasks;
}
