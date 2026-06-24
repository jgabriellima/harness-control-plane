export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'thinking' | 'tool';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  streaming?: boolean;
  durationMs?: number;
  recordedAt?: string;
  toolInput?: string;
  toolOutput?: string;
}

export type RunPhase = 'idle' | 'streaming' | 'completed' | 'failed';

export type RunActivityPhase = 'idle' | 'dispatching' | 'thinking' | 'tool' | 'responding';

export type WorkspaceLayoutMode = 'single' | 'split-2' | 'grid-4';

export interface ConversationRuntimeState {
  conversationId: string;
  agentId: string | null;
  projectId: string;
  title: string | null;
  updatedAt: string | null;
  messages: ChatMessage[];
  activeRunId: string | null;
  runPhase: RunPhase;
  runActivity: RunActivityPhase;
  toolActivity: string[];
  error: string | null;
  hydrated: boolean;
}

export interface RuntimeHubWireEvent {
  type: string;
  run_id: string;
  agent_id: string;
  conversation_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface DispatchMessagePayload {
  message: string;
  projectId: string;
  mode?: 'default' | 'deep_research';
  integrationSlots?: string[];
  attachments?: Array<{ name: string; path?: string; content_type?: string }>;
}

export interface RuntimeHubContextValue {
  foregroundConversationId: string | null;
  layoutMode: WorkspaceLayoutMode;
  paneConversationIds: string[];
  activeRunCount: number;
  setForegroundConversation: (conversationId: string | null) => void;
  setLayoutMode: (mode: WorkspaceLayoutMode) => void;
  setPaneConversationIds: (ids: string[]) => void;
  assignConversationToPane: (paneIndex: number, conversationId: string) => void;
  navigateToConversation: (conversationId: string, options?: { paneIndex?: number }) => void;
  startSessionInPane: (paneIndex: number, projectId?: string) => Promise<string | null>;
  getConversationPhase: (conversationId: string) => RunPhase;
  getConversationState: (conversationId: string) => ConversationRuntimeState | undefined;
  dispatchMessage: (conversationId: string | null, payload: DispatchMessagePayload) => Promise<void>;
  cancelActiveRun: (conversationId: string) => Promise<void>;
  hydrateConversation: (conversationId: string) => Promise<void>;
}

export const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'system',
  content: 'Ask the runtime anything. Slash commands are loaded from the harness on each request.',
};

export const LAYOUT_STORAGE_KEY = 'runtime-hub-layout-mode';
export const PANES_STORAGE_KEY = 'runtime-hub-pane-ids';
