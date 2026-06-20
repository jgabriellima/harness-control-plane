import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import React from 'react';

interface WorkflowEdgeData {
  edgeTestId?: string;
}

export default function WorkflowGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps) {
  const edgeData = data as WorkflowEdgeData | undefined;
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <g data-edge={edgeData?.edgeTestId ?? id}>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
    </g>
  );
}
