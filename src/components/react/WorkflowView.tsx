import React, { useEffect, useMemo, useState } from 'react';

import type { NodeStatus } from '../../lib/types/run';
import type { WorkflowDetail } from '../../lib/types/workflow';
import WorkflowGraphCanvas from './WorkflowGraphCanvas';

interface WorkflowViewProps {
  workflowId: string;
}

interface WorkflowResponse extends WorkflowDetail {
  error?: string;
}

interface ExecutionResponse {
  manifest?: {
    status?: string;
    nodes?: Record<string, { status?: NodeStatus }>;
  };
  error?: string;
}

function readRunIdFromQuery(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const runId = params.get('runId');
  return runId?.trim() ? runId.trim() : null;
}

export default function WorkflowView({ workflowId }: WorkflowViewProps) {
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRunId(readRunIdFromQuery());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkflow(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`);
        const payload = (await response.json()) as WorkflowResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load workflow');
        }

        if (!cancelled) {
          setWorkflow(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load workflow';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadWorkflow();

    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  useEffect(() => {
    if (!runId) {
      setNodeStatuses({});
      setRunStatus(null);
      return;
    }

    let cancelled = false;

    async function loadRunOverlay(): Promise<void> {
      try {
        const response = await fetch(`/api/executions/${encodeURIComponent(runId)}`);
        const payload = (await response.json()) as ExecutionResponse;

        if (!response.ok || cancelled) {
          return;
        }

        const manifestNodes = payload.manifest?.nodes ?? {};
        const statuses: Record<string, NodeStatus> = {};

        for (const [nodeId, nodeState] of Object.entries(manifestNodes)) {
          statuses[nodeId] = nodeState?.status ?? 'pending';
        }

        setNodeStatuses(statuses);
        setRunStatus(payload.manifest?.status ?? null);
      } catch {
        if (!cancelled) {
          setNodeStatuses({});
          setRunStatus(null);
        }
      }
    }

    void loadRunOverlay();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  const header = useMemo(() => {
    if (!workflow) {
      return null;
    }

    return {
      name: workflow.metadata.name,
      version: workflow.metadata.version,
      command: workflow.metadata.command,
      nodeCount: workflow.nodes.length,
    };
  }, [workflow]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" data-testid="workflow-view-loading">
        <p className="text-sm text-gray-500">Loading workflow graph…</p>
      </div>
    );
  }

  if (error || !workflow || !header) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" data-testid="workflow-view-error">
        <p className="text-sm text-red-600" role="alert">
          {error ?? 'Workflow not found'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6" data-testid="workflow-view">
      <header className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Workflow</p>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">{header.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span className="font-mono text-xs text-gray-400">{workflow.id}</span>
          <span>v{header.version}</span>
          <span>{header.nodeCount} nodes</span>
          <span className="font-mono text-xs">{header.command}</span>
          {runId ? (
            <span className="rounded bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
              run {runId}
              {runStatus ? ` — ${runStatus}` : ''}
            </span>
          ) : null}
        </div>
      </header>

      <WorkflowGraphCanvas
        nodes={workflow.nodes}
        edges={workflow.edges}
        nodeStatuses={nodeStatuses}
        runId={runId}
        runStatus={runStatus}
      />
    </div>
  );
}
