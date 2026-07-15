import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { c as resolveControlPlaneInstallRoot, r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { r as runSandboxPreflight } from './runtime-computer-use-sandbox-preflight_Dtw4JMaM.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_SANDBOX_IMAGE = "default";
const MANIFEST_FILENAME = "computer-use-sandbox.json";
function requireProjectWorkspaceRoot(workspaceRoot) {
  const trimmed = workspaceRoot?.trim();
  if (!trimmed) {
    throw new Error(
      "workspaceRoot is required — project harness and runtime-sessions live under workspaces/{projectId}/"
    );
  }
  return trimmed;
}
function harnessScriptsDir() {
  return join(resolveControlPlaneInstallRoot(), "scripts");
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function normalizeProjectId(projectId) {
  const trimmed = projectId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "default";
}
function sandboxNameForProject(projectId) {
  const slug = normalizeProjectId(projectId).replace(/[^a-zA-Z0-9-]/g, "").slice(-24).toLowerCase() || "default";
  return `jambu-cua-proj-${slug}`;
}
function buildSandboxOpenUrlRecipe(sandboxName, harnessRoot) {
  return `python3 ${harnessRoot}/scripts/cua_sandbox_action.py open-url --sandbox ${sandboxName} --url <url>`;
}
async function manifestPath(workspaceRoot) {
  const root = requireProjectWorkspaceRoot(workspaceRoot);
  const binding = await resolveHarnessBinding({ workspaceRoot: root });
  const dir = join(binding.harnessRoot, "runtime-sessions");
  await mkdir(dir, { recursive: true });
  return join(dir, MANIFEST_FILENAME);
}
function manifestMatchesProject(active, projectId) {
  const normalized = normalizeProjectId(projectId);
  const manifestProject = typeof active.projectId === "string" ? normalizeProjectId(active.projectId) : "default";
  return manifestProject === normalized;
}
function parseManifestActive(active) {
  const phase = active.phase;
  const validPhases = [
    "idle",
    "preflight",
    "provisioning",
    "starting",
    "vnc_connecting",
    "ready",
    "error"
  ];
  return {
    projectId: typeof active.projectId === "string" ? normalizeProjectId(active.projectId) : "default",
    conversationId: typeof active.conversationId === "string" ? active.conversationId : "default",
    sandboxName: typeof active.sandboxName === "string" ? active.sandboxName : "jambu-cua-default",
    proposedName: typeof active.proposedName === "string" ? active.proposedName : null,
    phase: validPhases.includes(phase) ? phase : "idle",
    vncUrl: typeof active.vncUrl === "string" ? active.vncUrl : null,
    message: typeof active.message === "string" ? active.message : null,
    error: typeof active.error === "string" ? active.error : null,
    preflightChecks: Array.isArray(active.preflightChecks) ? active.preflightChecks : null,
    apiPort: typeof active.apiPort === "number" ? active.apiPort : null,
    vncPort: typeof active.vncPort === "number" ? active.vncPort : null,
    updatedAt: typeof active.updatedAt === "string" ? active.updatedAt : (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function readSandboxManifest(projectId, workspaceRoot) {
  try {
    const raw = await readFile(await manifestPath(workspaceRoot), "utf8");
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.active)) {
      return null;
    }
    const active = parsed.active;
    if (!manifestMatchesProject(active, projectId)) {
      return null;
    }
    return parseManifestActive(active);
  } catch {
    return null;
  }
}
async function readActiveSandboxManifest(workspaceRoot) {
  try {
    const raw = await readFile(await manifestPath(workspaceRoot), "utf8");
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.active)) {
      return null;
    }
    return parseManifestActive(parsed.active);
  } catch {
    return null;
  }
}
async function resolveSandboxManifestForProject(projectId, workspaceRoot) {
  const normalizedProjectId = normalizeProjectId(projectId);
  const root = requireProjectWorkspaceRoot(workspaceRoot);
  const manifest = await readSandboxManifest(normalizedProjectId, root);
  if (manifest?.phase === "ready" && manifest.sandboxName) {
    return manifest;
  }
  const active = await readActiveSandboxManifest(root);
  if (active?.phase === "ready" && active.sandboxName) {
    const synced = { ...active, projectId: normalizedProjectId };
    await writeSandboxManifest(synced, root);
    return synced;
  }
  return manifest ?? active ?? null;
}
async function collectSandboxNameCandidates(projectId, workspaceRoot) {
  const names = /* @__PURE__ */ new Set();
  names.add(sandboxNameForProject(projectId));
  const projectManifest = await resolveSandboxManifestForProject(projectId, workspaceRoot);
  if (projectManifest?.sandboxName) {
    names.add(projectManifest.sandboxName);
  }
  if (projectManifest?.proposedName) {
    names.add(projectManifest.proposedName);
  }
  return [...names];
}
async function writeSandboxManifest(manifest, workspaceRoot) {
  const path = await manifestPath(workspaceRoot);
  await writeFile(
    path,
    `${JSON.stringify({ active: manifest, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2)}
`,
    "utf8"
  );
}
async function runPythonSandboxScript(args) {
  const script = join(harnessScriptsDir(), "cua_sandbox_vnc.py");
  const result = await execFileAsync("python3", [script, ...args], {
    maxBuffer: 4 * 1024 * 1024,
    timeout: 24e4,
    env: process.env
  });
  const lines = [];
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      lines.push(JSON.parse(trimmed));
    } catch {
    }
  }
  return { lines, exitCode: 0, stderr: result.stderr };
}
async function runSandboxActionScript(input) {
  const script = join(harnessScriptsDir(), "cua_sandbox_action.py");
  const args = [input.action, "--sandbox", input.sandboxName];
  if (input.action === "open-url" && input.url) {
    args.push("--url", input.url);
  }
  if (input.action === "shell" && input.command) {
    args.push("--command", input.command);
    if (input.timeout !== void 0) {
      args.push("--timeout", String(input.timeout));
    }
  }
  if (!(input.local ?? true)) {
    args.push("--remote");
  }
  let stdout = "";
  let stderr = "";
  try {
    const out = await execFileAsync("python3", [script, ...args], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 12e4,
      env: process.env,
      cwd: input.workspaceRoot
    });
    stdout = out.stdout;
    stderr = out.stderr;
  } catch (error) {
    const err = error;
    stdout = err.stdout ?? "";
    stderr = err.stderr ?? "";
  }
  for (const line of stdout.split("\n").reverse()) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{")) {
      try {
        return JSON.parse(trimmed);
      } catch {
      }
    }
  }
  return {
    status: "error",
    sandbox: input.sandboxName,
    error: stderr.trim() || "Sandbox action produced no JSON output",
    stdout
  };
}
const bootstrapInFlight = /* @__PURE__ */ new Map();
function resetSandboxBootstrapState(projectId) {
  bootstrapInFlight.delete(normalizeProjectId(projectId));
}
async function clearSandboxManifest(projectId, workspaceRoot) {
  const existing = await readSandboxManifest(projectId, workspaceRoot);
  if (!existing) {
    return;
  }
  const path = await manifestPath(workspaceRoot);
  await writeFile(
    path,
    `${JSON.stringify({ active: null, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2)}
`,
    "utf8"
  );
}
async function tryAttachExistingSandbox(input) {
  const projectId = normalizeProjectId(input.projectId);
  const workspaceRoot = requireProjectWorkspaceRoot(input.workspaceRoot);
  const candidates = await collectSandboxNameCandidates(projectId, workspaceRoot);
  for (const candidateName of candidates) {
    try {
      const { lines } = await runPythonSandboxScript([
        "resolve",
        candidateName,
        ...input.local ?? true ? ["--local"] : []
      ]);
      const final = lines.at(-1);
      if (final?.status !== "ready" || typeof final.vnc_url !== "string") {
        continue;
      }
      const canonicalName = typeof final.sandbox_name === "string" ? final.sandbox_name : candidateName;
      const manifest = {
        projectId,
        conversationId: input.conversationId,
        sandboxName: canonicalName,
        proposedName: sandboxNameForProject(projectId),
        phase: "ready",
        vncUrl: final.vnc_url,
        message: "Reattached to existing project sandbox",
        error: null,
        preflightChecks: null,
        apiPort: typeof final.api_port === "number" ? final.api_port : null,
        vncPort: typeof final.vnc_port === "number" ? final.vnc_port : null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await writeSandboxManifest(manifest, workspaceRoot);
      return manifest;
    } catch {
    }
  }
  return null;
}
async function ensureSandboxVncStream(input) {
  const projectId = normalizeProjectId(input.projectId);
  const workspaceRoot = requireProjectWorkspaceRoot(input.workspaceRoot);
  const conversationId = input.conversationId.trim() || "default";
  const existing = bootstrapInFlight.get(projectId);
  if (existing) {
    return existing;
  }
  const task = bootstrapSandboxVncInternal({ ...input, projectId, conversationId, workspaceRoot });
  bootstrapInFlight.set(projectId, task);
  try {
    return await task;
  } finally {
    bootstrapInFlight.delete(projectId);
  }
}
async function bootstrapSandboxVncInternal(input) {
  const projectId = normalizeProjectId(input.projectId);
  const workspaceRoot = requireProjectWorkspaceRoot(input.workspaceRoot);
  const conversationId = input.conversationId.trim() || "default";
  const proposedName = sandboxNameForProject(projectId);
  const image = input.image ?? DEFAULT_SANDBOX_IMAGE;
  const local = input.local ?? true;
  const attached = await tryAttachExistingSandbox({
    projectId,
    conversationId,
    workspaceRoot,
    local
  });
  if (attached) {
    return attached;
  }
  let manifest = {
    projectId,
    conversationId,
    sandboxName: proposedName,
    proposedName,
    phase: "preflight",
    vncUrl: null,
    message: "Running sandbox pre-flight checks",
    error: null,
    preflightChecks: null,
    apiPort: null,
    vncPort: null,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeSandboxManifest(manifest, workspaceRoot);
  const preflight = await runSandboxPreflight({ local });
  if (!preflight.ok) {
    const errorMessage = preflight.summary ?? "Sandbox pre-flight failed";
    manifest = {
      ...manifest,
      phase: "error",
      error: errorMessage,
      message: errorMessage,
      preflightChecks: preflight.checks,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await writeSandboxManifest(manifest, workspaceRoot);
    return manifest;
  }
  manifest = {
    ...manifest,
    phase: "provisioning",
    message: "Preparing CUA Sandbox",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeSandboxManifest(manifest, workspaceRoot);
  try {
    const { lines } = await runPythonSandboxScript([
      "bootstrap",
      proposedName,
      "--image",
      image,
      ...local ? ["--local"] : [],
      "--max-wait",
      "180"
    ]);
    for (const line of lines) {
      if (line.phase) {
        const canonicalName = typeof line.sandbox_name === "string" ? line.sandbox_name : manifest.sandboxName;
        manifest = {
          ...manifest,
          conversationId,
          phase: line.phase,
          sandboxName: canonicalName,
          message: line.message ?? manifest.message,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await writeSandboxManifest(manifest, workspaceRoot);
      }
    }
    const final = lines.at(-1);
    if (final?.status === "ready" && typeof final.vnc_url === "string") {
      const canonicalName = typeof final.sandbox_name === "string" ? final.sandbox_name : manifest.sandboxName;
      manifest = {
        ...manifest,
        phase: "ready",
        sandboxName: canonicalName,
        proposedName,
        apiPort: typeof final.api_port === "number" ? final.api_port : null,
        vncPort: typeof final.vnc_port === "number" ? final.vnc_port : null,
        vncUrl: final.vnc_url,
        message: "VNC stream ready",
        error: null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await writeSandboxManifest(manifest, workspaceRoot);
      return manifest;
    }
    const errorMessage = final?.error ?? final?.message ?? "Failed to obtain sandbox VNC URL";
    manifest = {
      ...manifest,
      phase: "error",
      error: errorMessage,
      message: errorMessage,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await writeSandboxManifest(manifest, workspaceRoot);
    return manifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sandbox bootstrap failed";
    manifest = {
      ...manifest,
      phase: "error",
      error: message,
      message,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await writeSandboxManifest(manifest, workspaceRoot);
    return manifest;
  }
}

export { resolveSandboxManifestForProject as a, buildSandboxOpenUrlRecipe as b, readSandboxManifest as c, requireProjectWorkspaceRoot as d, ensureSandboxVncStream as e, resetSandboxBootstrapState as f, clearSandboxManifest as g, normalizeProjectId as n, runSandboxActionScript as r };
