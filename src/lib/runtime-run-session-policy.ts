import { readFile } from 'node:fs/promises';

import { parse as parseYaml } from 'yaml';

import { resolveHarnessBinding } from './harness-binding';
import {
  buildSessionContinueWirePrompt,
  DEFAULT_SESSION_CONTINUE_INSTRUCTION,
} from './prompt-inject';
import type { ActiveRunEntry } from './runtime-run-registry';
import { isRunExecutingInProcessSession, processSessionId } from './runtime-process-session';

export type IndexedRunAtProcessStart = 'continuable' | 'executing';

export interface RunSessionContinuablePolicy {
  resumable: boolean;
  message: string;
  resumePrompt: string;
}

export interface RunSessionLifecyclePolicy {
  indexedAtProcessStart: IndexedRunAtProcessStart;
  continuable: RunSessionContinuablePolicy;
}

export interface ContinuableRunEntry extends ActiveRunEntry {
  resumable: boolean;
  message: string;
  resumePrompt: string;
  reason: 'session_boundary';
}

export interface RunSessionSnapshot {
  processSessionId: string;
  policy: RunSessionLifecyclePolicy;
  executing: ActiveRunEntry[];
  continuable: ContinuableRunEntry[];
  /** @deprecated Use `executing` — kept for callers that still read `active`. */
  active: ActiveRunEntry[];
}

const DEFAULT_CONTINUABLE_MESSAGE =
  'This run was interrupted when the previous session ended.';

const DEFAULT_RESUME_PROMPT = buildSessionContinueWirePrompt(DEFAULT_SESSION_CONTINUE_INSTRUCTION);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Plain DSL text is auto-wrapped; wire prompts with `<continue>` pass through unchanged. */
export function normalizeSessionContinueWirePrompt(raw: string): string {
  if (/<continue[\s>]/i.test(raw)) {
    return raw;
  }
  return buildSessionContinueWirePrompt(raw);
}

export function defaultRunSessionLifecyclePolicy(): RunSessionLifecyclePolicy {
  return {
    indexedAtProcessStart: 'continuable',
    continuable: {
      resumable: true,
      message: DEFAULT_CONTINUABLE_MESSAGE,
      resumePrompt: DEFAULT_RESUME_PROMPT,
    },
  };
}

function parseIndexedAtProcessStart(value: unknown): IndexedRunAtProcessStart {
  if (value === 'executing' || value === 'active') {
    return 'executing';
  }
  return 'continuable';
}

export function parseRunSessionLifecyclePolicy(raw: unknown): RunSessionLifecyclePolicy {
  const defaults = defaultRunSessionLifecyclePolicy();
  if (!isRecord(raw)) {
    return defaults;
  }

  const runtime = raw.runtime;
  const runSession = isRecord(runtime) ? runtime.run_session : raw.run_session;
  if (!isRecord(runSession)) {
    return defaults;
  }

  const lifecycle = runSession.lifecycle;
  if (!isRecord(lifecycle)) {
    return defaults;
  }

  const continuableRaw = lifecycle.continuable;
  const continuable = isRecord(continuableRaw)
    ? {
        resumable: continuableRaw.resumable !== false,
        message:
          typeof continuableRaw.message === 'string' && continuableRaw.message.trim().length > 0
            ? continuableRaw.message.trim()
            : defaults.continuable.message,
        resumePrompt:
          typeof continuableRaw.resume_prompt === 'string' &&
          continuableRaw.resume_prompt.trim().length > 0
            ? normalizeSessionContinueWirePrompt(continuableRaw.resume_prompt.trim())
            : typeof continuableRaw.resumePrompt === 'string' &&
                continuableRaw.resumePrompt.trim().length > 0
              ? normalizeSessionContinueWirePrompt(continuableRaw.resumePrompt.trim())
              : defaults.continuable.resumePrompt,
      }
    : defaults.continuable;

  return {
    indexedAtProcessStart: parseIndexedAtProcessStart(
      lifecycle.indexed_at_process_start ?? lifecycle.indexedAtProcessStart,
    ),
    continuable,
  };
}

export async function loadRunSessionLifecyclePolicy(
  workspaceRoot?: string,
): Promise<RunSessionLifecyclePolicy> {
  try {
    const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
    const raw = await readFile(binding.dslPath, 'utf8');
    return parseRunSessionLifecyclePolicy(parseYaml(raw));
  } catch {
    return defaultRunSessionLifecyclePolicy();
  }
}

/**
 * Applies the DSL session-boundary rule:
 * disk-indexed runs that were not started in this process session are continuable, not executing.
 */
export function partitionRunsBySessionPolicy(
  diskRuns: ActiveRunEntry[],
  policy: RunSessionLifecyclePolicy,
): Pick<RunSessionSnapshot, 'executing' | 'continuable'> {
  if (policy.indexedAtProcessStart === 'executing') {
    return {
      executing: diskRuns,
      continuable: [],
    };
  }

  const executing: ActiveRunEntry[] = [];
  const continuable: ContinuableRunEntry[] = [];

  for (const entry of diskRuns) {
    if (isRunExecutingInProcessSession(entry.runId)) {
      executing.push(entry);
      continue;
    }

    continuable.push({
      ...entry,
      resumable: policy.continuable.resumable,
      message: policy.continuable.message,
      resumePrompt: policy.continuable.resumePrompt,
      reason: 'session_boundary',
    });
  }

  return { executing, continuable };
}

export function buildRunSessionSnapshot(
  diskRuns: ActiveRunEntry[],
  policy: RunSessionLifecyclePolicy,
): RunSessionSnapshot {
  const partitioned = partitionRunsBySessionPolicy(diskRuns, policy);
  return {
    processSessionId,
    policy,
    executing: partitioned.executing,
    continuable: partitioned.continuable,
    active: partitioned.executing,
  };
}

/** When true, indexed runs must not auto-attach on hub connect — operator resumes explicitly. */
export function shouldAutoAttachIndexedRuns(policy: RunSessionLifecyclePolicy): boolean {
  return policy.indexedAtProcessStart === 'executing';
}
