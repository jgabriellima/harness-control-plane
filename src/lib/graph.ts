import type { WorkflowEdge, WorkflowNodeSpec } from './types/workflow';
import type { NodeStatus } from './types/run';

export type NodePresentationKind =
  | 'trigger'
  | 'cognitive'
  | 'gate'
  | 'integration'
  | 'subflow'
  | 'deterministic';

export interface GraphNodeLayout {
  id: string;
  label: string;
  kind: NodePresentationKind;
  hasGate: boolean;
  status: NodeStatus;
  layer: number;
  indexInLayer: number;
  x: number;
  y: number;
}

export interface GraphLayout {
  nodes: GraphNodeLayout[];
  edges: WorkflowEdge[];
  width: number;
  height: number;
}

const NODE_WIDTH = 168;
const NODE_HEIGHT = 72;
const LAYER_GAP = 96;
const NODE_GAP = 24;
const PADDING = 32;

function getInvokeType(node: WorkflowNodeSpec): string | undefined {
  const invoke = node.function?.invoke;
  if (typeof invoke !== 'object' || invoke === null) {
    return undefined;
  }
  const typedInvoke = invoke as { type?: string };
  return typedInvoke.type;
}

export function inferNodeKind(node: WorkflowNodeSpec): NodePresentationKind {
  const nodeId = node.id;
  if (nodeId.includes('trigger')) {
    return 'trigger';
  }
  if (nodeId.includes('validate') || nodeId.includes('gate')) {
    return 'gate';
  }
  if (
    nodeId.startsWith('provision-') ||
    nodeId.startsWith('sync-') ||
    nodeId.startsWith('link-')
  ) {
    return 'integration';
  }
  const invokeType = getInvokeType(node);
  if (invokeType === 'subprocess') {
    return nodeId.includes('subflow') ? 'subflow' : 'gate';
  }
  return 'cognitive';
}

export function nodeHasGate(node: WorkflowNodeSpec): boolean {
  return Boolean(node.postCondition);
}

function computeLayers(
  nodes: WorkflowNodeSpec[],
  edges: WorkflowEdge[],
): Map<string, number> {
  const nodeIds = nodes.map((node) => node.id);
  const layers = new Map<string, number>();

  for (const nodeId of nodeIds) {
    layers.set(nodeId, 0);
  }

  const incoming = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    incoming.set(nodeId, []);
  }
  for (const edge of edges) {
    incoming.get(edge.to)?.push(edge.from);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of nodeIds) {
      const deps = incoming.get(nodeId) ?? [];
      const maxDepLayer = deps.reduce((max, dep) => {
        const depLayer = layers.get(dep) ?? 0;
        return Math.max(max, depLayer);
      }, -1);
      const nextLayer = deps.length === 0 ? 0 : maxDepLayer + 1;
      if ((layers.get(nodeId) ?? 0) < nextLayer) {
        layers.set(nodeId, nextLayer);
        changed = true;
      }
    }
  }

  return layers;
}

export function buildGraphLayout(
  nodes: WorkflowNodeSpec[],
  edges: WorkflowEdge[],
  nodeStatuses: Record<string, NodeStatus> = {},
): GraphLayout {
  const layers = computeLayers(nodes, edges);
  const layerBuckets = new Map<number, WorkflowNodeSpec[]>();

  for (const node of nodes) {
    const layer = layers.get(node.id) ?? 0;
    const bucket = layerBuckets.get(layer) ?? [];
    bucket.push(node);
    layerBuckets.set(layer, bucket);
  }

  const sortedLayers = [...layerBuckets.keys()].sort((left, right) => left - right);
  const layoutNodes: GraphNodeLayout[] = [];

  for (const layer of sortedLayers) {
    const bucket = layerBuckets.get(layer) ?? [];
    bucket.sort((left, right) => left.id.localeCompare(right.id));

    bucket.forEach((node, indexInLayer) => {
      layoutNodes.push({
        id: node.id,
        label: node.name ?? node.id,
        kind: inferNodeKind(node),
        hasGate: nodeHasGate(node),
        status: nodeStatuses[node.id] ?? 'pending',
        layer,
        indexInLayer,
        x: PADDING + indexInLayer * (NODE_WIDTH + NODE_GAP),
        y: PADDING + layer * (NODE_HEIGHT + LAYER_GAP),
      });
    });
  }

  const maxLayerWidth = sortedLayers.reduce((max, layer) => {
    const count = layerBuckets.get(layer)?.length ?? 0;
    const width = count * NODE_WIDTH + Math.max(0, count - 1) * NODE_GAP;
    return Math.max(max, width);
  }, 0);

  const maxLayer = sortedLayers.at(-1) ?? 0;

  return {
    nodes: layoutNodes,
    edges,
    width: PADDING * 2 + maxLayerWidth,
    height: PADDING * 2 + (maxLayer + 1) * NODE_HEIGHT + maxLayer * LAYER_GAP,
  };
}

export function statusBorderClass(status: NodeStatus): string {
  switch (status) {
    case 'running':
      return 'border-cyan-400 ring-2 ring-cyan-400/30';
    case 'completed':
      return 'border-emerald-500';
    case 'failed':
      return 'border-rose-500';
    case 'blocked':
      return 'border-amber-500';
    case 'skipped':
      return 'border-slate-600 opacity-60';
    case 'retry':
      return 'border-orange-400';
    default:
      return 'border-slate-600';
  }
}

export function statusBadgeClass(status: NodeStatus): string {
  switch (status) {
    case 'running':
      return 'bg-cyan-100 text-cyan-700';
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'failed':
      return 'bg-rose-100 text-rose-700';
    case 'blocked':
      return 'bg-amber-100 text-amber-700';
    case 'skipped':
      return 'bg-slate-100 text-slate-500';
    case 'retry':
      return 'bg-orange-100 text-orange-700';
    default:
      return 'bg-slate-100 text-slate-500';
  }
}

export function kindBadgeClass(kind: NodePresentationKind): string {
  switch (kind) {
    case 'trigger':
      return 'bg-emerald-100 text-emerald-700';
    case 'gate':
      return 'bg-amber-100 text-amber-700';
    case 'integration':
      return 'bg-sky-100 text-sky-700';
    case 'subflow':
      return 'bg-cyan-100 text-cyan-700';
    case 'deterministic':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function kindLegendLabel(kind: NodePresentationKind): string {
  switch (kind) {
    case 'trigger':
      return 'Trigger';
    case 'gate':
      return 'Gate';
    case 'integration':
      return 'Integration';
    case 'subflow':
      return 'Subflow';
    case 'deterministic':
      return 'Deterministic';
    default:
      return 'Cognitive';
  }
}

export function nodeSubtitle(node: WorkflowNodeSpec, kind: NodePresentationKind): string {
  const invoke = node.function?.invoke;
  const ref =
    typeof invoke === 'object' && invoke !== null && 'ref' in invoke
      ? String((invoke as { ref?: string }).ref ?? '')
      : '';
  if (kind === 'gate' && ref) {
    const gateId = ref.split(':').pop() ?? node.id;
    return `Gate: ${gateId}`;
  }
  if (kind === 'integration' && ref) {
    const label = ref.split(':').pop() ?? node.id;
    return `Integration: ${label.replace(/-/g, ' ')}`;
  }
  if (kind === 'cognitive' && ref) {
    const skill = ref.split(':').pop() ?? node.id;
    return `Skill: ${skill.replace(/-/g, ' ')}`;
  }
  return node.id;
}

export const graphMetrics = {
  nodeWidth: NODE_WIDTH,
  nodeHeight: NODE_HEIGHT,
};
