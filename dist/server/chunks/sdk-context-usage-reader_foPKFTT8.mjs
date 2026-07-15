import { j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { r as runtimeLogger, e as errorFields } from './runtime-run-failure_BzuNxIfC.mjs';
import { t as toUserFacingErrorMessage } from './user-facing-error_YGytcYdz.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDefaultSdkStateRoot } from '@cursor/sdk';
import { d as decodePromptContextUsageSnapshot } from './sdk-context-usage-decode_BLcvJNh4.mjs';

function handleApiError(scope, error, fallback, status = 500, fields = {}) {
  runtimeLogger.error(`${scope}.failed`, {
    ...fields,
    ...errorFields(error)
  });
  const message = toUserFacingErrorMessage(error, fallback);
  return jsonError(message, status);
}

const INSTRUCTION_SCOPES = {
  ".cursor/rules": { extensions: [".mdc", ".md"], loadContext: "always_injected", globName: "rules" },
  ".cursor/memories": {
    extensions: [".md"],
    loadContext: "always_injected",
    globName: "memories"
  },
  ".cursor/skills": { extensions: [".md"], loadContext: "on_invocation", globName: "skills" },
  ".cursor/commands": { extensions: [".md"], loadContext: "on_invocation", globName: "commands" },
  ".cursor/agents": { extensions: [".md"], loadContext: "on_invocation", globName: "agents" }
};
const EXCLUDE_BASENAMES = /* @__PURE__ */ new Set(["README.md", "ADR-000-template.md"]);
function estimateTokens(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}
function extractInstructionMetadata(text) {
  let body = text;
  let description;
  const frontmatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatterMatch) {
    body = text.slice(frontmatterMatch[0].length);
    const descriptionMatch = frontmatterMatch[1].match(/^description:\s*(.+)$/m);
    if (descriptionMatch) {
      description = descriptionMatch[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  const headingMatch = body.match(/^#\s+(.+)$/m);
  const title = headingMatch?.[1]?.trim();
  let previewBody = body;
  if (headingMatch) {
    previewBody = body.slice(headingMatch.index + headingMatch[0].length).trimStart();
  }
  const normalizedLines = previewBody.split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, " ").trimEnd());
  const joined = normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const PREVIEW_MAX_CHARS = 2e3;
  const contentPreview = joined.length > 0 ? `${joined.slice(0, PREVIEW_MAX_CHARS)}${joined.length > PREVIEW_MAX_CHARS ? "…" : ""}` : void 0;
  return {
    title: title && title.length > 0 ? title : void 0,
    description,
    contentPreview
  };
}
async function walkFiles(dir, extensions) {
  if (!existsSync(dir)) {
    return [];
  }
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkFiles(fullPath, extensions);
      results.push(...nested);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = entry.name.includes(".") ? `.${entry.name.split(".").pop()}` : "";
    if (extensions.includes(ext) && !EXCLUDE_BASENAMES.has(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}
async function readScopeEntries(workspaceRoot, scopePath, meta) {
  const fullScope = join(workspaceRoot, scopePath);
  const files = await walkFiles(fullScope, meta.extensions);
  const entries = [];
  for (const filePath of files) {
    try {
      const text = await readFile(filePath, "utf8");
      const metadata = extractInstructionMetadata(text);
      entries.push({
        path: relative(workspaceRoot, filePath),
        scope: scopePath,
        tokens: estimateTokens(text),
        loadContext: meta.loadContext,
        title: metadata.title,
        description: metadata.description,
        contentPreview: metadata.contentPreview
      });
    } catch {
      continue;
    }
  }
  return entries;
}
function resolveRepositoryLabel(workspaceRoot) {
  const parts = workspaceRoot.split(/[/\\]/);
  const leaf = parts[parts.length - 1] ?? "workspace";
  const parent = parts[parts.length - 2];
  if (parent && parent !== "workspaces") {
    return parent;
  }
  return leaf;
}
function readMcpConfigServerNames(configPath) {
  if (!existsSync(configPath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
      return [];
    }
    return Object.keys(parsed.mcpServers).sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}
function resolveConfiguredMcpServerNames(workspaceRoot) {
  const discovered = /* @__PURE__ */ new Set();
  for (const configPath of [
    join(workspaceRoot, ".cursor", "mcp.json"),
    join(homedir(), ".cursor", "mcp.json")
  ]) {
    for (const serverName of readMcpConfigServerNames(configPath)) {
      discovered.add(serverName);
    }
  }
  return [...discovered];
}
async function collectInstructionCorpus(workspaceRoot) {
  const entries = [];
  for (const [scopePath, meta] of Object.entries(INSTRUCTION_SCOPES)) {
    const scopeEntries = await readScopeEntries(workspaceRoot, scopePath, meta);
    entries.push(...scopeEntries);
  }
  const scopeTotals = {};
  for (const entry of entries) {
    scopeTotals[entry.scope] = (scopeTotals[entry.scope] ?? 0) + entry.tokens;
  }
  return {
    repository: resolveRepositoryLabel(workspaceRoot),
    workspaceRoot,
    tokenizer: "heuristic:char/4",
    entries,
    scopeTotals,
    mcpServerNames: resolveConfiguredMcpServerNames(workspaceRoot),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function estimateRuntimeOverhead(corpus) {
  const agentEntries = corpus.entries.filter((entry) => entry.scope === ".cursor/agents");
  const subagentDefinitionTokens = agentEntries.reduce((sum, entry) => sum + entry.tokens, 0);
  const subagentCount = agentEntries.length;
  const toolCount = 20;
  const mcpServerNames = corpus.mcpServerNames ?? [];
  const mcpServerCount = mcpServerNames.length > 0 ? mcpServerNames.length : 5;
  const tokensPerTool = 420;
  const tokensPerMcpServer = 520;
  return {
    systemPromptTokens: 476,
    toolDefinitionTokens: toolCount * tokensPerTool,
    mcpToolTokens: mcpServerCount * tokensPerMcpServer,
    subagentDefinitionTokens: subagentDefinitionTokens > 0 ? subagentDefinitionTokens : 1500,
    toolCount,
    mcpServerCount,
    mcpServerNames,
    subagentCount: subagentCount > 0 ? subagentCount : 12
  };
}

const execFileAsync = promisify(execFile);
function agentStoreDirectory(agentId) {
  const digest = createHash("sha256").update(agentId, "utf8").digest("hex");
  return `agent-${digest}`;
}
async function querySqlite(databasePath, sql) {
  const { stdout } = await execFileAsync("sqlite3", [databasePath, sql], {
    maxBuffer: 16 * 1024 * 1024
  });
  return stdout.trim();
}
async function readSystemPromptContent(storeDbPath) {
  const hex = await querySqlite(
    storeDbPath,
    `SELECT hex(data) FROM blobs WHERE instr(CAST(data AS TEXT), '"role":"system"') > 0 ORDER BY length(data) ASC LIMIT 1;`
  );
  if (!hex) {
    return null;
  }
  const bytes = Buffer.from(hex, "hex");
  const text = bytes.toString("utf8");
  try {
    const payload = JSON.parse(text);
    if (payload.role === "system" && typeof payload.content === "string" && payload.content.trim().length > 0) {
      return payload.content.trim();
    }
  } catch {
    return null;
  }
  return null;
}
function attachSystemPromptChild(categories, systemPromptContent) {
  const systemCategory = categories.find((entry) => entry.id === "system_prompt");
  if (!systemCategory || systemCategory.children && systemCategory.children.length > 0) {
    return;
  }
  systemCategory.children = [
    {
      id: "system:runtime",
      label: "Runtime base prompt",
      tag: "system:runtime",
      tokens: systemCategory.tokens ?? 0,
      contentPreview: systemPromptContent
    }
  ];
}
async function readCheckpointBlob(stateRoot, agentId, blobId) {
  const storeDbPath = `${stateRoot}/agents/${agentStoreDirectory(agentId)}/store.db`;
  const escapedBlobId = blobId.replace(/'/g, "''");
  const hex = await querySqlite(
    storeDbPath,
    `SELECT hex(data) FROM blobs WHERE id='${escapedBlobId}' LIMIT 1;`
  );
  if (!hex) {
    return null;
  }
  const bytes = Buffer.from(hex, "hex");
  return new Uint8Array(bytes);
}
async function readSdkContextUsageSnapshot(input) {
  const agentId = input.agentId.trim();
  const workspaceCwd = input.workspaceCwd.trim();
  if (!agentId || !workspaceCwd) {
    return null;
  }
  const stateRoot = getDefaultSdkStateRoot(workspaceCwd);
  const indexDbPath = `${stateRoot}/index.db`;
  const escapedAgentId = agentId.replace(/'/g, "''");
  const checkpointRefJson = await querySqlite(
    indexDbPath,
    `SELECT latest_checkpoint_ref_json FROM agents WHERE agent_id='${escapedAgentId}' LIMIT 1;`
  );
  if (!checkpointRefJson) {
    return null;
  }
  const checkpointRef = JSON.parse(checkpointRefJson);
  const blobId = checkpointRef.blobId?.trim();
  if (!blobId) {
    return null;
  }
  const blob = await readCheckpointBlob(stateRoot, agentId, blobId);
  if (!blob) {
    return null;
  }
  const decoded = decodePromptContextUsageSnapshot(blob);
  if (!decoded) {
    return null;
  }
  const storeDbPath = `${stateRoot}/agents/${agentStoreDirectory(agentId)}/store.db`;
  const systemPromptContent = await readSystemPromptContent(storeDbPath);
  if (systemPromptContent) {
    attachSystemPromptChild(decoded.categories, systemPromptContent);
  }
  return {
    ...decoded,
    agentId,
    checkpointBlobId: blobId,
    source: "sdk_checkpoint",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

export { collectInstructionCorpus as c, estimateRuntimeOverhead as e, handleApiError as h, readSdkContextUsageSnapshot as r };
