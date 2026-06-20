import { Handle, Position, type NodeProps } from '@xyflow/react';
import React, { useCallback } from 'react';

import {
  kindBadgeClass,
  kindLegendLabel,
  statusBadgeClass,
  statusBorderClass,
} from '../../lib/graph';
import type { WorkflowFlowNodeData } from '../../lib/graph-flow';

function iconColorClass(kind: WorkflowFlowNodeData['kind']): string {
  switch (kind) {
    case 'trigger':
      return 'text-emerald-600';
    case 'gate':
      return 'text-amber-600';
    case 'integration':
      return 'text-sky-600';
    case 'subflow':
      return 'text-cyan-600';
    case 'deterministic':
      return 'text-slate-600';
    default:
      return 'text-violet-600';
  }
}

function KindIcon({ kind }: { kind: WorkflowFlowNodeData['kind'] }) {
  const className = 'h-4 w-4 shrink-0';

  switch (kind) {
    case 'trigger':
      return (
        <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M4 2l10 6-10 6V2z" />
        </svg>
      );
    case 'gate':
      return (
        <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M8 1l7 7-7 7-7-7 7-7z" />
        </svg>
      );
    case 'integration':
      return (
        <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6 2h4v3h3v4h-3v3H6v-3H3V5h3V2zm1 1v2H4v2h3v2h2V7h3V5h-3V3H7z"
          />
        </svg>
      );
    case 'subflow':
      return (
        <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1" y="3" width="6" height="6" fill="currentColor" rx="1" />
          <rect x="9" y="7" width="6" height="6" fill="currentColor" rx="1" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M8 1l2.5 4.5H15l-3.5 3 1.5 5L8 11.5 3 13.5l1.5-5L1 5.5h4.5L8 1z" />
        </svg>
      );
  }
}

export default function WorkflowGraphNode({ id, data }: NodeProps) {
  const nodeData = data as WorkflowFlowNodeData;

  const handleSelect = useCallback(() => {
    document.dispatchEvent(
      new CustomEvent('workflow-node-select', {
        detail: { nodeId: id },
      }),
    );
  }, [id]);

  return (
    <div
      data-node-id={id}
      data-graph-node={id}
      role="button"
      tabIndex={0}
      aria-label={`Select node ${nodeData.label}`}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect();
        }
      }}
      className={`flex h-[88px] w-[200px] cursor-pointer flex-col rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-400 ${statusBorderClass(nodeData.status)}`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-slate-400 !bg-white" />
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 ${iconColorClass(nodeData.kind)}`}>
          <KindIcon kind={nodeData.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-900" title={nodeData.label}>
            {nodeData.label}
          </p>
          <p className="truncate text-[10px] text-slate-500" title={nodeData.subtitle}>
            {nodeData.subtitle}
          </p>
        </div>
        <span
          data-status-badge
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${statusBadgeClass(nodeData.status)}`}
        >
          {nodeData.status}
        </span>
      </div>
      <div className="mt-auto flex flex-wrap gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${kindBadgeClass(nodeData.kind)}`}>
          {kindLegendLabel(nodeData.kind)}
        </span>
        {nodeData.hasGate ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-700">
            gate
          </span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-slate-400 !bg-white" />
    </div>
  );
}
