import {
  DESIGN_SKILL_CHIPS,
  type DesignSkillChip,
} from './design-navigation';
import {
  type DesignStudioSurface,
  inferDesignStudioSurface,
  projectRawFileUrl,
  studioSurfaceUsesDeckBridge,
} from './design-studio-surface';
import { buildDesignSrcdoc } from './design-srcdoc';
import type { CreateProjectRequest, ProjectKind } from './design-contracts';

export { buildDesignSrcdoc } from './design-srcdoc';

const DESIGN_API_PREFIX = '/api/design';

export interface DesignSkill {
  id: string;
  name: string;
  displayName?: Record<string, string>;
  description?: string;
  mode?: string;
}

export interface OrchestratorWorkspaceMetadata {
  kind: 'scratch';
  sourceLabel?: string;
  sourceRef?: string;
  baseRevision?: string;
  writeback?: 'external';
}

export interface DesignProjectMetadata {
  kind?: string;
  baseDir?: string;
  orchestratorWorkspace?: OrchestratorWorkspaceMetadata;
  skipDiscoveryBrief?: boolean;
}

export interface DesignProjectRecord {
  id: string;
  name: string;
  skillId?: string | null;
  metadata?: DesignProjectMetadata;
  updatedAt?: string | number;
  status?: { value?: string };
}

export interface DesignProjectFile {
  path: string;
  name: string;
  kind?: DesignProjectFileKind;
  mtime?: number;
}

export type DesignProjectFileKind =
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

export interface ProjectFilePreviewSection {
  title: string;
  lines: string[];
}

export interface ProjectFilePreview {
  kind: 'pdf' | 'document' | 'presentation' | 'spreadsheet';
  title: string;
  sections: ProjectFilePreviewSection[];
}

export interface DesignPluginRecord {
  id: string;
  title: string;
  manifest?: {
    description?: string;
    description_i18n?: Record<string, string>;
    od?: Record<string, unknown>;
  };
}

export interface DesignSystemRecord {
  id: string;
  title: string;
  summary: string;
  swatches?: string[];
  category?: string;
  body?: string;
  source?: 'built-in' | 'installed' | 'user';
  status?: 'draft' | 'published';
}

export interface DesignTokenSpecimen {
  name: string;
  value: string;
  type?: string;
  layer?: string;
  confidence?: string;
}

export interface DesignSystemDetailRecord extends DesignSystemRecord {
  packageInfo?: {
    manifest?: {
      files?: {
        designTokens?: string;
        tokens?: string;
      };
    };
    sourceEvidence?: {
      tokenContract?: {
        grade?: string;
        score?: number;
        totalTokens?: number;
      };
    };
  };
  tokens?: DesignTokenSpecimen[];
}

export interface DesignPluginDetailRecord extends DesignPluginRecord {
  version?: string;
  sourceKind?: string;
  trust?: string;
  capabilitiesGranted?: string[];
}

export interface DesignRoutineRecord {
  id: string;
  name: string;
  prompt: string;
  enabled: boolean;
  schedule: {
    kind?: string;
    time?: string;
    timezone?: string;
  };
  lastRun?: {
    status?: string;
  } | null;
  nextRunAt?: number | null;
}

export interface CreateDesignProjectInput {
  skillId: string;
  pendingPrompt: string;
  skipDiscoveryBrief?: boolean;
  name?: string;
  baseDir?: string;
  orchestratorWorkspace?: OrchestratorWorkspaceMetadata;
}

export interface CreateDesignProjectResult {
  project: DesignProjectRecord;
  conversationId?: string;
}

export interface CreateDesignRunInput {
  projectId: string;
  message: string;
  conversationId?: string;
  sessionMode?: 'design' | 'chat' | 'plan';
}

export interface CreateDesignRunResult {
  runId: string;
}

export interface DesignRunStreamHandlers {
  onTextDelta: (delta: string) => void;
  onStatus?: (status: string) => void;
  onError: (error: Error) => void;
  onComplete?: (status: string) => void;
}

