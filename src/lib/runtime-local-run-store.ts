import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getDefaultSdkStateRoot } from '@cursor/sdk';

const execFileAsync = promisify(execFile);

async function querySqlite(databasePath: string, sql: string): Promise<string> {
  const { stdout } = await execFileAsync('sqlite3', [databasePath, sql], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout.trim();
}

/**
 * Read terminal failure detail persisted by the local SDK store. `Run.wait()`
 * often omits `result` on ERROR runs while `runs.result` retains the message.
 */
export async function readLocalRunFailureDetail(
  agentId: string,
  runId: string,
  workspaceCwd: string,
): Promise<string | undefined> {
  const stateRoot = getDefaultSdkStateRoot(workspaceCwd);
  const indexDbPath = `${stateRoot}/index.db`;
  const escapedAgentId = agentId.replace(/'/g, "''");
  const escapedRunId = runId.replace(/'/g, "''");

  const row = await querySqlite(
    indexDbPath,
    `SELECT result, error_code FROM runs WHERE agent_id='${escapedAgentId}' AND run_id='${escapedRunId}' LIMIT 1;`,
  );

  if (!row?.trim()) {
    return undefined;
  }

  const parts = row.split('|');
  const resultText = parts[0]?.trim();
  const errorCode = parts[1]?.trim();
  return resultText || errorCode || undefined;
}
