import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveHarnessBinding } from './harness-binding';
import type { ProjectSummary } from './harness-types';
import { readSessionIndex } from './runtime-session-registry';

interface StoredProject {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
  createdAt?: string;
}

interface ProjectsIndex {
  version: number;
  updatedAt: string;
  projects: StoredProject[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function projectsIndexPath(workspaceRoot?: string): Promise<string> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  return join(binding.harnessRoot, 'projects', 'index.json');
}

async function readProjectsIndex(workspaceRoot?: string): Promise<ProjectsIndex> {
  const indexPath = await projectsIndexPath(workspaceRoot);
  try {
    const raw = await readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.projects)) {
      throw new Error('Invalid projects index');
    }
    return parsed as ProjectsIndex;
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      projects: [],
    };
  }
}

async function writeProjectsIndex(index: ProjectsIndex, workspaceRoot?: string): Promise<void> {
  const indexPath = await projectsIndexPath(workspaceRoot);
  const projectsDir = join(indexPath, '..');
  await mkdir(projectsDir, { recursive: true });
  await writeFile(
    indexPath,
    `${JSON.stringify({ ...index, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

export async function syncProjectsFromSessions(): Promise<ProjectSummary[]> {
  const [index, sessions] = await Promise.all([readProjectsIndex(), readSessionIndex()]);

  const sessionCounts = new Map<string, number>();
  for (const conversation of sessions.conversations) {
    const count = sessionCounts.get(conversation.projectId) ?? 0;
    sessionCounts.set(conversation.projectId, count + 1);
  }

  const knownIds = new Set(index.projects.map((project) => project.id));

  for (const conversation of sessions.conversations) {
    if (knownIds.has(conversation.projectId)) {
      continue;
    }
    index.projects.push({
      id: conversation.projectId,
      name: conversation.projectId,
      description: 'Auto-discovered from session registry',
      active: false,
      createdAt: conversation.updatedAt,
    });
    knownIds.add(conversation.projectId);
  }

  await writeProjectsIndex(index);

  return index.projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    status: 'operational',
    initialized: project.createdAt ?? null,
    active: project.active ?? false,
    sessionCount: sessionCounts.get(project.id) ?? 0,
  }));
}

export async function listProjectsFromIndex(): Promise<ProjectSummary[]> {
  return syncProjectsFromSessions();
}

export async function getProjectSessionIds(projectId: string): Promise<string[]> {
  const sessions = await readSessionIndex();
  return sessions.conversations
    .filter((conversation) => conversation.projectId === projectId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((conversation) => conversation.id);
}
