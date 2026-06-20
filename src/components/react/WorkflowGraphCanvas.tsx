import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { kindBadgeClass, kindLegendLabel, type NodePresentationKind } from '../../lib/graph';
import {
  presentationKindsInGraph,
  toReactFlowGraph,
  type WorkflowFlowNodeData,
} from '../../lib/graph-flow';
import type { NodeStatus } from '../../lib/types/run';
import type { WorkflowEdge, WorkflowNodeSpec } from '../../lib/types/workflow';
import WorkflowGraphEdge from './WorkflowGraphEdge';
import WorkflowGraphNode from './WorkflowGraphNode';

import '@xyflow/react/dist/style.css';

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowGraphNode,
};

const edgeTypes: EdgeTypes = {
  smoothstep: WorkflowGraphEdge,
};

const STATUS_LEGEND: ReadonlyArray<{ status: NodeStatus; label: string; dotClass: string }> = [
  { status: 'running', label: 'Running', dotClass: 'bg-cyan-500' },
  { status: 'pending', label: 'Waiting', dotClass: 'bg-amber-400' },
  { status: 'completed', label: 'Passed', dotClass: 'bg-emerald-500' },
  { status: 'failed', label: 'Failed', dotClass: 'bg-rose-500' },
  { status: 'skipped', label: 'Skipped', dotClass: 'border-2 border-slate-300 bg-white' },
];

interface WorkflowGraphCanvasProps {
  nodes: WorkflowNodeSpec[];
  edges: WorkflowEdge[];
  nodeStatuses?: Record<string, NodeStatus>;
  runId?: string | null;
  runStatus?: string | null;
}

function GraphZoomToolbar({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { fitView, setViewport, getViewport } = useReactFlow();

  const handleFit = useCallback(() => {
    void fitView({ padding: 0.2, duration: 200 });
  }, [fitView]);

  const handleResetZoom = useCallback(() => {
    const viewport = getViewport();
    void setViewport({ x: viewport.x, y: viewport.y, zoom: 1 }, { duration: 150 });
  }, [getViewport, setViewport]);

  const handleFullscreen = useCallback(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void element.requestFullscreen();
  }, [containerRef]);

  return (
    <div
      className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      data-testid="graph-zoom-controls"
    >
      <button
        type="button"
        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        onClick={handleFit}
      >
        Fit
      </button>
      <button
        type="button"
        className="border-l border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        onClick={handleResetZoom}
      >
        100%
      </button>
      <button
        type="button"
        aria-label="Fullscreen graph"
        className="border-l border-slate-200 px-2.5 py-1.5 text-slate-600 hover:bg-slate-50"
        onClick={handleFullscreen}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4"
            stroke="currentColor"
            strokeWidth="1.5"
            fillOpacity="0"
          />
        </svg>
      </button>
    </div>
  );
}

