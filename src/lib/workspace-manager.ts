import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import type { ProjectSummary } from './harness-types';
import { isValidWorkspace, provisionWorkspacePack, resolveWorkspacePath } from './workspace-pack';
import { ensureWorkspacesContainer } from './workspaces-root';
import { resolveHarnessBinding } from './harness-binding';
import { resolvePlatformAppRoot } from './repo-root';

const ACTIVE_PROJECT_COOKIE = 'br-active-project';

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
  const container = await ensureWorkspacesContainer();
  let entries: string[] = [];

  try {
    const dirEntries = await readdir(container, { withFileTypes: true });
    entries = dirEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }

  entries.sort((left, right) => left.localeCompare(right));

  const resolvedActive = activeId ?? entries[0] ?? null;
  const projects: ProjectSummary[] = [];

  for (const projectId of entries) {
    const meta = await readWorkspaceMeta(projectId, resolvedActive);
    if (meta) {
      projects.push(meta);
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
  const projects = await listWorkspaceProjects(activeProjectId ?? undefined);
  const active = projects.find((project) => project.active) ?? projects[0];

  if (!active) {
    return resolvePlatformAppRoot();
  }

  return active.path ?? resolveWorkspacePath(active.id);
}
