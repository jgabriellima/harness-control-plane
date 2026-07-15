import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import 'yaml';

let agentInputBlocked = false;
function setComputerUseAgentInputBlocked(blocked) {
  agentInputBlocked = blocked;
}
function isComputerUseAgentInputBlocked() {
  return agentInputBlocked;
}
function syncComputerUseAgentInputBlocked(activeUserControlCount) {
  setComputerUseAgentInputBlocked(activeUserControlCount > 0);
}

const execFileAsync = promisify(execFile);
const CATALOG_TTL_MS = 3e5;
const DEFAULT_CALL_TIMEOUT_MS = 45e3;
const HEALTH_PROBE_TIMEOUT_MS = 8e3;
let catalogCache = null;
let customToolsCache = null;
function driverExecEnv() {
  const localBin = join(homedir(), ".local/bin");
  const pathValue = process.env.PATH ?? "";
  const augmented = pathValue.includes(localBin) ? pathValue : `${localBin}:${pathValue}`;
  return { ...process.env, PATH: augmented };
}
function extractJsonObject(raw) {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch {
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
async function callCuaDriverTool(toolName, args = {}, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const jsonArgs = JSON.stringify(args);
  try {
    const result = await execFileAsync("cua-driver", ["call", toolName, jsonArgs], {
      env: driverExecEnv(),
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024
    });
    const stdout = String(result.stdout);
    const parsed = extractJsonObject(stdout);
    if (parsed) {
      return { ok: true, data: parsed };
    }
    if (stdout.trim().length > 0) {
      return { ok: true, data: stdout.trim() };
    }
    return { ok: false, error: "cua-driver call returned empty output" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
async function probeComputerUseHealth() {
  const startedAt = Date.now();
  const result = await callCuaDriverTool("list_apps", {}, { timeoutMs: HEALTH_PROBE_TIMEOUT_MS });
  const latencyMs = Date.now() - startedAt;
  if (result.ok) {
    return {
      ok: true,
      latencyMs,
      daemonReachable: true,
      error: null
    };
  }
  return {
    ok: false,
    latencyMs,
    daemonReachable: false,
    error: result.error
  };
}
async function loadCuaToolCatalog() {
  if (catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_TTL_MS) {
    return catalogCache.tools;
  }
  const result = await execFileAsync("cua-driver", ["dump-docs", "--type", "json"], {
    env: driverExecEnv(),
    timeout: 2e4,
    maxBuffer: 8 * 1024 * 1024
  });
  const parsed = JSON.parse(String(result.stdout));
  if (!isRecord(parsed) || !isRecord(parsed.mcp) || !Array.isArray(parsed.mcp.tools)) {
    throw new Error("cua-driver dump-docs did not return mcp.tools");
  }
  const tools = parsed.mcp.tools.filter((entry) => {
    return isRecord(entry) && typeof entry.name === "string" && typeof entry.description === "string" && isRecord(entry.input_schema);
  }).map((entry) => ({
    name: entry.name,
    description: entry.description,
    input_schema: entry.input_schema
  }));
  catalogCache = { tools, loadedAt: Date.now() };
  return tools;
}
function formatToolResult(data) {
  if (typeof data === "string") {
    return data;
  }
  return JSON.stringify(data, null, 2);
}
async function buildComputerUseCustomTools() {
  if (customToolsCache) {
    return customToolsCache;
  }
  const catalog = await loadCuaToolCatalog();
  const tools = {};
  for (const definition of catalog) {
    tools[definition.name] = {
      description: `${definition.description}

(Jambu computer-use bridge → CuaDriver daemon)`,
      inputSchema: definition.input_schema,
      execute: async (args) => {
        if (isComputerUseAgentInputBlocked()) {
          return {
            content: [
              {
                type: "text",
                text: "Computer use paused — operator has Take control in the preview panel. Ask them to return control to the agent, then retry."
              }
            ],
            isError: true
          };
        }
        const result = await callCuaDriverTool(definition.name, args);
        if (!result.ok) {
          return {
            content: [{ type: "text", text: `Computer use error: ${result.error}` }],
            isError: true
          };
        }
        return formatToolResult(result.data);
      }
    };
  }
  customToolsCache = tools;
  return tools;
}

export { buildComputerUseCustomTools as b, callCuaDriverTool as c, isComputerUseAgentInputBlocked as i, probeComputerUseHealth as p, syncComputerUseAgentInputBlocked as s };
