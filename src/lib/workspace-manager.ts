import { access, cp, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type { ProjectSummary } from './harness-types';
import { readSessionIndex } from './runtime-session-registry';
import { isValidWorkspace, provisionWorkspacePack, resolveWorkspacePath } from './workspace-pack';
import { ensureWorkspacesContainer } from './workspaces-root';
import { resolveHarnessBinding } from './harness-binding';
import { resolvePlatformAppRoot } from './repo-root';
import {
  DEFAULT_WORKSPACE_ID,
  LEGACY_DEFAULT_WORKSPACE_ID,
} from './workspace-constants';

export { DEFAULT_WORKSPACE_ID, LEGACY_DEFAULT_WORKSPACE_ID } from './workspace-constants';

const ACTIVE_PROJECT_COOKIE = 'br-active-project';

let workspacesReadyPromise: Promise<void> | null = null;

export function normalizeWorkspaceId(projectId: string | null | undefined): string | null {
  const trimmed = projectId?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === LEGACY_DEFAULT_WORKSPACE_ID) {
    return DEFAULT_WORKSPACE_ID;
  }
  return trimmed;
}

async function readSessionCount(workspacePath: string): Promise<number> {
  try {
    const index = await readSessionIndex(workspacePath);
    return index.conversations.filter((conversation) => conversation.archived !== true).length;
  } catch {
    return 0;
  }
}

async function migrateLegacyEmbedSessions(targetWorkspacePath: string): Promise<void> {
  const platformRoot = resolvePlatformAppRoot();
  const legacySessionsDir = join(platformRoot, '.business', 'runtime-sessions');
  const targetSessionsDir = join(targetWorkspacePath, '.business', 'runtime-sessions');
  const legacyIndexPath = join(legacySessionsDir, 'index.json');
  const targetIndexPath = join(targetSessionsDir, 'index.json');

  if (!(await pathExists(legacyIndexPath))) {
    return;
  }

  let legacyConversationCount = 0;
  try {
    const raw = await readFile(legacyIndexPath, 'utf8');
    const parsed = JSON.parse(raw) as { conversations?: unknown[] };
    legacyConversationCount = Array.isArray(parsed.conversations) ? parsed.conversations.length : 0;
  } catch {
    return;
  }

  if (legacyConversationCount === 0) {
    return;
  }

  let targetConversationCount = 0;
  if (await pathExists(targetIndexPath)) {
    try {
      const raw = await readFile(targetIndexPath, 'utf8');
      const parsed = JSON.parse(raw) as { conversations?: unknown[] };
      targetConversationCount = Array.isArray(parsed.conversations) ? parsed.conversations.length : 0;
    } catch {
      targetConversationCount = 0;
    }
  }

  if (targetConversationCount > 0) {
    return;
  }

  await mkdir(targetSessionsDir, { recursive: true });

  for (const fileName of ['index.json', 'registry.jsonl', '.harness-sessions.lock']) {
    const sourcePath = join(legacySessionsDir, fileName);
    if (await pathExists(sourcePath)) {
      await cp(sourcePath, join(targetSessionsDir, fileName));
    }
  }

  await rewriteSessionProjectIds(targetWorkspacePath, LEGACY_DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_ID);
}

async function rewriteSessionProjectIds(
  workspacePath: string,
  fromProjectId: string,
  toProjectId: string,
): Promise<void> {
  const indexPath = join(workspacePath, '.business', 'runtime-sessions', 'index.json');
  if (!(await pathExists(indexPath))) {
    return;
  }

  try {
    const raw = await readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      conversations?: Array<{ projectId?: string }>;
    };

    if (!Array.isArray(parsed.conversations)) {
      return;
    }

    let changed = false;
    for (const conversation of parsed.conversations) {
      if (conversation.projectId === fromProjectId) {
        conversation.projectId = toProjectId;
        changed = true;
      }
    }

    if (changed) {
      await writeFile(indexPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    }
  } catch {
    // Best-effort rewrite.
  }
}

async function migrateLegacyDefaultWorkspaceId(): Promise<void> {
  const container = await ensureWorkspacesContainer();
  const legacyPath = join(container, LEGACY_DEFAULT_WORKSPACE_ID);
  const defaultPath = resolveWorkspacePath(DEFAULT_WORKSPACE_ID);

  if (!(await pathExists(legacyPath)) || (await pathExists(defaultPath))) {
    return;
  }

  await rename(legacyPath, defaultPath);
  await rewriteSessionProjectIds(defaultPath, LEGACY_DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_ID);
  await patchDefaultWorkspaceMetadata(defaultPath);
}

async function ensureDefaultWorkspaceInternal(): Promise<void> {
  await ensureWorkspacesContainer();
  await migrateLegacyDefaultWorkspaceId();

  const defaultPath = resolveWorkspacePath(DEFAULT_WORKSPACE_ID);

  if (!(await isValidWorkspace(defaultPath))) {
    await provisionWorkspacePack(defaultPath, DEFAULT_WORKSPACE_ID);
  }

  await migrateLegacyEmbedSessions(defaultPath);
  await rewriteSessionProjectIds(defaultPath, LEGACY_DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_ID);
  await patchDefaultWorkspaceMetadata(defaultPath);
}

