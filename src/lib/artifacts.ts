import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import * as Sentry from '@sentry/astro';

import { resolveHarnessBinding } from './harness-binding';
import { buildExecutionViewModel, type ExecutionArtifact } from './execution-events';
import { getExecutionDetail, listExecutions } from './harness-reader';

export interface ArtifactVersion {
  version: string;
  artifactId: string;
  executionId: string;
  createdAt: string;
  uri?: string;
}

export interface ArtifactDetail {
  id: string;
  name: string;
  type: string;
  version: string;
  createdAt: string;
  executionId: string;
  nodeId?: string;
  uri?: string;
  previewContent: string | null;
  previewMime: string;
  versions: ArtifactVersion[];
}

export interface ArtifactSummary {
  id: string;
  name: string;
  type: string;
  version: string;
  createdAt: string;
  executionId: string;
}

function assertWithinHarnessRoot(filePath: string, harnessRoot: string): string {
  const resolved = resolve(filePath);
  if (!resolved.startsWith(harnessRoot)) {
    throw new Error('Artifact path is outside harness root');
  }
  return resolved;
}

async function readArtifactPreview(
  uri: string | undefined,
  type: string,
  workspaceRoot: string,
  harnessRoot: string,
): Promise<{ content: string | null; mime: string }> {
  if (!uri) {
    return { content: null, mime: 'text/plain' };
  }

  const filePath = assertWithinHarnessRoot(join(workspaceRoot, uri), harnessRoot);

  try {
    const content = await readFile(filePath, 'utf8');
    const mime = type === 'json' ? 'application/json' : type === 'markdown' ? 'text/markdown' : 'text/plain';
    return { content, mime };
  } catch {
    return { content: null, mime: 'text/plain' };
  }
}

async function collectArtifacts(): Promise<ExecutionArtifact[]> {
  const executions = await listExecutions();
  const artifacts: ExecutionArtifact[] = [];

  for (const execution of executions) {
    const detail = await getExecutionDetail(execution.id);
    if (!detail) {
      continue;
    }
    const viewModel = buildExecutionViewModel(detail);
    artifacts.push(...viewModel.artifacts);
  }

  return artifacts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function buildVersionHistory(target: ExecutionArtifact, allArtifacts: ExecutionArtifact[]): ArtifactVersion[] {
  const key = `${target.name}::${target.uri ?? ''}`;
  const related = allArtifacts
    .filter((artifact) => `${artifact.name}::${artifact.uri ?? ''}` === key)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return related.map((artifact, index) => ({
    version: String(index + 1),
    artifactId: artifact.id,
    executionId: artifact.executionId,
    createdAt: artifact.createdAt,
    uri: artifact.uri,
  }));
}

export async function listArtifactSummaries(): Promise<ArtifactSummary[]> {
  return Sentry.startSpan({ name: 'listArtifactSummaries', op: 'fs.read' }, async () => {
    const artifacts = await collectArtifacts();
    return artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      version: artifact.version,
      createdAt: artifact.createdAt,
      executionId: artifact.executionId,
    }));
  });
}

export async function getArtifactDetail(artifactId: string): Promise<ArtifactDetail | null> {
  return Sentry.startSpan(
    { name: 'getArtifactDetail', op: 'fs.read', attributes: { artifactId } },
    async () => {
      const binding = await resolveHarnessBinding();
      const allArtifacts = await collectArtifacts();
      const artifact = allArtifacts.find((entry) => entry.id === artifactId);

      if (!artifact) {
        return null;
      }

      const versions = buildVersionHistory(artifact, allArtifacts);
      const currentVersion = versions.find((entry) => entry.artifactId === artifactId)?.version ?? artifact.version;
      const preview = await readArtifactPreview(
        artifact.uri,
        artifact.type,
        binding.workspaceRoot,
        binding.harnessRoot,
      );

      return {
        id: artifact.id,
        name: artifact.name,
        type: artifact.type,
        version: currentVersion,
        createdAt: artifact.createdAt,
        executionId: artifact.executionId,
        nodeId: artifact.nodeId,
        uri: artifact.uri,
        previewContent: preview.content,
        previewMime: preview.mime,
        versions: versions.reverse(),
      };
    },
  );
}
