export type NodeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'retry';

export type RunStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'paused';

export interface RunNodeState {
  id: string;
  status: NodeStatus;
  started_at: string | null;
  completed_at: string | null;
  gate_outcome: string | null;
  content_ref: string | null;
}

export interface RunManifestMetadata {
  run_id: string;
  workflow_id: string;
  recorded_at: string;
  updated_at: string;
}

export interface RunManifest {
  apiVersion: string;
  kind: string;
  metadata: RunManifestMetadata;
  status: RunStatus;
  intent: string;
  execution: {
    mode: string;
    idempotency_key: string | null;
    resume_from_node: string | null;
  };
  workflow: {
    command: string;
    dsl_path: string;
  };
  paths: {
    output_dir: string;
    trace_path: string;
    state_path: string;
  };
  nodes: Record<string, RunNodeState>;
}

export interface RunDetail {
  runId: string;
  manifest: RunManifest;
}

export interface CreateRunRequest {
  workflowId: string;
  intent: string;
  mode: 'stub' | 'agent';
}

export interface CreateRunResult {
  runId: string;
  manifestPath: string;
}
