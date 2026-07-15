function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function formatNodeLabel(nodeId) {
  return nodeId.split(/[-_]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function durationMs(startedAt, completedAt) {
  if (!startedAt) {
    return null;
  }
  const start = Date.parse(startedAt);
  const end = completedAt ? Date.parse(completedAt) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return Math.max(0, end - start);
}
function inferArtifactType(name, kind) {
  if (kind && kind !== "manifest") {
    return kind;
  }
  const lower = name.toLowerCase();
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".webp")) return "image";
  if (lower.endsWith(".csv") || lower.endsWith(".xlsx")) return "spreadsheet";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".py")) return "code";
  return "document";
}
function parseTraceNodes(trace) {
  const map = /* @__PURE__ */ new Map();
  if (!trace || !isRecord(trace.state)) {
    return map;
  }
  const nodesRaw = trace.state.nodes;
  if (!Array.isArray(nodesRaw)) {
    return map;
  }
  for (const nodeValue of nodesRaw) {
    if (!isRecord(nodeValue)) {
      continue;
    }
    const id = asString(nodeValue.id);
    if (!id) {
      continue;
    }
    const cognitiveStepsRaw = nodeValue.cognitiveSteps;
    const cognitiveSteps = Array.isArray(cognitiveStepsRaw) ? cognitiveStepsRaw.filter(isRecord).map((step) => ({
      label: asString(step.label),
      outcome: asString(step.outcome),
      confidence: typeof step.confidence === "number" ? step.confidence : void 0
    })).filter((step) => step.label.length > 0) : [];
    const artifactsRaw = nodeValue.artifacts;
    const artifacts = Array.isArray(artifactsRaw) ? artifactsRaw.filter(isRecord).map((artifact) => ({
      name: asString(artifact.name),
      uri: asString(artifact.uri),
      kind: typeof artifact.kind === "string" ? artifact.kind : void 0
    })).filter((artifact) => artifact.name.length > 0) : [];
    map.set(id, {
      id,
      status: asString(nodeValue.status, "pending"),
      startedAt: typeof nodeValue.startedAt === "string" ? nodeValue.startedAt : typeof nodeValue.started_at === "string" ? nodeValue.started_at : null,
      completedAt: typeof nodeValue.completedAt === "string" ? nodeValue.completedAt : typeof nodeValue.completed_at === "string" ? nodeValue.completed_at : null,
      objective: asString(nodeValue.objective, asString(nodeValue.label)),
      inputSummary: typeof nodeValue.inputSummary === "string" ? nodeValue.inputSummary : typeof nodeValue.input === "string" ? nodeValue.input : null,
      outputSummary: typeof nodeValue.outputSummary === "string" ? nodeValue.outputSummary : typeof nodeValue.output === "string" ? nodeValue.output : null,
      validationResult: typeof nodeValue.validationResult === "string" ? nodeValue.validationResult : typeof nodeValue.validation === "string" ? nodeValue.validation : null,
      cognitiveSteps,
      artifacts
    });
  }
  return map;
}
function mergeNodeStates(manifest, traceNodes) {
  const ids = /* @__PURE__ */ new Set([
    ...Object.keys(manifest.nodes),
    ...traceNodes.keys()
  ]);
  return [...ids].map((id) => {
    const manifestNode = manifest.nodes[id];
    const traceNode = traceNodes.get(id);
    return {
      id,
      status: traceNode?.status ?? manifestNode?.status ?? "pending",
      startedAt: traceNode?.startedAt ?? manifestNode?.startedAt ?? null,
      completedAt: traceNode?.completedAt ?? manifestNode?.completedAt ?? null
    };
  });
}
function sortNodesByTimeline(nodes) {
  return [...nodes].sort((left, right) => {
    const leftStart = left.startedAt ?? "";
    const rightStart = right.startedAt ?? "";
    if (leftStart && rightStart) {
      return leftStart.localeCompare(rightStart);
    }
    if (leftStart) return -1;
    if (rightStart) return 1;
    return left.id.localeCompare(right.id);
  });
}
function terminalEventType(status) {
  if (status === "completed") return "execution_completed";
  if (status === "failed") return "execution_failed";
  return null;
}
function gateLabel(status) {
  if (status === "blocked") return "Gate blocked execution";
  if (status === "failed") return "Gate validation failed";
  return "Gate validation passed";
}
function buildExecutionViewModel(detail) {
  const { manifest, trace } = detail;
  const traceNodes = parseTraceNodes(trace);
  const mergedNodes = mergeNodeStates(manifest, traceNodes);
  const orderedNodes = sortNodesByTimeline(mergedNodes);
  const events = [
    {
      id: `${detail.id}-started`,
      executionId: detail.id,
      timestamp: manifest.recordedAt,
      source: "harness",
      type: "execution_started",
      label: "Execution Started",
      detail: manifest.intent.trim() || manifest.workflowId
    }
  ];
  const artifacts = [];
  const nodeViews = [];
  for (const node of orderedNodes) {
    const traceNode = traceNodes.get(node.id);
    const label = formatNodeLabel(node.id);
    const objective = traceNode?.objective || label;
    const nodeArtifacts = (traceNode?.artifacts ?? []).map((artifact, index) => {
      const createdAt = node.completedAt ?? node.startedAt ?? manifest.updatedAt;
      const entry = {
        id: `${detail.id}-${node.id}-artifact-${index}`,
        name: artifact.name,
        type: inferArtifactType(artifact.name, artifact.kind),
        version: "1",
        createdAt,
        executionId: detail.id,
        uri: artifact.uri || void 0,
        nodeId: node.id
      };
      artifacts.push(entry);
      return entry;
    });
    nodeViews.push({
      id: node.id,
      label,
      objective,
      status: node.status,
      startedAt: node.startedAt,
      completedAt: node.completedAt,
      durationMs: durationMs(node.startedAt, node.completedAt),
      validationResult: traceNode?.validationResult ?? null,
      inputSummary: traceNode?.inputSummary ?? null,
      outputSummary: traceNode?.outputSummary ?? null,
      artifacts: nodeArtifacts
    });
    if (node.startedAt) {
      events.push({
        id: `${detail.id}-${node.id}-started`,
        executionId: detail.id,
        timestamp: node.startedAt,
        source: "harness",
        type: "node_started",
        label: "Node Started",
        detail: label,
        nodeId: node.id
      });
    }
    for (const [index, step] of (traceNode?.cognitiveSteps ?? []).entries()) {
      events.push({
        id: `${detail.id}-${node.id}-tool-${index}`,
        executionId: detail.id,
        timestamp: node.startedAt ?? manifest.updatedAt,
        source: "runtime",
        type: "tool_call",
        label: "Tool Call",
        detail: step.label,
        nodeId: node.id,
        payload: { outcome: step.outcome, confidence: step.confidence }
      });
      if (step.outcome) {
        events.push({
          id: `${detail.id}-${node.id}-tool-result-${index}`,
          executionId: detail.id,
          timestamp: node.completedAt ?? node.startedAt ?? manifest.updatedAt,
          source: "runtime",
          type: "tool_result",
          label: "Tool Result",
          detail: step.outcome,
          nodeId: node.id
        });
      }
    }
    if (node.status === "blocked" || node.status === "failed" || traceNode?.validationResult) {
      events.push({
        id: `${detail.id}-${node.id}-gate`,
        executionId: detail.id,
        timestamp: node.completedAt ?? node.startedAt ?? manifest.updatedAt,
        source: "gate",
        type: "gate_validation",
        label: "Gate Validation",
        detail: traceNode?.validationResult ?? gateLabel(node.status),
        nodeId: node.id
      });
    }
    for (const artifact of nodeArtifacts) {
      events.push({
        id: `${artifact.id}-event`,
        executionId: detail.id,
        timestamp: artifact.createdAt,
        source: "artifact",
        type: "artifact_created",
        label: "Artifact Created",
        detail: artifact.name,
        nodeId: node.id,
        payload: { type: artifact.type }
      });
    }
    if (node.completedAt && (node.status === "completed" || node.status === "skipped")) {
      events.push({
        id: `${detail.id}-${node.id}-completed`,
        executionId: detail.id,
        timestamp: node.completedAt,
        source: "harness",
        type: "node_completed",
        label: "Node Completed",
        detail: label,
        nodeId: node.id
      });
    }
  }
  const terminalType = terminalEventType(manifest.status);
  if (terminalType) {
    events.push({
      id: `${detail.id}-terminal`,
      executionId: detail.id,
      timestamp: manifest.updatedAt,
      source: "harness",
      type: terminalType,
      label: terminalType === "execution_completed" ? "Execution Completed" : "Execution Failed",
      detail: manifest.workflowId
    });
  }
  events.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const completedNodes = nodeViews.filter(
    (node) => node.status === "completed" || node.status === "skipped"
  ).length;
  const totalNodes = nodeViews.length;
  const percentComplete = totalNodes === 0 ? 0 : Math.round(completedNodes / totalNodes * 100);
  const activeNode = nodeViews.find((node) => node.status === "running" || node.status === "in_progress") ?? nodeViews.find((node) => node.status === "blocked" || node.status === "paused") ?? [...nodeViews].reverse().find((node) => node.status === "completed") ?? nodeViews[0] ?? null;
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const progress = {
    objective: manifest.intent.trim() || manifest.workflowId,
    currentNodeId: activeNode?.id ?? null,
    currentNodeLabel: activeNode?.label ?? null,
    currentActivity: latestEvent?.detail ?? latestEvent?.label ?? null,
    completedNodes,
    totalNodes,
    percentComplete
  };
  return {
    executionId: detail.id,
    status: manifest.status,
    startedAt: manifest.recordedAt,
    updatedAt: manifest.updatedAt,
    runtime: manifest.executionMode,
    profile: manifest.workflowId,
    workflowId: manifest.workflowId,
    events,
    nodes: nodeViews,
    artifacts,
    progress
  };
}
function formatElapsedTime(startedAt, updatedAt, status) {
  const start = Date.parse(startedAt);
  const end = status === "completed" || status === "failed" ? Date.parse(updatedAt) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "—";
  }
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1e3));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
function formatStatusLabel(status) {
  switch (status) {
    case "queued":
    case "pending":
      return "Queued";
    case "running":
    case "in_progress":
      return "Running";
    case "paused":
    case "blocked":
      return "Waiting";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}
function isActiveExecution(status) {
  return status === "running" || status === "in_progress" || status === "queued" || status === "pending" || status === "paused" || status === "blocked";
}
const RUNTIME_EVENT_LABELS = {
  execution_started: "Execution Started",
  node_started: "Node Started",
  node_completed: "Node Completed",
  tool_call: "Tool Call",
  tool_result: "Tool Result",
  artifact_created: "Artifact Created",
  gate_validation: "Gate Validation",
  execution_completed: "Execution Completed",
  execution_failed: "Execution Failed"
};
const SSE_RUNTIME_EVENT_TYPES = /* @__PURE__ */ new Set([
  "execution_started",
  "node_started",
  "node_completed",
  "gate_validation",
  "execution_completed",
  "execution_failed"
]);
function runtimeEventToWire(event) {
  const type = RUNTIME_EVENT_LABELS[event.type];
  if (!SSE_RUNTIME_EVENT_TYPES.has(event.type)) {
    throw new Error(`Event type ${event.type} is not SSE-eligible`);
  }
  return {
    execution_id: event.executionId,
    timestamp: event.timestamp,
    source: event.source,
    type,
    payload: {
      label: event.label,
      ...event.detail ? { detail: event.detail } : {},
      ...event.nodeId ? { node_id: event.nodeId } : {},
      ...event.payload ?? {}
    }
  };
}

export { RUNTIME_EVENT_LABELS as R, SSE_RUNTIME_EVENT_TYPES as S, formatElapsedTime as a, buildExecutionViewModel as b, formatStatusLabel as f, isActiveExecution as i, runtimeEventToWire as r };