function randomProjectId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `proj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function deriveProjectName(brief: string): string {
  const line = brief.trim().split('\n')[0]?.trim() ?? 'Untitled design';
  return line.length > 64 ? `${line.slice(0, 61)}...` : line;
}

function mapSkillMode(mode: string | undefined): DesignSkillChip['mode'] {
  switch (mode) {
    case 'prototype':
    case 'live-artifact':
    case 'deck':
    case 'image':
    case 'video':
    case 'hyperframes':
    case 'audio':
      return mode;
    default:
      return 'prototype';
  }
}

function skillLabel(skill: DesignSkill): string {
  const localized = skill.displayName?.en ?? skill.displayName?.['en-US'];
  if (typeof localized === 'string' && localized.trim()) {
    return localized.trim();
  }
  return skill.name;
}

async function designFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${DESIGN_API_PREFIX}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Design API ${path} failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

async function designFetchText(path: string): Promise<string | null> {
  try {
    const response = await fetch(`${DESIGN_API_PREFIX}${path}`);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

function encodeProjectPath(filePath: string): string {
  return filePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

interface SseParsedFrame {
  kind: 'event' | 'comment';
  event?: string;
  data?: string;
  id?: string;
}

function parseSseFrame(frame: string): SseParsedFrame | null {
  let eventName: string | undefined;
  let data = '';
  let id: string | undefined;

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += (data ? '\n' : '') + line.slice(5).trim();
    } else if (line.startsWith('id:')) {
      id = line.slice(3).trim();
    } else if (line.startsWith(':')) {
      return { kind: 'comment' };
    }
  }

  if (!eventName && !data) {
    return null;
  }

  return {
    kind: 'event',
    event: eventName,
    data,
    id,
  };
}

export async function listDesignProjects(): Promise<DesignProjectRecord[]> {
  const payload = await designFetch<{ projects?: DesignProjectRecord[] }>('/projects');
  return payload.projects ?? [];
}

export async function getDesignProject(projectId: string): Promise<DesignProjectRecord | null> {
  try {
    const payload = await designFetch<{ project?: DesignProjectRecord }>(
      `/projects/${encodeURIComponent(projectId)}`,
    );
    return payload.project ?? null;
  } catch {
    return null;
  }
}

export function buildCreateProjectRequest(
  input: Partial<CreateProjectRequest> & Pick<CreateProjectRequest, 'name'>,
): CreateProjectRequest {
  return {
    id: input.id ?? randomProjectId(),
    name: input.name,
    skillId: input.skillId ?? null,
    designSystemId: input.designSystemId ?? null,
    pendingPrompt: input.pendingPrompt,
    metadata: input.metadata,
    skipDiscoveryBrief: input.skipDiscoveryBrief ?? true,
    conversationMode: input.conversationMode ?? 'design',
  };
}

export async function createDesignProject(
  input: CreateDesignProjectInput,
): Promise<CreateDesignProjectResult> {
  const metadata: DesignProjectMetadata = {
    kind: mapSkillModeToProjectKind(input.skillId),
    skipDiscoveryBrief: true,
  };
  if (input.baseDir?.trim()) {
    metadata.baseDir = input.baseDir.trim();
  }
  if (input.orchestratorWorkspace) {
    metadata.orchestratorWorkspace = input.orchestratorWorkspace;
  }

  const request = buildCreateProjectRequest({
    name: input.name ?? deriveProjectName(input.pendingPrompt),
    skillId: input.skillId,
    pendingPrompt: input.pendingPrompt,
    skipDiscoveryBrief: input.skipDiscoveryBrief ?? true,
    metadata,
  });
  const payload = await designFetch<CreateDesignProjectResult>('/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return payload;
}

function mapSkillModeToProjectKind(skillId: string): ProjectKind {
  const chip = DESIGN_SKILL_CHIPS.find((item) => item.id === skillId);
  const mode = chip?.mode ?? 'prototype';
  if (mode === 'live-artifact' || mode === 'hyperframes') {
    return 'prototype';
  }
  if (mode === 'deck' || mode === 'image' || mode === 'video' || mode === 'audio') {
    return mode;
  }
  return 'prototype';
}

export async function listSkills(): Promise<DesignSkill[]> {
  try {
    const payload = await designFetch<{ skills?: DesignSkill[] }>('/skills');
    return payload.skills ?? [];
  } catch {
    return [];
  }
}

export function skillsToChips(skills: DesignSkill[]): DesignSkillChip[] {
  if (skills.length === 0) {
    return DESIGN_SKILL_CHIPS;
  }

  const preferredIds = new Set(DESIGN_SKILL_CHIPS.map((chip) => chip.id));
  const matched = skills.filter((skill) => preferredIds.has(skill.id));
  const source = matched.length > 0 ? matched : skills.slice(0, DESIGN_SKILL_CHIPS.length);

  return source.map((skill) => ({
    id: skill.id,
    label: skillLabel(skill),
    mode: mapSkillMode(skill.mode),
  }));
}

export async function listProjectFiles(projectId: string): Promise<DesignProjectFile[]> {
  try {
    const payload = await designFetch<{ files?: DesignProjectFile[] }>(
      `/projects/${encodeURIComponent(projectId)}/files`,
    );
    return payload.files ?? [];
  } catch {
    return [];
  }
}

export async function fetchProjectFileText(
  projectId: string,
  filePath: string,
): Promise<string | null> {
  try {
    const payload = await designFetch<{ text?: string }>(
      `/projects/${encodeURIComponent(projectId)}/files/${encodeProjectPath(filePath)}/preview`,
    );
    if (typeof payload.text === 'string') {
      return payload.text;
    }
  } catch {
    // fall through to raw fetch
  }

  return designFetchText(`/projects/${encodeURIComponent(projectId)}/raw/${encodeProjectPath(filePath)}`);
}

export async function fetchProjectFilePreview(
  projectId: string,
  filePath: string,
): Promise<ProjectFilePreview | null> {
  try {
    const payload = await designFetch<ProjectFilePreview>(
      `/projects/${encodeURIComponent(projectId)}/files/${encodeProjectPath(filePath)}/preview`,
    );
    return payload;
  } catch {
    return null;
  }
}

export async function resolveProjectPreviewSrcdoc(
  projectId: string,
  filePath: string,
  options?: {
    projectKind?: string;
    fileKind?: DesignProjectFileKind;
    surface?: DesignStudioSurface;
  },
): Promise<string | null> {
  const text = await fetchProjectFileText(projectId, filePath);
  if (!text) {
    return null;
  }

  const surface =
    options?.surface ??
    inferDesignStudioSurface(options?.projectKind, {
      path: filePath,
      kind: options?.fileKind,
    }, text);

  return buildDesignSrcdoc(text, { deck: studioSurfaceUsesDeckBridge(surface) });
}

export { projectRawFileUrl } from './design-studio-surface';

export async function createDesignRun(input: CreateDesignRunInput): Promise<CreateDesignRunResult> {
  const payload = await designFetch<{ runId?: string }>('/runs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OD-Client': 'web',
    },
    body: JSON.stringify({
      projectId: input.projectId,
      message: input.message,
      conversationId: input.conversationId,
      sessionMode: input.sessionMode ?? 'design',
    }),
  });

  if (!payload.runId) {
    throw new Error('Design run did not return a run id');
  }

  return { runId: payload.runId };
}

export async function streamDesignRunEvents(
  runId: string,
  handlers: DesignRunStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let lastEventId: string | null = null;
  let endStatus: string | null = null;

  for (let reconnects = 0; endStatus === null && reconnects < 5; reconnects += 1) {
    const query = lastEventId ? `?after=${encodeURIComponent(lastEventId)}` : '';
    let response: Response;

    try {
      response = await fetch(`${DESIGN_API_PREFIX}/runs/${encodeURIComponent(runId)}/events${query}`, {
        method: 'GET',
        signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }
      reconnects += 1;
      continue;
    }

    if (!response.ok || !response.body) {
      handlers.onError(new Error(`Run stream failed (${response.status})`));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        break;
      }

      const { value, done } = readResult;
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let frameIndex = buffer.indexOf('\n\n');
      while (frameIndex !== -1) {
        const frame = buffer.slice(0, frameIndex);
        buffer = buffer.slice(frameIndex + 2);
        const parsed = parseSseFrame(frame);
        if (parsed?.kind === 'event') {
          if (parsed.id) {
            lastEventId = parsed.id;
          }
          endStatus = handleRunSseEvent(parsed.event, parsed.data, handlers) ?? endStatus;
        }
        frameIndex = buffer.indexOf('\n\n');
      }
    }
  }

  handlers.onComplete?.(endStatus ?? 'unknown');
}

function handleRunSseEvent(
  eventName: string | undefined,
  dataText: string | undefined,
  handlers: DesignRunStreamHandlers,
): string | null {
  if (!dataText) {
    return null;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataText) as Record<string, unknown>;
  } catch {
    if (eventName === 'stdout' && typeof dataText === 'string') {
      handlers.onTextDelta(dataText);
      return null;
    }
    return null;
  }

  if (eventName === 'stdout' && typeof data.chunk === 'string') {
    handlers.onTextDelta(data.chunk);
    return null;
  }

  if (eventName === 'agent') {
    const type = data.type;
    if (type === 'text_delta' && typeof data.delta === 'string') {
      handlers.onTextDelta(data.delta);
    } else if (type === 'status' && typeof data.label === 'string') {
      handlers.onStatus?.(data.label);
    }
    return null;
  }

  if (eventName === 'end') {
    const status = typeof data.status === 'string' ? data.status : 'completed';
    return status;
  }

  if (eventName === 'error') {
    const message = typeof data.message === 'string' ? data.message : 'Run failed';
    handlers.onError(new Error(message));
    return 'failed';
  }

  return null;
}

export async function listPlugins(): Promise<DesignPluginRecord[]> {
  try {
    const payload = await designFetch<{ plugins?: DesignPluginRecord[] }>('/plugins');
    const plugins = payload.plugins ?? [];
    return plugins.filter((plugin) => plugin.manifest?.od?.hidden !== true);
  } catch {
    return [];
  }
}

export async function listDesignSystems(): Promise<DesignSystemRecord[]> {
  try {
    const payload = await designFetch<{ designSystems?: DesignSystemRecord[] }>('/design-systems');
    return payload.designSystems ?? [];
  } catch {
    return [];
  }
}

interface DesignTokensFile {
  tokens?: Array<{
    name?: string;
    value?: string;
    type?: string;
    layer?: string;
    confidence?: string;
  }>;
}

function swatchesToTokenSpecimens(swatches: string[] | undefined): DesignTokenSpecimen[] {
  if (!swatches || swatches.length === 0) {
    return [];
  }
  return swatches.map((value, index) => ({
    name: `--swatch-${index + 1}`,
    value,
    type: 'color',
    layer: 'palette',
  }));
}

function parseDesignTokensPayload(text: string): DesignTokenSpecimen[] {
  try {
    const payload = JSON.parse(text) as DesignTokensFile;
    if (!Array.isArray(payload.tokens)) {
      return [];
    }
    return payload.tokens
      .filter((token): token is Required<Pick<typeof token, 'name' | 'value'>> & typeof token => {
        return typeof token.name === 'string' && typeof token.value === 'string';
      })
      .map((token) => ({
        name: token.name,
        value: token.value,
        type: token.type,
        layer: token.layer,
        confidence: token.confidence,
      }));
  } catch {
    return [];
  }
}

async function fetchDesignSystemTokenSpecimens(designSystemId: string): Promise<DesignTokenSpecimen[]> {
  const tokensText = await designFetchText(
    `/design-systems/${encodeURIComponent(designSystemId)}/static?path=${encodeURIComponent('design-tokens.json')}`,
  );
  if (tokensText) {
    const parsed = parseDesignTokensPayload(tokensText);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  const cssText = await designFetchText(
    `/design-systems/${encodeURIComponent(designSystemId)}/static?path=${encodeURIComponent('tokens.css')}`,
  );
  if (!cssText) {
    return [];
  }

  const specimens: DesignTokenSpecimen[] = [];
  const tokenPattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match = tokenPattern.exec(cssText);
  while (match) {
    specimens.push({
      name: match[1],
      value: match[2].trim(),
      type: 'css-variable',
    });
    match = tokenPattern.exec(cssText);
  }
  return specimens;
}

export async function getDesignSystem(designSystemId: string): Promise<DesignSystemDetailRecord | null> {
  try {
    const payload = await designFetch<{ designSystem?: DesignSystemDetailRecord } & DesignSystemDetailRecord>(
      `/design-systems/${encodeURIComponent(designSystemId)}`,
    );
    const detail = payload.designSystem ?? payload;
    if (!detail.id) {
      return null;
    }

    const tokenFile = await fetchDesignSystemTokenSpecimens(designSystemId);
    const swatchTokens = swatchesToTokenSpecimens(detail.swatches);
    const tokens = tokenFile.length > 0 ? tokenFile : swatchTokens;

    return {
      ...detail,
      tokens,
    };
  } catch {
    return null;
  }
}

export async function getPlugin(pluginId: string): Promise<DesignPluginDetailRecord | null> {
  try {
    const payload = await designFetch<DesignPluginDetailRecord>(
      `/plugins/${encodeURIComponent(pluginId)}`,
    );
    if (!payload.id) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function listRoutines(): Promise<DesignRoutineRecord[]> {
  try {
    const payload = await designFetch<{ routines?: DesignRoutineRecord[] }>('/routines');
    return payload.routines ?? [];
  } catch {
    return [];
  }
}

export async function runRoutine(routineId: string): Promise<void> {
  await designFetch(`/routines/${encodeURIComponent(routineId)}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export const DESIGN_APPLIED_PLUGIN_QUERY_KEY = 'design-applied-plugin-query';

