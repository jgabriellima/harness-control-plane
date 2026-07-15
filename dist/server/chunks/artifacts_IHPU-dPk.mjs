import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as Sentry from '@sentry/astro';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { b as buildExecutionViewModel } from './execution-events_C-qnIkOA.mjs';
import { l as listExecutions, g as getExecutionDetail } from './harness-reader_xurzrbMU.mjs';

function assertWithinHarnessRoot(filePath, harnessRoot) {
  const resolved = resolve(filePath);
  if (!resolved.startsWith(harnessRoot)) {
    throw new Error("Artifact path is outside harness root");
  }
  return resolved;
}
async function readArtifactPreview(uri, type, workspaceRoot, harnessRoot) {
  if (!uri) {
    return { content: null, mime: "text/plain" };
  }
  const filePath = assertWithinHarnessRoot(join(workspaceRoot, uri), harnessRoot);
  try {
    const content = await readFile(filePath, "utf8");
    const mime = type === "json" ? "application/json" : type === "markdown" ? "text/markdown" : "text/plain";
    return { content, mime };
  } catch {
    return { content: null, mime: "text/plain" };
  }
}
async function collectArtifacts(workspaceRoot) {
  const executions = await listExecutions(workspaceRoot);
  const artifacts = [];
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
function buildVersionHistory(target, allArtifacts) {
  const key = `${target.name}::${target.uri ?? ""}`;
  const related = allArtifacts.filter((artifact) => `${artifact.name}::${artifact.uri ?? ""}` === key).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return related.map((artifact, index) => ({
    version: String(index + 1),
    artifactId: artifact.id,
    executionId: artifact.executionId,
    createdAt: artifact.createdAt,
    uri: artifact.uri
  }));
}
async function listArtifactSummaries(workspaceRoot) {
  return Sentry.startSpan({ name: "listArtifactSummaries", op: "fs.read" }, async () => {
    const artifacts = await collectArtifacts(workspaceRoot);
    return artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      version: artifact.version,
      createdAt: artifact.createdAt,
      executionId: artifact.executionId
    }));
  });
}
async function getArtifactDetail(artifactId, workspaceRoot) {
  return Sentry.startSpan(
    { name: "getArtifactDetail", op: "fs.read", attributes: { artifactId } },
    async () => {
      const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
      const allArtifacts = await collectArtifacts(workspaceRoot);
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
        binding.harnessRoot
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
        versions: versions.reverse()
      };
    }
  );
}

export { getArtifactDetail as g, listArtifactSummaries as l };