async function patchDefaultWorkspaceMetadata(defaultPath: string): Promise<void> {
  const binding = await resolveHarnessBinding({ workspaceRoot: defaultPath });
  if (!(await pathExists(binding.dslPath))) {
    return;
  }

  try {
    const raw = await readFile(binding.dslPath, 'utf8');
    const doc = parseYaml(raw) as unknown;
    if (!isRecord(doc)) {
      return;
    }

    const project = isRecord(doc.project) ? { ...doc.project } : {};
    const currentName = typeof project.name === 'string' ? project.name : '';
    if (currentName === DEFAULT_WORKSPACE_ID) {
      return;
    }

    project.name = DEFAULT_WORKSPACE_ID;
    project.description = 'Default business workspace';
    doc.project = project;
    await writeFile(binding.dslPath, `${stringifyYaml(doc)}\n`, 'utf8');
  } catch {
    // Best-effort metadata patch.
  }
}

/** Idempotent: provision default workspace under `workspaces/` and migrate legacy embed sessions. */
export async function ensureWorkspacesReady(): Promise<void> {
  if (!workspacesReadyPromise) {
    workspacesReadyPromise = ensureDefaultWorkspaceInternal().catch((error) => {
      workspacesReadyPromise = null;
      throw error;
    });
  }
  await workspacesReadyPromise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function slugify(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'unnamed';
  }
  return trimmed.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_');
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readWorkspaceMeta(
  projectId: string,
  activeId: string | null,
): Promise<ProjectSummary | null> {
  const workspacePath = resolveWorkspacePath(projectId);
  if (!(await isValidWorkspace(workspacePath))) {
    return null;
  }

  const binding = await resolveHarnessBinding({ workspaceRoot: workspacePath });
  const raw = await readFile(binding.dslPath, 'utf8');
  const doc = parseYaml(raw) as unknown;

  let name = projectId;
  let description = '';
  let status = 'operational';
  let initialized: string | null = null;

  if (isRecord(doc)) {
    status = typeof doc.status === 'string' ? doc.status : status;
    initialized =
      typeof doc.initialized === 'string'
        ? doc.initialized
        : typeof doc.initialized === 'number'
          ? String(doc.initialized)
          : null;

    if (isRecord(doc.project)) {
      name = typeof doc.project.name === 'string' ? doc.project.name : projectId;
      description =
        typeof doc.project.description === 'string' ? doc.project.description : description;
    }
  }

  return {
    id: projectId,
    name,
    description,
    status,
    initialized,
    active: projectId === activeId,
    path: workspacePath,
  };
}

export function parseActiveProjectId(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === ACTIVE_PROJECT_COOKIE) {
      const value = rest.join('=').trim();
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

export function activeProjectCookieHeader(projectId: string): string {
  return `${ACTIVE_PROJECT_COOKIE}=${encodeURIComponent(projectId)}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

export async function listWorkspaceProjects(activeId?: string | null): Promise<ProjectSummary[]> {
  await ensureWorkspacesReady();

  const container = await ensureWorkspacesContainer();
  let entries: string[] = [];

  try {
    const dirEntries = await readdir(container, { withFileTypes: true });
    entries = dirEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }

  entries.sort((left, right) => {
    if (left === DEFAULT_WORKSPACE_ID) {
      return -1;
    }
    if (right === DEFAULT_WORKSPACE_ID) {
      return 1;
    }
    return left.localeCompare(right);
  });

  const resolvedActive = normalizeWorkspaceId(activeId) ?? DEFAULT_WORKSPACE_ID ?? entries[0] ?? null;
  const projects: ProjectSummary[] = [];

  for (const projectId of entries) {
    const meta = await readWorkspaceMeta(projectId, resolvedActive);
    if (meta) {
      const workspacePath = meta.path ?? resolveWorkspacePath(projectId);
      projects.push({
        ...meta,
        sessionCount: await readSessionCount(workspacePath),
      });
    }
  }

  if (projects.length === 0) {
    return [];
  }

  const hasActive = projects.some((project) => project.active);
  if (!hasActive && projects[0]) {
    projects[0].active = true;
  }

  return projects;
}

export async function getWorkspaceProject(
  projectId: string,
  activeId?: string | null,
): Promise<ProjectSummary | null> {
  const projects = await listWorkspaceProjects(activeId ?? projectId);
  return projects.find((project) => project.id === projectId) ?? null;
}

export async function createWorkspaceProject(input: {
  name: string;
  activeId?: string | null;
}): Promise<ProjectSummary> {
  const projectId = slugify(input.name);
  const workspacePath = resolveWorkspacePath(projectId);

  if (await pathExists(workspacePath)) {
    throw new Error(`Workspace already exists: ${projectId}`);
  }

  await provisionWorkspacePack(workspacePath, input.name.trim() || projectId);

  const project = await readWorkspaceMeta(projectId, projectId);
  if (!project) {
    throw new Error(`Failed to read provisioned workspace: ${projectId}`);
  }

  project.active = true;
  return project;
}

export function resolveProjectWorkspaceRoot(projectId: string): string {
  return resolveWorkspacePath(projectId);
}

export async function resolveActiveWorkspaceRoot(
  activeProjectId?: string | null,
): Promise<string> {
  await ensureWorkspacesReady();

  const trimmedActive = normalizeWorkspaceId(activeProjectId);
  if (trimmedActive) {
    const workspacePath = resolveWorkspacePath(trimmedActive);
    if (await isValidWorkspace(workspacePath)) {
      return workspacePath;
    }
  }

  return resolveWorkspacePath(DEFAULT_WORKSPACE_ID);
}
