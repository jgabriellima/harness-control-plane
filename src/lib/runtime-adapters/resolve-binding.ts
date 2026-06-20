import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

import { resolveHarnessBinding } from '../harness-binding';
import { resolveAppRoot, resolveHarnessRoot } from '../app-root';
import type { SessionStoreBinding } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function loadSessionStoreBinding(harnessRoot?: string): Promise<SessionStoreBinding> {
  const workspaceRoot = resolveHarnessRoot(harnessRoot ?? resolveAppRoot());
  const binding = await resolveHarnessBinding({ workspaceRoot });
  const raw = await readFile(binding.dslPath, 'utf8');
  const doc = parseYaml(raw) as unknown;

  if (!isRecord(doc) || !isRecord(doc.runtime)) {
    return {
      mode: 'discovery',
      dataRootEnv: 'CURSOR_DATA_DIR',
      workspaceRoot: null,
      adapter: binding.runtimeAdapterName,
    };
  }

  const runtime = doc.runtime;
  const store = isRecord(runtime.session_store) ? runtime.session_store : {};

  const modeRaw = typeof store.mode === 'string' ? store.mode : 'discovery';
  const mode = modeRaw === 'explicit' ? 'explicit' : 'discovery';

  return {
    mode,
    dataRootEnv:
      typeof store.data_root_env === 'string' && store.data_root_env.trim().length > 0
        ? store.data_root_env.trim()
        : 'CURSOR_DATA_DIR',
    workspaceRoot:
      typeof store.workspace_root === 'string' && store.workspace_root.trim().length > 0
        ? store.workspace_root.trim()
        : workspaceRoot,
    adapter:
      typeof runtime.adapter === 'string' && runtime.adapter.trim().length > 0
        ? runtime.adapter.trim()
        : binding.runtimeAdapterName,
  };
}
