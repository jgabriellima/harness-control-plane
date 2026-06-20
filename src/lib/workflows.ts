import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as Sentry from '@sentry/astro';
import { parse as parseYaml } from 'yaml';

import { resolveHarnessBinding } from './harness-binding';
import type {
  WorkflowDetail,
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNodeSpec,
  WorkflowSummary,
} from './types/workflow';

function isWorkflowFile(name: string): boolean {
  return name.endsWith('.yaml') && !name.startsWith('.');
}

function assertWorkflowDocument(value: unknown, fileName: string): WorkflowDocument {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Invalid workflow document in ${fileName}`);
  }

  const doc = value as WorkflowDocument;

  if (!doc.metadata?.id || !doc.metadata.name || !doc.metadata.version || !doc.metadata.command) {
    throw new Error(`Missing workflow metadata in ${fileName}`);
  }

  if (!Array.isArray(doc.spec?.nodes)) {
    throw new Error(`Missing workflow nodes in ${fileName}`);
  }

  return doc;
}

function toSummary(document: WorkflowDocument): WorkflowSummary {
  return {
    id: document.metadata.id,
    name: document.metadata.name,
    version: document.metadata.version,
    command: document.metadata.command,
  };
}

function buildEdges(nodes: WorkflowNodeSpec[]): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];

  for (const node of nodes) {
    for (const dependency of node.dependsOn ?? []) {
      edges.push({ from: dependency, to: node.id });
    }
  }

  return edges;
}

async function readWorkflowDocument(
  workflowsDir: string,
  fileName: string,
): Promise<WorkflowDocument> {
  const filePath = join(workflowsDir, fileName);
  const contents = await readFile(filePath, 'utf8');
  const parsed = parseYaml(contents);
  return assertWorkflowDocument(parsed, fileName);
}

export async function listWorkflowSummaries(): Promise<WorkflowSummary[]> {
  return Sentry.startSpan({ name: 'listWorkflowSummaries', op: 'fs.read' }, async () => {
    const binding = await resolveHarnessBinding();
    const entries = await readdir(binding.workflowsDir, { withFileTypes: true });
    const fileNames = entries
      .filter((entry) => entry.isFile() && isWorkflowFile(entry.name))
      .map((entry) => entry.name)
      .sort();

    const summaries = await Promise.all(
      fileNames.map(async (fileName) => {
        const document = await readWorkflowDocument(binding.workflowsDir, fileName);
        return toSummary(document);
      }),
    );

    return summaries.sort((left, right) => left.id.localeCompare(right.id));
  });
}

export async function getWorkflowDetail(workflowId: string): Promise<WorkflowDetail | null> {
  return Sentry.startSpan(
    { name: 'getWorkflowDetail', op: 'fs.read', attributes: { workflowId } },
    async () => {
      const binding = await resolveHarnessBinding();
      const filePath = join(binding.workflowsDir, `${workflowId}.yaml`);

      let document: WorkflowDocument;
      try {
        const contents = await readFile(filePath, 'utf8');
        document = assertWorkflowDocument(parseYaml(contents), `${workflowId}.yaml`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
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
        edges: buildEdges(nodes),
      };
    },
  );
}