export interface ApplyPluginResult {
  query: string;
  appliedPlugin?: {
    pluginId: string;
    snapshotId?: string;
  };
}

export interface PluginInstallOutcome {
  ok: boolean;
  message: string;
  pluginId?: string;
  pluginTitle?: string;
}

export interface BrandExtractStartResult {
  id: string;
  projectId: string;
  conversationId: string;
  sourceUrl: string;
  status: string;
  designSystemId?: string;
  brandName?: string;
}

export interface CreateDesignRoutineInput {
  name: string;
  prompt: string;
  scheduleKind?: string;
  scheduleTime?: string;
  timezone?: string;
  targetProjectId?: string;
}

export async function createDesignRoutine(input: CreateDesignRoutineInput): Promise<DesignRoutineRecord> {
  const payload = await designFetch<{ routine?: DesignRoutineRecord }>('/routines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      prompt: input.prompt,
      enabled: true,
      schedule: {
        kind: input.scheduleKind ?? 'daily',
        time: input.scheduleTime ?? '09:00',
        timezone: input.timezone ?? 'UTC',
      },
      target: input.targetProjectId
        ? { kind: 'project', projectId: input.targetProjectId }
        : { kind: 'scratch' },
    }),
  });
  if (!payload.routine?.id) {
    throw new Error('Routine creation did not return a routine');
  }
  return payload.routine;
}

