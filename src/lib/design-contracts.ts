export type ProjectKind =
  | 'prototype'
  | 'deck'
  | 'template'
  | 'other'
  | 'brand'
  | 'image'
  | 'video'
  | 'audio';

export type ProjectDisplayStatus =
  | 'not_started'
  | 'queued'
  | 'running'
  | 'awaiting_input'
  | 'succeeded'
  | 'incomplete'
  | 'failed'
  | 'canceled';

export interface ProjectStatusInfo {
  value: ProjectDisplayStatus;
  updatedAt?: number;
  runId?: string;
}

export interface ProjectMetadata {
  kind: ProjectKind;
  intent?: 'live-artifact' | 'web-clone' | 'document' | 'webgl-experience' | 'worker-visualizer';
  fidelity?: 'wireframe' | 'high-fidelity';
  entryFile?: string;
  baseDir?: string;
  skipDiscoveryBrief?: boolean;
  orchestratorWorkspace?: {
    kind: 'scratch';
    sourceLabel?: string;
    sourceRef?: string;
    baseRevision?: string;
    writeback?: 'external';
  };
}

export interface Project {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  createdAt: number;
  updatedAt: number;
  status?: ProjectStatusInfo;
  pendingPrompt?: string;
  metadata?: ProjectMetadata;
  appliedPluginSnapshotId?: string;
  customInstructions?: string;
}

export interface CreateProjectRequest {
  id: string;
  name: string;
  projectLocationId?: string;
  skillId?: string | null;
  designSystemId?: string | null;
  pendingPrompt?: string;
  metadata?: ProjectMetadata;
  pluginId?: string;
  appliedPluginSnapshotId?: string;
  pluginInputs?: Record<string, unknown>;
  conversationMode?: 'design' | 'chat' | 'plan';
  customInstructions?: string;
  skipDiscoveryBrief?: boolean;
}

export interface CreateProjectResponse {
  project: Project;
  conversationId?: string;
  appliedPluginSnapshotId?: string;
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface ProjectResponse {
  project: Project;
}

export type ProjectFileKind =
  | 'html'
  | 'image'
  | 'video'
  | 'audio'
  | 'sketch'
  | 'text'
  | 'code'
  | 'pdf'
  | 'document'
  | 'presentation'
  | 'spreadsheet'
  | 'binary';

export interface ProjectFile {
  name: string;
  path?: string;
  localPath?: string;
  type?: 'file' | 'dir';
  size: number;
  mtime: number;
  kind: ProjectFileKind;
  mime: string;
}

export interface ProjectFilesResponse {
  files: ProjectFile[];
}

export interface ProjectFileTextPreviewResponse {
  text: string;
  truncated: boolean;
  size: number;
  limit: number;
  mime: string;
  kind: ProjectFileKind;
  poweredPreview: {
    required: boolean;
    scannedBytes: number;
    complete: boolean;
  };
}

export type ChatSessionMode = 'design' | 'chat' | 'plan';

export interface ChatRequest {
  agentId: string;
  message: string;
  currentPrompt?: string;
  systemPrompt?: string;
  projectId?: string | null;
  conversationId?: string | null;
  sessionMode?: ChatSessionMode;
  assistantMessageId?: string | null;
  clientRequestId?: string | null;
  skillId?: string | null;
  skillIds?: string[];
  designSystemId?: string | null;
  attachments?: string[];
  model?: string | null;
  reasoning?: string | null;
  locale?: string;
  appliedPluginSnapshotId?: string | null;
}

export interface ChatRunCreateResponse {
  runId: string;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  mode:
    | 'prototype'
    | 'deck'
    | 'template'
    | 'design-system'
    | 'image'
    | 'video'
    | 'audio';
  previewType: string;
  designSystemRequired: boolean;
  hasBody: boolean;
  examplePrompt: string;
  aggregatesExamples: boolean;
}

export interface SkillsResponse {
  skills: SkillSummary[];
}

export interface DesignSystemSummary {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches?: string[];
  surface?: 'web' | 'image' | 'video' | 'audio';
  source?: 'built-in' | 'installed' | 'user';
  status?: 'draft' | 'published';
}

export interface DesignSystemsResponse {
  designSystems: DesignSystemSummary[];
}

export interface PluginSummary {
  id: string;
  title: string;
  version: string;
  sourceKind: 'bundled' | 'user' | 'project' | 'marketplace' | 'github' | 'url' | 'local';
  source: string;
  trust: 'official' | 'verified' | 'community' | 'local';
  capabilitiesGranted: string[];
  installedAt: number;
  updatedAt: number;
}

export interface PluginsResponse {
  plugins: PluginSummary[];
}

export type RoutineScheduleKind = 'hourly' | 'daily' | 'weekdays' | 'weekly';

export interface Routine {
  id: string;
  name: string;
  prompt: string;
  skillId: string | null;
  agentId: string | null;
  enabled: boolean;
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RoutinesResponse {
  routines: Routine[];
}

export interface SseTransportEvent<Name extends string, Payload> {
  id?: string;
  event: Name;
  data: Payload;
}

export interface SseErrorPayload {
  message: string;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface ChatSseStartPayload {
  runId?: string;
  agentId?: string;
  bin: string;
  projectId?: string | null;
  model?: string | null;
}

export interface ChatSseChunkPayload {
  chunk: string;
}

export interface ChatSseEndPayload {
  code: number | null;
  signal?: string | null;
  status?: 'succeeded' | 'failed' | 'canceled';
  artifactCount?: number;
  resumable?: boolean;
  endedWithUnfinishedWork?: boolean;
}

export type DaemonAgentPayload =
  | { type: 'status'; label: string; model?: string; detail?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'conversation_title'; title: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'thinking_start' }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  | { type: 'raw'; line: string };

export type ChatSseEvent =
  | SseTransportEvent<'start', ChatSseStartPayload>
  | SseTransportEvent<'agent', DaemonAgentPayload>
  | SseTransportEvent<'stdout', ChatSseChunkPayload>
  | SseTransportEvent<'stderr', ChatSseChunkPayload>
  | SseTransportEvent<'error', SseErrorPayload>
  | SseTransportEvent<'end', ChatSseEndPayload>;
