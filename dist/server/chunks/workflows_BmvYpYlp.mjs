import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as Sentry from '@sentry/astro';
import { parse } from 'yaml';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';

function isWorkflowFile(name) {
  return name.endsWith(".yaml") && !name.startsWith(".");
}
function assertWorkflowDocument(value, fileName) {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid workflow document in ${fileName}`);
  }
  const doc = value;
  if (!doc.metadata?.id || !doc.metadata.name || !doc.metadata.version || !doc.metadata.command) {
    throw new Error(`Missing workflow metadata in ${fileName}`);
  }
  if (!Array.isArray(doc.spec?.nodes)) {
    throw new Error(`Missing workflow nodes in ${fileName}`);
  }
  return doc;
}
function toSummary(document) {
  return {
    id: document.metadata.id,
    name: document.metadata.name,
    version: document.metadata.version,
    command: document.metadata.command
  };
}
function buildEdges(nodes) {
  const edges = [];
  for (const node of nodes) {
    for (const dependency of node.dependsOn ?? []) {
      edges.push({ from: dependency, to: node.id });
    }
  }
  return edges;
}
async function readWorkflowDocument(workflowsDir, fileName) {
  const filePath = join(workflowsDir, fileName);
  const contents = await readFile(filePath, "utf8");
  const parsed = parse(contents);
  return assertWorkflowDocument(parsed, fileName);
}
async function listWorkflowSummaries(workspaceRoot) {
  return Sentry.startSpan({ name: "listWorkflowSummaries", op: "fs.read" }, async () => {
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const entries = await readdir(binding.workflowsDir, { withFileTypes: true });
    const fileNames = entries.filter((entry) => entry.isFile() && isWorkflowFile(entry.name)).map((entry) => entry.name).sort();
    const summaries = await Promise.all(
      fileNames.map(async (fileName) => {
        const document = await readWorkflowDocument(binding.workflowsDir, fileName);
        return toSummary(document);
      })
    );
    return summaries.sort((left, right) => left.id.localeCompare(right.id));
  });
}
async function getWorkflowDetail(workflowId, workspaceRoot) {
  return Sentry.startSpan(
    { name: "getWorkflowDetail", op: "fs.read", attributes: { workflowId } },
    async () => {
      const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
      const filePath = join(binding.workflowsDir, `${workflowId}.yaml`);
      let document;
      try {
        const contents = await readFile(filePath, "utf8");
        document = assertWorkflowDocument(parse(contents), `${workflowId}.yaml`);
      } catch (error) {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
      if (document.metadata.id !== workflowId) {
        return null;
      }
      const nodes = document.spec.nodes;
      return {
        id: document.metadata.id,
        metadata: document.metadata,
        spec: document.spec,
        nodes,
        edges: buildEdges(nodes)
      };
    }
  );
}

export { getWorkflowDetail as g, listWorkflowSummaries as l };