export async function applyPlugin(
  pluginId: string,
  options?: { projectId?: string; locale?: string },
): Promise<ApplyPluginResult | null> {
  try {
    const payload = await designFetch<ApplyPluginResult>(
      `/plugins/${encodeURIComponent(pluginId)}/apply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: {},
          projectId: options?.projectId,
          grantCaps: [],
          locale: options?.locale ?? 'en',
        }),
      },
    );
    if (!payload.query) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

interface PluginInstallSseEvent {
  kind?: 'progress' | 'success' | 'error';
  message?: string;
  plugin?: { id?: string; title?: string };
}

async function* readPluginInstallEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<PluginInstallSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let frameIndex = buffer.indexOf('\n\n');
    while (frameIndex !== -1) {
      const frame = buffer.slice(0, frameIndex);
      buffer = buffer.slice(frameIndex + 2);
      const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
      if (dataLine) {
        try {
          yield JSON.parse(dataLine.slice(5).trim()) as PluginInstallSseEvent;
        } catch {
          // ignore malformed frames
        }
      }
      frameIndex = buffer.indexOf('\n\n');
    }
  }
}

export async function installPluginFromSource(source: string): Promise<PluginInstallOutcome> {
  const response = await fetch(`${DESIGN_API_PREFIX}/plugins/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ source }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { ok: false, message: text || `Install failed (${response.status})` };
  }

  if (!response.body) {
    return { ok: false, message: 'Install stream did not start' };
  }

  let successMessage = 'Plugin installed';
  let pluginId: string | undefined;
  let pluginTitle: string | undefined;
  let errorMessage: string | undefined;

  for await (const event of readPluginInstallEvents(response.body)) {
    if (event.kind === 'success' && event.plugin) {
      pluginId = event.plugin.id;
      pluginTitle = event.plugin.title;
      successMessage = event.message ?? `Installed ${pluginTitle ?? 'plugin'}`;
    }
    if (event.kind === 'error') {
      errorMessage = event.message ?? 'Install failed';
    }
  }

  if (errorMessage) {
    return { ok: false, message: errorMessage };
  }

  return {
    ok: Boolean(pluginId),
    message: successMessage,
    pluginId,
    pluginTitle,
  };
}

