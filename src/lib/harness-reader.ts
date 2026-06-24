import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { resolveHarnessBinding } from './harness-binding';
import type {
  BusinessConfig,
  ConversationSummary,
  ExecutionDetail,
  ExecutionManifest,
  ExecutionStatus,
  ExecutionSummary,
  ProjectDetail,
  ProjectMember,
  ProjectSummary,
  ReadinessSnapshot,
  RuntimeProfile,
  ScheduleEvent,
  ScheduleRegistry,
  WorkflowTrace,
} from './harness-types';

const READINESS_READ_RETRIES = 3;
const READINESS_READ_DELAY_MS = 25;

async function harnessPaths(workspaceRoot?: string) {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const stateDir = join(binding.harnessRoot, 'state');
  return {
    binding,
    dslPath: binding.dslPath,
    readinessPath: join(stateDir, 'readiness.yaml'),
    readinessTmpPath: join(stateDir, 'readiness.yaml.tmp'),
    scheduleRegistryPath: join(stateDir, 'schedule-registry.yaml'),
    scheduleEventsPath: join(stateDir, 'schedule-events.jsonl'),
    runsDir: binding.runsDir,
    tracesDir: binding.tracesDir,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function snapshotWriteInProgress(readinessTmpPath: string): Promise<boolean> {
  try {
    await access(readinessTmpPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function parseBusinessConfig(value: unknown): BusinessConfig {
  if (!isRecord(value)) {
    throw new Error('Invalid business.yaml root');
  }

  const project = value.project;
  if (!isRecord(project)) {
    throw new Error('Invalid business.yaml project section');
  }

  const executionRaw = value.execution;
  const execution =
    isRecord(executionRaw) && typeof executionRaw === 'object'
      ? {
          defaultWorkflow:
            typeof executionRaw.defaultWorkflow === 'string'
              ? executionRaw.defaultWorkflow
              : typeof executionRaw.default_workflow === 'string'
                ? executionRaw.default_workflow
                : undefined,
          default_workflow:
            typeof executionRaw.default_workflow === 'string'
              ? executionRaw.default_workflow
              : undefined,
        }
      : undefined;

  const baselineRaw = value.baseline;
  const baseline = isRecord(baselineRaw)
    ? {
        harnessBaselineTag:
          typeof baselineRaw.harnessBaselineTag === 'string'
            ? baselineRaw.harnessBaselineTag
            : typeof baselineRaw.harness_baseline_tag === 'string'
              ? baselineRaw.harness_baseline_tag
              : undefined,
        harness_baseline_tag:
          typeof baselineRaw.harness_baseline_tag === 'string'
            ? baselineRaw.harness_baseline_tag
            : undefined,
      }
    : undefined;

  const runtimeRaw = value.runtime;
  const runtime = isRecord(runtimeRaw)
    ? {
        engine: asString(runtimeRaw.engine, 'stub'),
        commands: Array.isArray(runtimeRaw.commands)
          ? runtimeRaw.commands.filter((item): item is string => typeof item === 'string')
          : undefined,
        commandsPath:
          typeof runtimeRaw.commandsPath === 'string'
            ? runtimeRaw.commandsPath
            : typeof runtimeRaw.commands_path === 'string'
              ? runtimeRaw.commands_path
              : undefined,
      }
    : undefined;

  return {
    version: asString(value.version, '1.0'),
    status: asString(value.status, 'unknown'),
    initialized: typeof value.initialized === 'string' ? value.initialized : null,
    project: {
      name: asString(project.name, 'Business Runtime'),
      description: asString(project.description, ''),
    },
    execution,
    baseline,
    runtime,
  };
}

function parseConversation(value: unknown, index: number): ConversationSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const title = asString(value.title);
  if (!id || !title) {
    return null;
  }

  return {
    id,
    title,
    projectId: asString(value.projectId, 'default'),
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
    active: index === 0,
    agentId: typeof value.agentId === 'string' ? value.agentId : undefined,
  };
}

function parseExecutionStatus(value: unknown): ExecutionStatus {
  const status = asString(value, 'pending');
  switch (status) {
    case 'pending':
    case 'in_progress':
    case 'completed':
    case 'blocked':
    case 'failed':
    case 'paused':
    case 'running':
    case 'queued':
      return status;
    default:
      return 'pending';
  }
}

function parseExecutionManifest(value: unknown, runId: string): ExecutionManifest {
  if (!isRecord(value)) {
    throw new Error(`Invalid execution manifest for ${runId}`);
  }

  const metadata = value.metadata;
  if (!isRecord(metadata)) {
    throw new Error(`Missing execution manifest metadata for ${runId}`);
  }

  const manifestRunId = asString(metadata.run_id, runId);
  if (manifestRunId !== runId) {
    throw new Error(`Execution manifest run_id mismatch for ${runId}`);
  }

  const nodesRaw = value.nodes;
  const nodes: ExecutionManifest['nodes'] = {};

  if (isRecord(nodesRaw)) {
    for (const [nodeId, nodeValue] of Object.entries(nodesRaw)) {
      if (!isRecord(nodeValue)) {
        continue;
      }
      nodes[nodeId] = {
        id: asString(nodeValue.id, nodeId),
        status: asString(nodeValue.status, 'pending'),
        startedAt:
          typeof nodeValue.started_at === 'string'
            ? nodeValue.started_at
            : typeof nodeValue.startedAt === 'string'
              ? nodeValue.startedAt
              : null,
        completedAt:
          typeof nodeValue.completed_at === 'string'
            ? nodeValue.completed_at
            : typeof nodeValue.completedAt === 'string'
              ? nodeValue.completedAt
              : null,
      };
    }
  }

  const paths = value.paths;
  const execution = value.execution;

  return {
    apiVersion: asString(value.apiVersion, 'business.jambu/v1'),
    kind: asString(value.kind, 'WorkflowRunManifest'),
    runId: manifestRunId,
    workflowId: asString(metadata.workflow_id),
    status: parseExecutionStatus(value.status),
    intent: asString(value.intent),
    recordedAt: asString(metadata.recorded_at),
    updatedAt: asString(metadata.updated_at),
    executionMode: isRecord(execution) ? asString(execution.mode, 'stub') : 'stub',
    nodes,
    paths: {
      outputDir: isRecord(paths) ? asString(paths.output_dir) : '',
      tracePath: isRecord(paths) ? asString(paths.trace_path) : '',
      statePath: isRecord(paths) ? asString(paths.state_path) : '',
    },
  };
}

function toExecutionSummary(manifest: ExecutionManifest): ExecutionSummary {
  return {
    id: manifest.runId,
    workflowId: manifest.workflowId,
    status: manifest.status,
    intent: manifest.intent,
    recordedAt: manifest.recordedAt,
    updatedAt: manifest.updatedAt,
  };
}

function parseWorkflowTrace(value: unknown, runId: string): WorkflowTrace | null {
  if (!isRecord(value)) {
    return null;
  }

  const metadata = value.metadata;
  if (!isRecord(metadata)) {
    return null;
  }

  const traceRunId = asString(metadata.runId, asString(metadata.run_id, runId));
  if (traceRunId !== runId) {
    return null;
  }

  const workflow = value.workflow;
  const state = value.state;

  return {
    apiVersion: asString(value.apiVersion, 'business.jambu/v1'),
    kind: asString(value.kind, 'WorkflowTrace'),
    metadata: {
      runId: traceRunId,
      workflowId: asString(metadata.workflowId, asString(metadata.workflow_id)),
      recordedAt: asString(metadata.recordedAt, asString(metadata.recorded_at)),
    },
    workflow: {
      status: isRecord(workflow) ? asString(workflow.status) : '',
      intent: isRecord(workflow) ? asString(workflow.intent) : '',
    },
    state: isRecord(state) ? state : {},
  };
}

function assertReadinessSnapshot(value: unknown): ReadinessSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!Array.isArray(value.slots)) {
    return null;
  }

  const slots = value.slots
    .filter(isRecord)
    .map((slot) => ({
      slotId: asString(slot.slotId, asString(slot.slot_id)),
      provider: asString(slot.provider),
      status: asString(slot.status),
      secretsMissing: Array.isArray(slot.secretsMissing)
        ? slot.secretsMissing.filter((item): item is string => typeof item === 'string')
        : Array.isArray(slot.secrets_missing)
          ? slot.secrets_missing.filter((item): item is string => typeof item === 'string')
          : [],
      ready: slot.ready === true,
    }));

  return {
    apiVersion: asString(value.apiVersion, 'business.jambu/v1'),
    kind: asString(value.kind, 'ReadinessSnapshot'),
    generatedAt: asString(value.generatedAt, asString(value.generated_at)),
    overall: asString(value.overall, 'unknown'),
    doctorMode:
      typeof value.doctorMode === 'string'
        ? value.doctorMode
        : typeof value.doctor_mode === 'string'
          ? value.doctor_mode
          : undefined,
    slots,
  };
}

export async function loadBusinessConfig(workspaceRoot?: string): Promise<BusinessConfig> {
  const paths = await harnessPaths(workspaceRoot);
  const raw = await readFile(paths.dslPath, 'utf8');
  return parseBusinessConfig(parseYaml(raw));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const { listWorkspaceProjects } = await import('./workspace-manager');
  return listWorkspaceProjects();
}

const STUB_PROJECT_MEMBERS: ProjectMember[] = [
  { id: 'operator', name: 'Operator', role: 'owner' },
  { id: 'platform-team', name: 'Platform Team', role: 'member' },
];

function buildRuntimeProfile(projectId: string, config: BusinessConfig): RuntimeProfile {
  const baselineTag =
    config.baseline?.harnessBaselineTag ??
    config.baseline?.harness_baseline_tag ??
    config.version;

  return {
    profile_id: projectId,
    runtime: config.runtime?.engine ?? 'stub',
    baseline: baselineTag,
    permissions: [],
    tools: config.runtime?.commands ?? [],
    limits: {},
  };
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const projects = await listProjects();
  const project = projects.find((entry) => entry.id === projectId);

  if (!project) {
    return null;
  }

  const config = await loadBusinessConfig();

  return {
    ...project,
    members: STUB_PROJECT_MEMBERS,
    runtime_profile: buildRuntimeProfile(projectId, config),
  };
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const { listProfileConversations } = await import('./conversation-store');
  return listProfileConversations();
}

async function readExecutionManifest(
  runId: string,
  runsDir: string,
): Promise<ExecutionManifest | null> {
  if (runId === 'ACTIVE') {
    return null;
  }

  const manifestPath = join(runsDir, runId, 'manifest.yaml');

  try {
    const raw = await readFile(manifestPath, 'utf8');
    return parseExecutionManifest(parseYaml(raw), runId);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return null;
    }
    throw error;
  }
}

async function readWorkflowTrace(runId: string, tracesDir: string): Promise<WorkflowTrace | null> {
  const tracePath = join(tracesDir, `${runId}.yaml`);

  try {
    const raw = await readFile(tracePath, 'utf8');
    return parseWorkflowTrace(parseYaml(raw), runId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function matchesIntentPrefix(intent: string, conversationTitle: string, conversationId: string): boolean {
  const normalizedIntent = intent.trim().toLowerCase();
  const normalizedTitle = conversationTitle.trim().toLowerCase();
  const normalizedId = conversationId.trim().toLowerCase();

  if (normalizedTitle.length > 0 && normalizedIntent.startsWith(normalizedTitle)) {
    return true;
  }

  return (
    normalizedIntent.startsWith(`[${normalizedId}]`) ||
    normalizedIntent.startsWith(`${normalizedId}:`) ||
    normalizedIntent.startsWith(`${normalizedId} `)
  );
}

export async function listExecutionsForConversation(
  conversationId: string,
  conversationTitle?: string,
): Promise<ExecutionSummary[]> {
  const allExecutions = await listExecutionsWithManifests();
  const titled = conversationTitle ?? (await findConversationTitle(conversationId));

  const withConversationId = allExecutions.filter(
    (entry) => entry.manifest.conversationId !== undefined,
  );

  if (withConversationId.length > 0) {
    const matched = withConversationId
      .filter((entry) => entry.manifest.conversationId === conversationId)
      .map((entry) => entry.summary);

    if (matched.length > 0) {
      return matched.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
  }

  if (titled) {
    const prefixMatched = allExecutions
      .filter((entry) => matchesIntentPrefix(entry.summary.intent, titled, conversationId))
      .map((entry) => entry.summary);

    if (prefixMatched.length > 0) {
      return prefixMatched.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
  }

  return allExecutions
    .map((entry) => entry.summary)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function findConversationTitle(conversationId: string): Promise<string | undefined> {
  const conversations = await listConversations();
  return conversations.find((conversation) => conversation.id === conversationId)?.title;
}

function shouldIncludeRunDirectory(entry: { isDirectory(): boolean; name: string }): boolean {
  if (entry.name === "ACTIVE") {
    return false;
  }
  return entry.isDirectory();
}

async function listRunDirectoryNames(runsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(runsDir, { withFileTypes: true });
    return entries.filter(shouldIncludeRunDirectory).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function listExecutionsWithManifests(): Promise<
  Array<{ summary: ExecutionSummary; manifest: ExecutionManifest }>
> {
  const paths = await harnessPaths();
  const entries = await listRunDirectoryNames(paths.runsDir);

  const results: Array<{ summary: ExecutionSummary; manifest: ExecutionManifest }> = [];

  for (const entry of entries) {
    const manifest = await readExecutionManifest(entry, paths.runsDir);
    if (manifest) {
      results.push({
        summary: toExecutionSummary(manifest),
        manifest,
      });
    }
  }

  return results;
}

export async function getConversationDetail(
  conversationId: string,
): Promise<ConversationDetail | null> {
  const conversations = await listConversations();
  const conversation = conversations.find((item) => item.id === conversationId);

  if (!conversation) {
    return null;
  }

  const executions = await listExecutionsForConversation(conversationId, conversation.title);

  return {
    id: conversation.id,
    title: conversation.title,
    projectId: conversation.projectId,
    updatedAt: conversation.updatedAt,
    executions,
  };
}


export async function listExecutions(): Promise<ExecutionSummary[]> {
  const paths = await harnessPaths();
  const entries = await listRunDirectoryNames(paths.runsDir);

  const summaries: ExecutionSummary[] = [];

  for (const entry of entries) {
    const manifest = await readExecutionManifest(entry, paths.runsDir);
    if (manifest) {
      summaries.push(toExecutionSummary(manifest));
    }
  }

  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getExecutionDetail(executionId: string): Promise<ExecutionDetail | null> {
  const paths = await harnessPaths();
  const manifest = await readExecutionManifest(executionId, paths.runsDir);
  if (!manifest) {
    return null;
  }

  const trace = await readWorkflowTrace(executionId, paths.tracesDir);

  return {
    id: executionId,
    manifest,
    trace,
  };
}

export async function loadReadinessSnapshot(): Promise<ReadinessSnapshot | null> {
  const paths = await harnessPaths();
  for (let attempt = 0; attempt < READINESS_READ_RETRIES; attempt += 1) {
    if (await snapshotWriteInProgress(paths.readinessTmpPath)) {
      await sleep(READINESS_READ_DELAY_MS);
      continue;
    }

    try {
      const raw = await readFile(paths.readinessPath, 'utf8');
      return assertReadinessSnapshot(parseYaml(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  return null;
}

function assertScheduleRegistry(value: unknown): ScheduleRegistry | null {
  if (!isRecord(value)) {
    return null;
  }
  const metadata = value.metadata;
  const spec = value.spec;
  if (!isRecord(metadata) || !isRecord(spec)) {
    return null;
  }
  const entriesRaw = spec.entries;
  const entries: ScheduleRegistry['spec']['entries'] = [];
  if (Array.isArray(entriesRaw)) {
    for (const item of entriesRaw) {
      if (!isRecord(item)) {
        continue;
      }
      const triggerRaw = item.trigger;
      const trigger = isRecord(triggerRaw)
        ? {
            type: asString(triggerRaw.type),
            schedule:
              typeof triggerRaw.schedule === 'string' ? triggerRaw.schedule : undefined,
            action: typeof triggerRaw.action === 'string' ? triggerRaw.action : undefined,
            path: typeof triggerRaw.path === 'string' ? triggerRaw.path : undefined,
          }
        : { type: 'schedule' };
      entries.push({
        id: asString(item.id),
        workflowId: asString(item.workflowId),
        dslPath: asString(item.dslPath),
        trigger,
        enabled: Boolean(item.enabled),
        intentTemplate: asString(item.intentTemplate),
        runtime: asString(item.runtime, 'agent'),
        concurrency: asString(item.concurrency, 'forbid'),
        misfirePolicy: asString(item.misfirePolicy, 'coalesce'),
        nextRunAt: typeof item.nextRunAt === 'string' ? item.nextRunAt : null,
        lastRunAt: typeof item.lastRunAt === 'string' ? item.lastRunAt : null,
        lastRunId: typeof item.lastRunId === 'string' ? item.lastRunId : null,
        lastStatus: typeof item.lastStatus === 'string' ? item.lastStatus : null,
        source: typeof item.source === 'string' ? item.source : undefined,
      });
    }
  }
  return {
    apiVersion: asString(value.apiVersion, 'business.jambu/v1'),
    kind: asString(value.kind, 'ScheduleRegistry'),
    metadata: {
      generatedAt: asString(metadata.generatedAt),
      sourceHash: typeof metadata.sourceHash === 'string' ? metadata.sourceHash : undefined,
    },
    spec: { entries },
  };
}

export async function loadScheduleRegistry(): Promise<ScheduleRegistry | null> {
  const paths = await harnessPaths();
  try {
    const raw = await readFile(paths.scheduleRegistryPath, 'utf8');
    return assertScheduleRegistry(parseYaml(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function loadRecentScheduleEvents(limit = 50): Promise<ScheduleEvent[]> {
  const paths = await harnessPaths();
  try {
    const raw = await readFile(paths.scheduleEventsPath, 'utf8');
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);
    const tail = lines.slice(-limit);
    const events: ScheduleEvent[] = [];
    for (const line of tail) {
      try {
        const parsed = JSON.parse(line) as unknown;
        if (!isRecord(parsed)) {
          continue;
        }
        events.push({
          event: asString(parsed.event),
          ts: typeof parsed.ts === 'string' ? parsed.ts : undefined,
          entryId: typeof parsed.entryId === 'string' ? parsed.entryId : undefined,
          workflowId: typeof parsed.workflowId === 'string' ? parsed.workflowId : undefined,
          runId: typeof parsed.runId === 'string' ? parsed.runId : undefined,
          status: typeof parsed.status === 'string' ? parsed.status : undefined,
          reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
          source: typeof parsed.source === 'string' ? parsed.source : undefined,
        });
      } catch {
        continue;
      }
    }
    return events;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
