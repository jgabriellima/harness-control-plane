export type ContextUsageCategory =
  | 'system_prompt'
  | 'tool_definitions'
  | 'rules'
  | 'skills'
  | 'mcp_tools'
  | 'subagent_definitions'
  | 'conversation'
  | 'prompt_injections';

export interface ContextUsageDetailItem {
  name: string;
  tokens: number;
  path?: string;
  scope?: string;
  loadContext?: string;
  description?: string;
  contentPreview?: string;
  sdkTag?: string;
  tokenSource?: 'sdk' | 'sdk_matched' | 'corpus_estimate';
}

export interface ContextUsageSlice {
  category: ContextUsageCategory;
  label: string;
  tokens: number;
  color: string;
  detail?: string;
  description?: string;
  children?: ContextUsageDetailItem[];
}

export interface InstructionCorpusEntry {
  path: string;
  scope: string;
  tokens: number;
  loadContext: string;
  title?: string;
  description?: string;
  contentPreview?: string;
}

export interface InstructionCorpusSnapshot {
  repository: string;
  workspaceRoot: string;
  tokenizer: string;
  entries: InstructionCorpusEntry[];
  scopeTotals: Record<string, number>;
  mcpServerNames?: string[];
  updatedAt: string;
}

export interface RuntimeOverheadEstimate {
  systemPromptTokens: number;
  toolDefinitionTokens: number;
  mcpToolTokens: number;
  subagentDefinitionTokens: number;
  toolCount: number;
  mcpServerCount: number;
  mcpServerNames: string[];
  subagentCount: number;
}

export type ContextUsageSource = 'sdk_checkpoint' | 'estimate';

export interface SdkContextUsagePayload {
  usedTokens: number;
  maxTokens: number;
  categories: Array<{
    id: string;
    label: string;
    tokens: number;
    children?: Array<{
      id: string;
      label: string;
      tokens: number;
      contentPreview?: string;
      description?: string;
      path?: string;
      scope?: string;
      loadContext?: string;
      tokenSource?: ContextUsageDetailItem['tokenSource'];
    }>;
  }>;
  agentId: string;
  checkpointBlobId: string;
  updatedAt: string;
}

export interface ContextUsageReport {
  contextWindowSize: number;
  totalTokens: number;
  percentFull: number;
  slices: ContextUsageSlice[];
  repository: string;
  conversationId: string;
  title: string | null;
  updatedAt: string;
  tokenizer: string;
  source: ContextUsageSource;
  agentId?: string | null;
}

export interface ContextUsageSelection {
  conversationId: string;
  projectId: string;
  agentId: string | null;
  title: string | null;
  loading: boolean;
  error: string | null;
}