export async function startBrandExtraction(input: {
  url?: string;
  description?: string;
  designMd?: string;
  locale?: string;
}): Promise<BrandExtractStartResult> {
  const payload = await designFetch<BrandExtractStartResult>('/brands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(input.url?.trim() ? { url: input.url.trim() } : {}),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.designMd?.trim() ? { designMd: input.designMd.trim() } : {}),
      locale: input.locale ?? 'en',
    }),
  });

  if (!payload.projectId) {
    throw new Error('Brand extraction did not return a project');
  }

  return payload;
}

export function formatProjectUpdatedAt(value: string | number | undefined): string {
  if (value == null) {
    return 'Recently';
  }
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatRoutineSchedule(schedule: DesignRoutineRecord['schedule']): string {
  const kind = schedule.kind ?? 'daily';
  const time = schedule.time ?? '09:00';
  const timezone = schedule.timezone ?? 'UTC';
  return `${kind} at ${time} (${timezone})`;
}

export function pluginDescription(plugin: DesignPluginRecord): string {
  const localized = plugin.manifest?.description_i18n?.en;
  if (typeof localized === 'string' && localized.trim()) {
    return localized.trim();
  }
  if (typeof plugin.manifest?.description === 'string' && plugin.manifest.description.trim()) {
    return plugin.manifest.description.trim();
  }
  return 'Workflow plugin for Open Design projects.';
}
