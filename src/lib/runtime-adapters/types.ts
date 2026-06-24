export type SessionStoreMode = 'discovery' | 'explicit';

export interface SessionStoreBinding {
  mode: SessionStoreMode;
  dataRootEnv: string;
  workspaceRoot: string | null;
  adapter: string;
}

export interface SessionRefs {
  vendorAgentId: string;
  vendorDataRoot: string;
  vendorProjectSlug: string;
  cwd: string;
  transcriptRef: string;
  storeRef: string;
}

export interface SessionBoundEvent {
  event: 'session.bound';
  ts: string;
  harnessConversationId: string;
  vendor: string;
  vendorAgentId: string;
  vendorDataRoot: string;
  vendorProjectSlug: string;
  cwd: string;
  transcriptRef: string;
  storeRef: string;
}

export interface SessionRegistryIndex {
  version: number;
  updatedAt: string;
  conversations: Array<{
    id: string;
    title: string;
    projectId: string;
    updatedAt: string;
    agentId?: string;
    archived?: boolean;
  }>;
}

export type NormalizedMessageRole = 'user' | 'assistant' | 'system' | 'thinking' | 'tool';

export interface NormalizedMessage {
  id: string;
  role: NormalizedMessageRole;
  content: string;
  recordedAt?: string;
  durationMs?: number;
  toolName?: string;
  toolStatus?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  toolUseId?: string;
}

export interface NormalizedTranscript {
  conversationId: string;
  vendorAgentId: string;
  messages: NormalizedMessage[];
}

export interface RuntimeSessionAdapter {
  readonly vendor: string;
  resolveDataRoot(): Promise<string>;
  resolveSessionRefs(vendorAgentId: string, cwd: string): Promise<SessionRefs>;
  getTranscript(vendorAgentId: string, refs: SessionRefs): Promise<NormalizedTranscript>;
}
