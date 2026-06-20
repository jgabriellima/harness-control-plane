import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { hasRuntimeBindingStamp, resolveHarnessBinding } from './harness-binding';
import { resolvePlatformAppRoot } from './repo-root';
import { resolveWorkspacePath } from './workspaces-root';

const PACK_EXCLUDES = new Set([
  'runtime-sessions',
  'state',
  'handoffs',
  'traces',
  'workflows/output',
  'runs',
]);

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function loadBaselineConfig(): Promise<{ scope: string[]; excludes: string[] }> {
  const binding = await resolveHarnessBinding();
  const raw = await readFile(binding.dslPath, 'utf8');
  const doc = parseYaml(raw) as unknown;

  if (!isRecord(doc) || !isRecord(doc.baseline)) {
    return { scope: ['.business/**', '.cursor/**'], excludes: [] };
  }

  const baseline = doc.baseline;
  const scope = Array.isArray(baseline.scope)
    ? baseline.scope.filter((item): item is string => typeof item === 'string')
    : ['.business/**', '.cursor/**'];
  const excludes = Array.isArray(baseline.excludes)
    ? baseline.excludes.filter((item): item is string => typeof item === 'string')
    : [];

  return { scope, excludes };
}

function shouldSkipRelativePath(relativePath: string, excludes: string[]): boolean {
  const normalized = relativePath.replace(/\\/g, '/');

  for (const segment of PACK_EXCLUDES) {
    if (normalized.includes(segment)) {
      return true;
    }
  }

  for (const pattern of excludes) {
    const stripped = pattern.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^\.\//, '');
    if (stripped.length > 0 && normalized.includes(stripped.replace(/\/$/, ''))) {
      return true;
    }
  }

  return false;
}

async function copyTreeFiltered(
  sourceRoot: string,
  targetRoot: string,
  excludes: string[],
): Promise<void> {
  await mkdir(targetRoot, { recursive: true });
  const entries = await readdir(sourceRoot, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    const relativePath = entry.name;

    if (shouldSkipRelativePath(relativePath, excludes)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyTreeFiltered(sourcePath, targetPath, excludes);
    } else if (entry.isFile()) {
      await cp(sourcePath, targetPath);
    }
  }
}

async function patchProjectName(workspacePath: string, projectName: string): Promise<void> {
  const binding = await resolveHarnessBinding({ workspaceRoot: workspacePath });
  if (!(await pathExists(binding.dslPath))) {
    return;
  }

  const raw = await readFile(binding.dslPath, 'utf8');
  const doc = parseYaml(raw) as unknown;

  if (!isRecord(doc)) {
    return;
  }

  const project = isRecord(doc.project) ? { ...doc.project } : {};
  project.name = projectName;
  project.description = `Business workspace — ${projectName}`;
  doc.project = project;
  doc.initialized = new Date().toISOString().slice(0, 10);
  doc.status = 'operational';

  if (isRecord(doc.runtime) && isRecord(doc.runtime.session_store)) {
    doc.runtime.session_store.workspace_root = workspacePath;
  }

  await writeFile(binding.dslPath, stringifyYaml(doc), 'utf8');
}

/**
 * Copy platform baseline `.cursor/` (including runtime-binding stamp) and harness pack into a workspace.
 */
export async function provisionWorkspacePack(
  workspacePath: string,
  projectName: string,
): Promise<void> {
  const platformBinding = await resolveHarnessBinding();
  const platformRoot = platformBinding.workspaceRoot;
  const { excludes } = await loadBaselineConfig();

  await mkdir(workspacePath, { recursive: true });

  const cursorSource = join(platformRoot, '.cursor');
  const harnessSource = platformBinding.harnessRoot;

  if (await pathExists(cursorSource)) {
    await copyTreeFiltered(cursorSource, join(workspacePath, '.cursor'), excludes);
  }

  if (await pathExists(harnessSource)) {
    const harnessDirName = harnessSource.slice(platformRoot.length + 1);
    await copyTreeFiltered(harnessSource, join(workspacePath, harnessDirName), excludes);
  }

  await patchProjectName(workspacePath, projectName);
}

export async function isValidWorkspace(workspacePath: string): Promise<boolean> {
  return hasRuntimeBindingStamp(workspacePath);
}

export { resolveWorkspacePath };
