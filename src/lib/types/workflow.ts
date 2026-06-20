export interface WorkflowSummary {
  id: string;
  name: string;
  version: string;
  command: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface WorkflowNodeSpec {
  id: string;
  dependsOn?: string[];
  function?: Record<string, unknown>;
  postCondition?: Record<string, unknown>;
  control?: Record<string, unknown>;
  name?: string;
}

export interface WorkflowMetadata {
  id: string;
  name: string;
  version: string;
  command: string;
  description?: string;
}

export interface WorkflowDocument {
  apiVersion: string;
  kind: string;
  metadata: WorkflowMetadata;
  spec: {
    nodes: WorkflowNodeSpec[];
    [key: string]: unknown;
  };
}

export interface WorkflowDetail {
  id: string;
  metadata: WorkflowMetadata;
  spec: WorkflowDocument['spec'];
  nodes: WorkflowNodeSpec[];
  edges: WorkflowEdge[];
}

export interface IntegrationSlotSummary {
  slotId: string;
  label: string;
  status: string;
}

export interface BusinessConfig {
  project: {
    name: string;
    description?: string;
  };
  integrationSlots: IntegrationSlotSummary[];
}
