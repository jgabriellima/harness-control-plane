import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { hasRuntimeBindingStamp, resolveHarnessBinding } from './harness-binding';
import { resolveHostRepoRoot } from './repo-root';
import { resolveWorkspacePath } from './workspaces-root';

const PACK_EXCLUDES = new Set([
  'runtime-sessions',
  'state',
  'handoffs',
  'traces',
  'workflows/output',
  'runs',
  'projects',
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

async function loadBaselineConfig(baselineRoot?: string): Promise<{ scope: string[]; excludes: string[] }> {
  const binding = baselineRoot
    ? await resolveHarnessBinding({ workspaceRoot: baselineRoot })
    : await resolveHarnessBinding();
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
      if (entry.name === 'runs' && basename(dirname(sourcePath)) === 'playbooks') {
        const sub = await readdir(sourcePath, { withFileTypes: true });
        const fixture = sub.find((e) => e.isDirectory() && e.name === 'playbook-e2e-fixture');
        if (fixture) {
          await cp(join(sourcePath, fixture.name), join(targetPath, fixture.name), { recursive: true });
        }
        continue;
      }
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

async function writeWorkspaceLayoutReadmes(workspacePath: string): Promise<void> {
  const uploadsDir = join(workspacePath, '.uploads');
  const outputsDir = join(workspacePath, '.outputs', 'workflows');
  await mkdir(uploadsDir, { recursive: true });
  await mkdir(outputsDir, { recursive: true });

  const uploadsReadme = join(uploadsDir, 'README.md');
  if (!(await pathExists(uploadsReadme))) {
    await writeFile(
      uploadsReadme,
      '# Uploads\n\nOperator and runtime file uploads — outside the harness.\n',
      'utf8',
    );
  }

  const outputsReadme = join(workspacePath, '.outputs', 'README.md');
  if (!(await pathExists(outputsReadme))) {
    await writeFile(
      outputsReadme,
      '# Outputs\n\nEphemeral workflow run bundles — outside `.business/`.\n',
      'utf8',
    );
  }
}

/**
 * Resolve canonical baseline template (ADR-046 / ADR-048).
 *
 * Priority:
 * 1) Bundled desktop: `{hostRepo}/harness-baseline/` or `{hostRepo}/resources/harness-baseline/`
 * 2) Dev host repo: `{hostRepo}/templates/workspace-baseline/`
 */
function resolveWorkspaceBaselineRoot(): string {
  const hostRepo = resolveHostRepoRoot();

  const candidates = [
    join(hostRepo, 'harness-baseline'),
    join(hostRepo, 'resources', 'harness-baseline'),
    join(hostRepo, 'templates', 'workspace-baseline'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, '.cursor', 'runtime-binding.yaml'))) {
      return candidate;
    }
  }

  throw new Error(
    `Workspace baseline missing — checked ${candidates.join(', ')}. ` +
      'Run: python3 app/.business/bin/business_workspace_template.py export',
  );
}

/**
 * Copy baseline `.cursor/` + harness pack into a workspace from templates/workspace-baseline/.
 */
export async function provisionWorkspacePack(
  workspacePath: string,
  projectName: string,
): Promise<void> {
  const baselineRoot = resolveWorkspaceBaselineRoot();
  const baselineBinding = await resolveHarnessBinding({ workspaceRoot: baselineRoot });
  const { excludes } = await loadBaselineConfig(baselineRoot);

  await mkdir(workspacePath, { recursive: true });

  const cursorSource = join(baselineRoot, '.cursor');
  const harnessSource = baselineBinding.harnessRoot;

  if (await pathExists(cursorSource)) {
    await copyTreeFiltered(cursorSource, join(workspacePath, '.cursor'), excludes);
  }

  if (await pathExists(harnessSource)) {
    const harnessDirName = harnessSource.slice(baselineRoot.length + 1);
    await copyTreeFiltered(harnessSource, join(workspacePath, harnessDirName), excludes);
  }

  await writeWorkspaceLayoutReadmes(workspacePath);
  await patchProjectName(workspacePath, projectName);
}

export async function isValidWorkspace(workspacePath: string): Promise<boolean> {
  return hasRuntimeBindingStamp(workspacePath);
}

export { resolveWorkspacePath };
