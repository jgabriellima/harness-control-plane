import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { parse } from 'yaml';
import { fileURLToPath } from 'node:url';
import { r as resolveProjectRoot } from './project-root_D7dTqIZJ.mjs';

function normalizeDir(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
function joinWorkspace(workspaceRoot, relative) {
  const trimmed = relative.replace(/^\.\//, "");
  return join(workspaceRoot, trimmed);
}
function resolveBindingFromStamp(workspaceRoot, stamp) {
  const pack = stamp.active_pack;
  const harnessDir = normalizeDir(pack.harness_dir ?? ".harness/");
  const harnessRoot = joinWorkspace(workspaceRoot, harnessDir.slice(0, -1));
  const dslFile = pack.dsl_file ?? "harness.yaml";
  const cliPrefix = pack.cli_prefix ?? "harness";
  const specializationLayer = normalizeDir(stamp.runtime.specialization_layer ?? ".cursor/");
  const storageResolved = stamp.storage.resolved ?? {};
  const storageRoot = normalizeDir(stamp.storage.root ?? harnessDir);
  const runsRelative = storageResolved.workflow_runs ?? join(storageRoot, "runs/");
  const tracesRelative = storageResolved.trace ?? join(storageRoot, "traces/");
  const workflowsRelative = join(storageRoot, "workflows/");
  const runtimeAdapterName = stamp.runtime.engine === "cursor" ? "cursor-local" : `${stamp.runtime.engine}-local`;
  return {
    workspaceRoot,
    harnessRoot,
    dslPath: join(harnessRoot, dslFile),
    runnerScript: join(harnessRoot, "bin", `${cliPrefix}_workflow_run.py`),
    workflowsDir: joinWorkspace(workspaceRoot, workflowsRelative),
    runsDir: joinWorkspace(workspaceRoot, runsRelative),
    tracesDir: joinWorkspace(workspaceRoot, tracesRelative),
    commandsDir: join(joinWorkspace(workspaceRoot, specializationLayer.slice(0, -1)), "commands"),
    commandNamespace: {
      lifecycle: pack.command_namespace?.lifecycle ?? `/${cliPrefix}:`,
      capabilities: pack.command_namespace?.capabilities ?? "/run:"
    },
    cliPrefix,
    runtimeEngine: stamp.runtime.engine,
    runtimeAdapterName,
    runtimeAdapterPath: join(harnessRoot, "runtime-adapters", `${runtimeAdapterName}.yaml`),
    specializationLayer: joinWorkspace(workspaceRoot, specializationLayer.slice(0, -1)),
    source: "runtime-binding"
  };
}

function walkCandidates() {
  return [
    process.cwd(),
    join(process.cwd(), ".."),
    join(process.cwd(), "../.."),
    join(process.cwd(), "../../..")
  ];
}
function resolveHostRepoRoot() {
  const override = process.env.CONTROL_PLANE_HOST_REPO?.trim() ?? process.env.BUSINESS_REPO_ROOT?.trim();
  if (override) {
    return resolve(override);
  }
  const projectRoot = process.env.CONTROL_PLANE_PROJECT_ROOT?.trim();
  if (projectRoot) {
    let dir = resolve(projectRoot);
    for (; ; ) {
      if (existsSync(join(dir, ".sdlc", "sdlc.yaml"))) {
        return dir;
      }
      const parent = resolve(dir, "..");
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  for (const candidate of walkCandidates()) {
    if (existsSync(join(candidate, ".sdlc", "sdlc.yaml"))) {
      return resolve(candidate);
    }
  }
  return resolve(process.cwd());
}
function resolvePlatformAppRoot(projectRoot) {
  const resolvedProjectRoot = resolveProjectRoot({ projectRoot });
  if (existsSync(join(resolvedProjectRoot, ".cursor", "runtime-binding.yaml"))) {
    return resolvedProjectRoot;
  }
  const legacyOverride = process.env.CONTROL_PLANE_PLATFORM_ROOT?.trim();
  if (legacyOverride) {
    const legacyRoot = resolve(legacyOverride);
    if (existsSync(join(legacyRoot, ".cursor", "runtime-binding.yaml"))) {
      return legacyRoot;
    }
  }
  for (const candidate of walkCandidates()) {
    if (existsSync(join(candidate, ".cursor", "runtime-binding.yaml"))) {
      return resolve(candidate);
    }
  }
  throw new Error(
    `Platform workspace not found for projectRoot ${resolvedProjectRoot}: missing .cursor/runtime-binding.yaml`
  );
}
function resolveRepoRoot() {
  return resolveHostRepoRoot();
}
function resolveControlPlaneInstallRoot() {
  const override = process.env.CONTROL_PLANE_INSTALL_ROOT?.trim();
  if (override) {
    return resolve(override);
  }
  const fromModule = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  if (existsSync(join(fromModule, "package.json")) && existsSync(join(fromModule, "src", "lib"))) {
    return fromModule;
  }
  for (const candidate of walkCandidates()) {
    const resolved = resolve(candidate);
    if (existsSync(join(resolved, "astro.config.mjs")) && existsSync(join(resolved, "src", "lib"))) {
      return resolved;
    }
  }
  return fromModule;
}

const RUNTIME_BINDING_REL = join(".cursor", "runtime-binding.yaml");
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function runtimeBindingPath(workspaceRoot) {
  return join(workspaceRoot, RUNTIME_BINDING_REL);
}
function hasRuntimeBindingStamp(workspaceRoot) {
  return existsSync(runtimeBindingPath(workspaceRoot));
}
function parseRuntimeBindingStamp(raw) {
  if (!isRecord(raw)) {
    throw new Error("Invalid runtime-binding.yaml root");
  }
  if (raw.apiVersion !== "proc.jambu/v1" || raw.kind !== "RuntimeBinding") {
    throw new Error("runtime-binding.yaml must be proc.jambu/v1 RuntimeBinding");
  }
  return raw;
}
async function loadRuntimeBindingStamp(workspaceRoot) {
  const stampPath = runtimeBindingPath(workspaceRoot);
  const raw = await readFile(stampPath, "utf8");
  return parseRuntimeBindingStamp(parse(raw));
}
async function resolveHarnessBinding(options = {}) {
  const workspaceRoot = options.workspaceRoot?.trim() || options.projectRoot?.trim() || resolvePlatformAppRoot(options.projectRoot);
  if (!hasRuntimeBindingStamp(workspaceRoot)) {
    throw new Error(
      `No harness binding for workspace ${workspaceRoot}: missing ${RUNTIME_BINDING_REL}`
    );
  }
  const stamp = await loadRuntimeBindingStamp(workspaceRoot);
  return resolveBindingFromStamp(workspaceRoot, stamp);
}

export { resolvePlatformAppRoot as a, resolveHostRepoRoot as b, resolveControlPlaneInstallRoot as c, resolveRepoRoot as d, hasRuntimeBindingStamp as h, resolveHarnessBinding as r };