function GraphLegends({ kinds }: { kinds: NodePresentationKind[] }) {
  return (
    <aside
      className="w-44 shrink-0 border-r border-slate-200 bg-slate-50/80 p-3 text-xs"
      data-testid="graph-legends"
    >
      <p className="mb-2 font-semibold uppercase tracking-wide text-slate-500">Node types</p>
      <ul className="space-y-1.5">
        {kinds.map((kind) => (
          <li key={kind} className="flex items-center gap-2 text-slate-700">
            <span className={`h-2 w-2 rounded-sm ${kindBadgeClass(kind).split(' ')[0]}`} />
            <span>{kindLegendLabel(kind)}</span>
          </li>
        ))}
      </ul>
      <p className="mb-2 mt-4 font-semibold uppercase tracking-wide text-slate-500">Status</p>
      <ul className="space-y-1.5">
        {STATUS_LEGEND.map((entry) => (
          <li key={entry.status} className="flex items-center gap-2 text-slate-700">
            <span className={`h-2 w-2 rounded-full ${entry.dotClass}`} />
            <span>{entry.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function applyStatusClasses(element: HTMLElement, status: NodeStatus, classMap: Record<string, string>): void {
  const nextClasses = classMap[status] ?? classMap.pending;
  element.className = nextClasses;
}

function WorkflowGraphFlow({
  nodes,
  edges,
  nodeStatuses,
  runId,
  runStatus,
}: WorkflowGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initial = useMemo(
    () => toReactFlowGraph(nodes, edges, nodeStatuses ?? {}),
    [nodes, edges, nodeStatuses],
  );
  const [flowNodes, setFlowNodes] = useState<Node<WorkflowFlowNodeData>[]>(initial.nodes);
  const [flowEdges, setFlowEdges] = useState<Edge[]>(initial.edges);
  const kinds = useMemo(() => presentationKindsInGraph(nodes), [nodes]);

  useEffect(() => {
    const next = toReactFlowGraph(nodes, edges, nodeStatuses ?? {});
    setFlowNodes(next.nodes);
    setFlowEdges(next.edges);
  }, [nodes, edges, nodeStatuses]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    const terminalRunStatuses = new Set(['completed', 'failed', 'blocked']);
    let currentRunStatus = runStatus ?? 'pending';

    const statusBadgeClasses: Record<string, string> = {
      pending: 'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase bg-slate-100 text-slate-500',
      running: 'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase bg-cyan-100 text-cyan-700',
      completed: 'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase bg-emerald-100 text-emerald-700',
      failed: 'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase bg-rose-100 text-rose-700',
      blocked: 'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase bg-amber-100 text-amber-700',
      skipped: 'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase bg-slate-100 text-slate-500',
      retry: 'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase bg-orange-100 text-orange-700',
    };

    const statusBorderClasses: Record<string, string> = {
      pending: 'flex h-[88px] w-[200px] cursor-pointer flex-col rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-400 border-slate-600',
      running:
        'flex h-[88px] w-[200px] cursor-pointer flex-col rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-400 border-cyan-400 ring-2 ring-cyan-400/30',
      completed:
        'flex h-[88px] w-[200px] cursor-pointer flex-col rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-400 border-emerald-500',
      failed:
        'flex h-[88px] w-[200px] cursor-pointer flex-col rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-400 border-rose-500',
      blocked:
        'flex h-[88px] w-[200px] cursor-pointer flex-col rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-400 border-amber-500',
      skipped:
        'flex h-[88px] w-[200px] cursor-pointer flex-col rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-400 border-slate-600 opacity-60',
      retry:
        'flex h-[88px] w-[200px] cursor-pointer flex-col rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-400 border-orange-400',
    };

    async function refreshRunStatus(): Promise<void> {
      const response = await fetch(`/api/executions/${encodeURIComponent(runId)}`);
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        manifest?: { status?: string; nodes?: Record<string, { status?: NodeStatus }> };
      };
      currentRunStatus = payload?.manifest?.status ?? currentRunStatus;
      const manifestNodes = payload?.manifest?.nodes ?? {};

      for (const [nodeId, nodeState] of Object.entries(manifestNodes)) {
        const status = nodeState?.status ?? 'pending';
        const badge = document.querySelector(`[data-node-id="${nodeId}"] [data-status-badge]`);
        const nodeRoot = document.querySelector(`[data-node-id="${nodeId}"]`);

        if (badge instanceof HTMLElement) {
          badge.textContent = status;
          applyStatusClasses(badge, status, statusBadgeClasses);
        }

        if (nodeRoot instanceof HTMLElement) {
          applyStatusClasses(nodeRoot, status, statusBorderClasses);
        }
      }

      const runStatusBadge = document.querySelector('[data-run-status]');
      if (runStatusBadge instanceof HTMLElement) {
        runStatusBadge.textContent = currentRunStatus;
        runStatusBadge.setAttribute('data-run-status', currentRunStatus);
      }

      const hasRunningNode = Object.values(manifestNodes).some((node) => node?.status === 'running');
      if (terminalRunStatuses.has(currentRunStatus) && !hasRunningNode) {
        window.clearInterval(pollTimer);
      }
    }

    const pollTimer = window.setInterval(() => {
      void refreshRunStatus();
    }, 2000);

    return () => {
      window.clearInterval(pollTimer);
    };
  }, [runId, runStatus]);

  return (
    <section
      aria-label="Workflow execution graph"
      className="rounded-xl border border-slate-200 bg-white"
      data-testid="workflow-graph"
      data-run-id={runId ?? undefined}
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-900">Execution graph</h2>
        <p className="mt-1 text-sm text-slate-500">
          {nodes.length} node{nodes.length === 1 ? '' : 's'}
          {runId ? ` — run ${runId}` : ' — no active run'}
        </p>
      </div>

      <div className="flex min-h-[420px]" ref={containerRef}>
        <GraphLegends kinds={kinds} />
        <div
          className="relative min-h-[420px] flex-1"
          data-testid="workflow-graph-canvas"
        >
          <GraphZoomToolbar containerRef={containerRef} />
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            fitView
            minZoom={0.25}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background gap={16} size={1} color="#e2e8f0" />
          </ReactFlow>
        </div>
      </div>
    </section>
  );
}

export default function WorkflowGraphCanvas(props: WorkflowGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowGraphFlow {...props} />
    </ReactFlowProvider>
  );
}
