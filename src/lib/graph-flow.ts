import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';

import {
  buildGraphLayout,
  inferNodeKind,
  nodeHasGate,
  nodeSubtitle,
  type GraphNodeLayout,
  type NodePresentationKind,
} from './graph';
import type { NodeStatus } from './types/run';
import type { WorkflowEdge, WorkflowNodeSpec } from './types/workflow';

export const FLOW_NODE_WIDTH = 200;
export const FLOW_NODE_HEIGHT = 88;

export interface WorkflowFlowNodeData extends Record<string, unknown> {
  label: string;
  subtitle: string;
  kind: NodePresentationKind;
  hasGate: boolean;
  status: NodeStatus;
}

export function toReactFlowGraph(
  nodes: WorkflowNodeSpec[],
  edges: WorkflowEdge[],
  nodeStatuses: Record<string, NodeStatus>,
): { nodes: Node<WorkflowFlowNodeData>[]; edges: Edge[] } {
  const layout = buildGraphLayout(nodes, edges, nodeStatuses);
  const positions = layoutWithDagre(layout.nodes, edges);

  const flowNodes: Node<WorkflowFlowNodeData>[] = layout.nodes.map((node) => {
    const spec = nodes.find((entry) => entry.id === node.id);
    const kind = spec ? inferNodeKind(spec) : node.kind;
    const position = positions.get(node.id) ?? { x: node.x, y: node.y };

    return {
      id: node.id,
      type: 'workflowNode',
      position,
      data: {
        label: node.label,
        subtitle: spec ? nodeSubtitle(spec, kind) : node.id,
        kind,
        hasGate: node.hasGate,
        status: node.status,
      },
    };
  });

  const flowEdges: Edge[] = edges.map((edge) => ({
    id: `${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
    animated: nodeStatuses[edge.to] === 'running',
    style: { stroke: '#94a3b8', strokeWidth: 2 },
    data: { edgeTestId: `${edge.from}->${edge.to}` },
  }));

  return { nodes: flowNodes, edges: flowEdges };
}

function layoutWithDagre(
  nodes: GraphNodeLayout[],
  edges: WorkflowEdge[],
): Map<string, { x: number; y: number }> {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'TB', nodesep: 48, ranksep: 72, marginx: 24, marginy: 24 });

  for (const node of nodes) {
    graph.setNode(node.id, { width: FLOW_NODE_WIDTH, height: FLOW_NODE_HEIGHT });
  }

  for (const edge of edges) {
    graph.setEdge(edge.from, edge.to);
  }

  dagre.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const dagreNode = graph.node(node.id);
    if (!dagreNode) {
      positions.set(node.id, { x: node.x, y: node.y });
      continue;
    }
    positions.set(node.id, {
      x: dagreNode.x - FLOW_NODE_WIDTH / 2,
      y: dagreNode.y - FLOW_NODE_HEIGHT / 2,
    });
  }

  return positions;
}

export function presentationKindsInGraph(nodes: WorkflowNodeSpec[]): NodePresentationKind[] {
  const kinds = new Set<NodePresentationKind>();
  for (const node of nodes) {
    kinds.add(inferNodeKind(node));
    if (nodeHasGate(node)) {
      kinds.add('gate');
    }
  }
  return [...kinds].sort((left, right) => left.localeCompare(right));
}
