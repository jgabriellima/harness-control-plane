import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import * as Sentry from '@sentry/astro';
import { b as buildExecutionViewModel } from './execution-events_C-qnIkOA.mjs';
import { l as listExecutions, b as loadReadinessSnapshot, g as getExecutionDetail } from './harness-reader_xurzrbMU.mjs';

function isTerminalStatus(status) {
  return status === "completed" || status === "failed" || status === "blocked";
}
function nodeDurationMs(startedAt, completedAt) {
  if (!startedAt || !completedAt) {
    return null;
  }
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return end - start;
}
async function executionDurationMs(executionId) {
  const detail = await getExecutionDetail(executionId);
  if (!detail) {
    return null;
  }
  const durations = [];
  for (const node of Object.values(detail.manifest.nodes)) {
    const duration = nodeDurationMs(node.startedAt, node.completedAt);
    if (duration !== null) {
      durations.push(duration);
    }
  }
  if (durations.length === 0) {
    return null;
  }
  return durations.reduce((sum, value) => sum + value, 0);
}
async function collectObservabilityMetrics() {
  return Sentry.startSpan({ name: "collectObservabilityMetrics", op: "fs.read" }, async () => {
    const executions = await listExecutions();
    const readiness = await loadReadinessSnapshot();
    let runningExecutions = 0;
    let queuedExecutions = 0;
    let failedExecutions = 0;
    let completedExecutions = 0;
    let blockedExecutions = 0;
    for (const execution of executions) {
      switch (execution.status) {
        case "running":
        case "in_progress":
          runningExecutions += 1;
          break;
        case "pending":
          queuedExecutions += 1;
          break;
        case "failed":
          failedExecutions += 1;
          break;
        case "completed":
          completedExecutions += 1;
          break;
        case "blocked":
        case "paused":
          blockedExecutions += 1;
          break;
        default:
          queuedExecutions += 1;
      }
    }
    const terminalExecutions = executions.filter((execution) => isTerminalStatus(execution.status));
    const durationSamples = await Promise.all(
      terminalExecutions.map((execution) => executionDurationMs(execution.id))
    );
    const validDurations = durationSamples.filter((value) => value !== null);
    const averageDurationMs = validDurations.length > 0 ? Math.round(validDurations.reduce((sum, value) => sum + value, 0) / validDurations.length) : null;
    let artifactCount = 0;
    for (const execution of terminalExecutions) {
      const detail = await getExecutionDetail(execution.id);
      if (!detail) {
        continue;
      }
      const viewModel = buildExecutionViewModel(detail);
      artifactCount += viewModel.artifacts.length;
    }
    const artifactGenerationRate = completedExecutions > 0 ? Number((artifactCount / completedExecutions).toFixed(2)) : 0;
    const recentExecutions = [...executions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8);
    return {
      runningExecutions,
      queuedExecutions,
      failedExecutions,
      completedExecutions,
      blockedExecutions,
      totalExecutions: executions.length,
      averageDurationMs,
      artifactGenerationRate,
      readinessOverall: readiness?.overall ?? null,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      recentExecutions
    };
  });
}

const GET = async () => {
  try {
    const metrics = await collectObservabilityMetrics();
    return jsonOk(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to collect observability metrics";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
