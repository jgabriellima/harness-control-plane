export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  initialized: string | null;
  active: boolean;
  sessionCount?: number;
}

export interface ProjectMember {
  id: string;
  name: string;
  role: string;
}

export interface RuntimeProfile {
  profile_id: string;
  runtime: string;
  baseline: string;
  permissions: string[];
  tools: string[];
  limits: Record<string, unknown>;
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMember[];
  runtime_profile: RuntimeProfile;
}

export interface ConversationSummary {
  id: string;
  title: string;
  projectId: string;
  updatedAt: string;
  active: boolean;
  agentId?: string;
}


export interface ConversationDetail {
  id: string;
  title: string;
  projectId: string;
  updatedAt: string;
  executions: ExecutionSummary[];
}

export interface ConversationsStore {
  version: number;
  updatedAt: string;
  conversations: ConversationSummary[];
}

export type ExecutionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'paused'
  | 'running'
  | 'queued';

export interface ExecutionNodeState {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ExecutionManifest {
  apiVersion: string;
  kind: string;
  runId: string;
  workflowId: string;
  status: ExecutionStatus;
  intent: string;
  recordedAt: string;
  updatedAt: string;
  executionMode: string;
  nodes: Record<string, ExecutionNodeState>;
  paths: {
    outputDir: string;
    tracePath: string;
    statePath: string;
  };
}

export interface ExecutionSummary {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  intent: string;
  recordedAt: string;
  updatedAt: string;
}

export interface WorkflowTraceMetadata {
  runId: string;
  workflowId: string;
  recordedAt: string;
}

export interface WorkflowTrace {
  apiVersion: string;
  kind: string;
  metadata: WorkflowTraceMetadata;
  workflow: {
    status: string;
    intent: string;
  };
  state: Record<string, unknown>;
}

export interface ExecutionDetail {
  id: string;
  manifest: ExecutionManifest;
  trace: WorkflowTrace | null;
}

export interface ReadinessSlot {
  slotId: string;
  provider: string;
  status: string;
  secretsMissing: string[];
  ready: boolean;
}

export interface ReadinessSnapshot {
  apiVersion: string;
  kind: string;
  generatedAt: string;
  overall: string;
  doctorMode?: string;
  slots: ReadinessSlot[];
}

export interface ScheduleTrigger {
  type: string;
  schedule?: string;
  action?: string;
  path?: string;
}

export interface ScheduleRegistryEntry {
  id: string;
  workflowId: string;
  dslPath: string;
  trigger: ScheduleTrigger;
  enabled: boolean;
  intentTemplate: string;
  runtime: string;
  concurrency: string;
  misfirePolicy: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastStatus: string | null;
  source?: string;
}

export interface ScheduleRegistry {
  apiVersion: string;
  kind: string;
  metadata: {
    generatedAt: string;
    sourceHash?: string;
  };
  spec: {
    entries: ScheduleRegistryEntry[];
  };
}

export interface ScheduleEvent {
  event: string;
  ts?: string;
  entryId?: string;
  workflowId?: string;
  runId?: string;
  status?: string;
  reason?: string;
  source?: string;
}

export interface BusinessConfig {
  version: string;
  status: string;
  initialized: string | null;
  project: {
    name: string;
    description: string;
  };
  execution?: {
    defaultWorkflow?: string;
    default_workflow?: string;
  };
  baseline?: {
    harnessBaselineTag?: string;
    harness_baseline_tag?: string;
  };
  runtime?: {
    engine: string;
    commands?: string[];
    commandsPath?: string;
    commands_path?: string;
    max_concurrent_agents?: number;
  };
}

export interface HarnessCommand {
  command: string;
  description: string;
  sourceFile: string;
}

export interface ChatRequest {
  conversation_id?: string;
  project_id: string;
  message: string;
  attachments?: Array<{ name: string; path?: string; content_type?: string }>;
  mode?: 'default' | 'deep_research';
  integration_slots?: string[];
  agent_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatDispatchResponse {
  run_id: string;
  agent_id: string;
  stream_url: string;
  conversation_id?: string;
}

/** Gateway input — maps to ExecutionJob after validation (start-point.md). */
export interface ExecutionRequest {
  execution_id?: string;
  tenant_id?: string;
  project_id: string;
  user_id?: string;
  runtime?: string;
  objective: string;
  workflow_id?: string;
  metadata?: Record<string, unknown>;
}

/** Chat channel input — message becomes objective. */
export interface ConversationRequest {
  conversation_id?: string;
  project_id: string;
  message: string;
  attachments?: unknown[];
  execution_profile?: string;
  workflow_id?: string;
  runtime?: string;
  metadata?: Record<string, unknown>;
}

/** Dispatch contract produced by the gateway (start-point.md). */
export interface ExecutionJob {
  execution_id: string;
  tenant_id: string | null;
  project_id: string;
  user_id: string | null;
  runtime: string;
  objective: string;
  workflow_id: string;
  metadata: Record<string, unknown>;
}

export interface ExecutionDispatchResponse {
  execution_id: string;
  status: 'QUEUED';
  run_id: string;
  workflow_id: string;
}
