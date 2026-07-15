import { readFile, readdir, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { j as joinAssistantTextBlocks } from './assistant-text_q9NGcfVY.mjs';
import { j as resolveHarnessRoot, b as resolveAppRoot } from './workspace-manager_C2YuGzrP.mjs';
import { s as stripCursorPromptEnvelope, a as stripRedactedReasoningContent } from './strip-redacted-content_CdyBuEHF.mjs';
import { parse } from 'yaml';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';

function isRecord$1(value) {
  return typeof value === "object" && value !== null;
}
async function loadSessionStoreBinding(harnessRoot) {
  const workspaceRoot = resolveHarnessRoot(harnessRoot ?? resolveAppRoot());
  const binding = await resolveHarnessBinding({ workspaceRoot });
  const raw = await readFile(binding.dslPath, "utf8");
  const doc = parse(raw);
  if (!isRecord$1(doc) || !isRecord$1(doc.runtime)) {
    return {
      mode: "discovery",
      dataRootEnv: "CURSOR_DATA_DIR",
      workspaceRoot: null,
      adapter: binding.runtimeAdapterName
    };
  }
  const runtime = doc.runtime;
  const store = isRecord$1(runtime.session_store) ? runtime.session_store : {};
  const modeRaw = typeof store.mode === "string" ? store.mode : "discovery";
  const mode = modeRaw === "explicit" ? "explicit" : "discovery";
  return {
    mode,
    dataRootEnv: typeof store.data_root_env === "string" && store.data_root_env.trim().length > 0 ? store.data_root_env.trim() : "CURSOR_DATA_DIR",
    workspaceRoot: typeof store.workspace_root === "string" && store.workspace_root.trim().length > 0 ? store.workspace_root.trim() : workspaceRoot,
    adapter: typeof runtime.adapter === "string" && runtime.adapter.trim().length > 0 ? runtime.adapter.trim() : binding.runtimeAdapterName
  };
}

const execFileAsync = promisify(execFile);
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function expandHome(pathValue) {
  return pathValue.startsWith("~/") ? join(homedir(), pathValue.slice(2)) : pathValue;
}
async function pathExists(pathValue) {
  try {
    await access(pathValue, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function extractTextContent(message) {
  const nested = message.message;
  if (!isRecord(nested) || !Array.isArray(nested.content)) {
    return "";
  }
  const parts = [];
  for (const block of nested.content) {
    if (!isRecord(block)) {
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
    if (block.type === "tool_use" && typeof block.name === "string") {
      parts.push(`[tool: ${block.name}]`);
    }
  }
  return joinAssistantTextBlocks(parts);
}
function readRecordedAt(raw) {
  if (typeof raw.timestamp === "string") {
    return raw.timestamp;
  }
  if (typeof raw.createdAt === "string") {
    return raw.createdAt;
  }
  if (typeof raw.created_at === "string") {
    return raw.created_at;
  }
  return void 0;
}
function extractToolResultContent(block) {
  if (typeof block.content === "string") {
    return block.content;
  }
  if (Array.isArray(block.content)) {
    const textParts = [];
    for (const part of block.content) {
      if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") {
        textParts.push(part.text);
      }
    }
    return textParts.join("\n").trim();
  }
  return block.content;
}
function resolveLineRecordedAt(raw, lineIndex, lineCount, anchorMs) {
  const explicit = readRecordedAt(raw);
  if (explicit) {
    return explicit;
  }
  const offsetMs = Math.max(0, lineCount - lineIndex - 1) * 2e3;
  return new Date(anchorMs - offsetMs).toISOString();
}
function parseTranscriptLine(line, index, lineCount, anchorMs, conversationId, vendorAgentId, toolIndex) {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return [];
  }
  if (!isRecord(raw)) {
    return [];
  }
  const roleRaw = raw.role;
  const id = `vendor-${vendorAgentId}-${index}`;
  const recordedAt = resolveLineRecordedAt(raw, index, lineCount, anchorMs);
  if (roleRaw === "user") {
    const nested = raw.message;
    if (isRecord(nested) && Array.isArray(nested.content)) {
      for (const block of nested.content) {
        if (!isRecord(block) || block.type !== "tool_result") {
          continue;
        }
        const toolUseId = typeof block.tool_use_id === "string" ? block.tool_use_id : null;
        if (!toolUseId) {
          continue;
        }
        const toolMessage = toolIndex.get(toolUseId);
        if (toolMessage) {
          toolMessage.toolResult = extractToolResultContent(block);
          toolMessage.toolStatus = "completed";
          toolMessage.content = `${toolMessage.toolName ?? "tool"} · completed`;
          toolMessage.recordedAt = recordedAt;
        }
      }
    }
    const content = stripCursorPromptEnvelope(extractTextContent(raw));
    return content.length > 0 ? [{ id, role: "user", content, recordedAt }] : [];
  }
  if (roleRaw === "assistant") {
    const nested = raw.message;
    const messages = [];
    if (isRecord(nested) && Array.isArray(nested.content)) {
      const textParts = [];
      const thinkingParts = [];
      for (const block of nested.content) {
        if (!isRecord(block)) {
          continue;
        }
        if (block.type === "text" && typeof block.text === "string" && block.text.trim().length > 0) {
          textParts.push(stripRedactedReasoningContent(block.text));
        }
        if ((block.type === "thinking" || block.type === "reasoning") && typeof block.text === "string" && block.text.trim().length > 0) {
          thinkingParts.push(stripRedactedReasoningContent(block.text));
        }
        if (block.type === "tool_use" && typeof block.name === "string") {
          const toolUseId = typeof block.id === "string" ? block.id : `${id}-tool-${block.name}`;
          const toolMessage = {
            id: `${id}-tool-${toolUseId}`,
            role: "tool",
            content: `${block.name} · completed`,
            recordedAt,
            toolName: block.name,
            toolStatus: "completed",
            toolArgs: block.input,
            toolUseId
          };
          toolIndex.set(toolUseId, toolMessage);
          messages.push(toolMessage);
        }
      }
      if (thinkingParts.length > 0) {
        messages.unshift({
          id: `${id}-thinking`,
          role: "thinking",
          content: joinAssistantTextBlocks(thinkingParts),
          recordedAt
        });
      }
      const text = joinAssistantTextBlocks(textParts);
      if (text.length > 0) {
        messages.unshift({ id, role: "assistant", content: text, recordedAt });
      }
    }
    return messages;
  }
  return [];
}
class CursorLocalAdapter {
  vendor = "cursor-local";
  async resolveDataRoot(harnessRoot) {
    const binding = await loadSessionStoreBinding(harnessRoot);
    if (binding.mode === "explicit") {
      const explicit = process.env[binding.dataRootEnv]?.trim();
      if (!explicit) {
        throw new Error(`${binding.dataRootEnv} is required for explicit session_store mode`);
      }
      const resolved = expandHome(explicit);
      if (!await pathExists(resolved)) {
        throw new Error(`explicit data root not found: ${resolved}`);
      }
      return resolved;
    }
    const envRoot = process.env[binding.dataRootEnv]?.trim();
    if (envRoot && await pathExists(expandHome(envRoot))) {
      return expandHome(envRoot);
    }
    const defaultRoot = join(homedir(), ".cursor");
    if (await pathExists(defaultRoot)) {
      return defaultRoot;
    }
    throw new Error("cursor-local data root not found");
  }
  workspaceCwd() {
    return resolveAppRoot();
  }
  async resolveSessionRefs(vendorAgentId, cwd) {
    const dataRoot = await this.resolveDataRoot(cwd);
    const slug = await this.resolveProjectSlug(dataRoot, vendorAgentId);
    const transcriptRef = `projects/${slug}/agent-transcripts/${vendorAgentId}/${vendorAgentId}.jsonl`;
    const transcriptPath = join(dataRoot, transcriptRef);
    if (!await pathExists(transcriptPath)) {
      const storeRef2 = await this.resolveStoreRef(dataRoot, slug, vendorAgentId);
      return {
        vendorAgentId,
        vendorDataRoot: dataRoot,
        vendorProjectSlug: slug,
        cwd,
        transcriptRef,
        storeRef: storeRef2
      };
    }
    const storeRef = await this.resolveStoreRef(dataRoot, slug, vendorAgentId);
    return {
      vendorAgentId,
      vendorDataRoot: dataRoot,
      vendorProjectSlug: slug,
      cwd,
      transcriptRef,
      storeRef
    };
  }
  async resolveProjectSlug(dataRoot, vendorAgentId) {
    const projectsRoot = join(dataRoot, "projects");
    const entries = await readdir(projectsRoot, { withFileTypes: true });
    const transcriptMatches = [];
    const storeMatches = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const transcriptPath = join(
        projectsRoot,
        entry.name,
        "agent-transcripts",
        vendorAgentId,
        `${vendorAgentId}.jsonl`
      );
      if (await pathExists(transcriptPath)) {
        transcriptMatches.push(entry.name);
      }
      const storeMatch = await this.projectSlugFromStore(
        join(projectsRoot, entry.name, "sdk-agent-store"),
        entry.name,
        vendorAgentId
      );
      if (storeMatch) {
        storeMatches.push(storeMatch);
      }
    }
    if (transcriptMatches.length === 1) {
      return transcriptMatches[0];
    }
    if (transcriptMatches.length > 1) {
      throw new Error(`ambiguous project slug for ${vendorAgentId}`);
    }
    if (storeMatches.length === 1) {
      return storeMatches[0];
    }
    if (storeMatches.length > 1) {
      throw new Error(`ambiguous project slug (store) for ${vendorAgentId}`);
    }
    throw new Error(`no transcript project for ${vendorAgentId}`);
  }
  async projectSlugFromStore(storeRoot, slug, vendorAgentId) {
    if (!await pathExists(storeRoot)) {
      return null;
    }
    const hashDirs = await readdir(storeRoot, { withFileTypes: true });
    for (const entry of hashDirs) {
      if (!entry.isDirectory()) {
        continue;
      }
      const indexDb = join(storeRoot, entry.name, "index.db");
      if (!await pathExists(indexDb)) {
        continue;
      }
      try {
        const { stdout } = await execFileAsync(
          "sqlite3",
          [indexDb, `SELECT agent_id FROM agents WHERE agent_id = '${vendorAgentId.replace(/'/g, "''")}' LIMIT 1;`],
          { maxBuffer: 64 * 1024 }
        );
        if (stdout.trim().length > 0) {
          return slug;
        }
      } catch {
        continue;
      }
    }
    return null;
  }
  async resolveStoreRef(dataRoot, slug, vendorAgentId) {
    const storeRoot = join(dataRoot, "projects", slug, "sdk-agent-store");
    const hashDirs = await readdir(storeRoot, { withFileTypes: true });
    for (const entry of hashDirs) {
      if (!entry.isDirectory()) {
        continue;
      }
      const indexDb = join(storeRoot, entry.name, "index.db");
      if (!await pathExists(indexDb)) {
        continue;
      }
      const storeRef = `projects/${slug}/sdk-agent-store/${entry.name}/`;
      const agentsDir = join(storeRoot, entry.name, "agents");
      if (await pathExists(agentsDir)) {
        return storeRef;
      }
    }
    for (const entry of hashDirs) {
      if (!entry.isDirectory()) {
        continue;
      }
      const indexDb = join(storeRoot, entry.name, "index.db");
      if (await pathExists(indexDb)) {
        return `projects/${slug}/sdk-agent-store/${entry.name}/`;
      }
    }
    throw new Error(`no store index for ${vendorAgentId}`);
  }
  async getTranscript(vendorAgentId, refs) {
    const transcriptPath = join(refs.vendorDataRoot, refs.transcriptRef);
    const raw = await readFile(transcriptPath, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    const transcriptStat = await stat(transcriptPath);
    const anchorMs = transcriptStat.mtimeMs;
    const messages = [];
    const toolIndex = /* @__PURE__ */ new Map();
    lines.forEach((line, index) => {
      const parsed = parseTranscriptLine(
        line,
        index,
        lines.length,
        anchorMs,
        refs.vendorAgentId,
        vendorAgentId,
        toolIndex
      );
      messages.push(...parsed);
    });
    return {
      conversationId: refs.vendorAgentId,
      vendorAgentId,
      messages
    };
  }
}
let cachedAdapter;
function getCursorLocalAdapter() {
  if (!cachedAdapter) {
    cachedAdapter = new CursorLocalAdapter();
  }
  return cachedAdapter;
}

export { getCursorLocalAdapter as g };
