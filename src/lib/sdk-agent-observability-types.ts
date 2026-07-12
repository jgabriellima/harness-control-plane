import type { SdkContextUsageSnapshot } from './sdk-context-usage-reader';

export interface SdkRunRecord {
  runId: string;
  turnNumber: number;
  status: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface SdkToolCallRecord {
  callId: string;
  runId: string;
  turnNumber: number;
  tool: string;
  status: string;
  args?: unknown;
  result?: unknown;
  startedAt?: string;
  recordedAt: string;
  durationMs?: number;
}

export interface SdkGeneratedFileRecord {
  path: string;
  tool: string;
  callId: string;
  runId: string;
  recordedAt: string;
  mutation: boolean;
}

export interface SdkAgentObservability {
  source: 'sdk_agent_store';
  agentId: string;
  updatedAt: string;
  runs: SdkRunRecord[];
  toolCalls: SdkToolCallRecord[];
  generatedFiles: SdkGeneratedFileRecord[];
  contextUsage: SdkContextUsageSnapshot | null;
}
