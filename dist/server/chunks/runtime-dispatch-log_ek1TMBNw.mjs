import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';

async function dispatchLogPath(workspaceRoot) {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const sessionsDir = join(binding.harnessRoot, "runtime-sessions");
  await mkdir(sessionsDir, { recursive: true });
  return join(sessionsDir, "dispatch-log.jsonl");
}
async function appendDispatchLog(record, workspaceRoot) {
  try {
    const path = await dispatchLogPath(workspaceRoot);
    const line = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), ...record });
    await appendFile(path, `${line}
`, "utf8");
  } catch {
  }
}
async function readDispatchLogTail(limit = 50, workspaceRoot) {
  try {
    const path = await dispatchLogPath(workspaceRoot);
    const raw = await readFile(path, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line)).reverse();
  } catch {
    return [];
  }
}
async function readDispatchLogForRun(runId, workspaceRoot) {
  const tail = await readDispatchLogTail(500, workspaceRoot);
  return tail.filter((entry) => entry.run_id === runId).reverse();
}

export { appendDispatchLog as a, readDispatchLogForRun as r };
