import * as Sentry from '@sentry/astro';
import { e as composioConnectAvailable } from './composio-auth-config_B4-JkaML.mjs';
import { f as formatStatusLabel } from './execution-events_C-qnIkOA.mjs';
import { l as listExecutions, b as loadReadinessSnapshot, d as loadScheduleRegistry } from './harness-reader_xurzrbMU.mjs';

function needsAttention(status) {
  return status === "failed" || status === "blocked" || status === "paused";
}
function isQueued(status) {
  return status === "pending" || status === "queued";
}
function executionHref(executionId) {
  return `/execution/${encodeURIComponent(executionId)}`;
}
function toWidgetItem(id, label, status, timestamp) {
  return {
    id,
    label,
    status,
    statusLabel: formatStatusLabel(status),
    href: executionHref(id),
    timestamp
  };
}
function scheduleEntryLabel(entry) {
  if (entry.title?.trim()) {
    return entry.title.trim();
  }
  if (entry.description?.trim()) {
    return entry.description.trim().slice(0, 56);
  }
  return entry.workflowId;
}
function toScheduleJobItem(entry) {
  return {
    id: `schedule-${entry.id}`,
    label: scheduleEntryLabel(entry),
    status: null,
    statusLabel: "Next run",
    href: "/scheduled",
    timestamp: entry.nextRunAt
  };
}
function compareNextRunAt(left, right) {
  const leftTime = left.nextRunAt ? new Date(left.nextRunAt).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right.nextRunAt ? new Date(right.nextRunAt).getTime() : Number.POSITIVE_INFINITY;
  return leftTime - rightTime;
}
async function collectContextWidgets() {
  return Sentry.startSpan({ name: "collectContextWidgets", op: "fs.read" }, async () => {
    const [executions, readiness, scheduleRegistry] = await Promise.all([
      listExecutions(),
      loadReadinessSnapshot(),
      loadScheduleRegistry()
    ]);
    const attention = executions.filter((execution) => needsAttention(execution.status)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 5).map(
      (execution) => toWidgetItem(execution.id, execution.intent, execution.status, execution.updatedAt)
    );
    const scheduledJobs = (scheduleRegistry?.spec.entries ?? []).filter(
      (entry) => entry.trigger.type === "schedule" && entry.enabled && entry.nextRunAt != null
    ).sort(compareNextRunAt).slice(0, 5).map(toScheduleJobItem);
    const queuedExecutions = executions.filter((execution) => isQueued(execution.status)).sort((left, right) => right.recordedAt.localeCompare(left.recordedAt)).slice(0, 5).map(
      (execution) => toWidgetItem(execution.id, execution.intent, execution.status, execution.recordedAt)
    );
    const jobs = scheduledJobs.length > 0 ? scheduledJobs : queuedExecutions;
    const activity = [...executions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8).map(
      (execution) => toWidgetItem(execution.id, execution.intent, execution.status, execution.updatedAt)
    );
    const slots = readiness?.slots ?? [];
    const readySlots = slots.filter((slot) => slot.ready).length;
    const healthSlots = slots.map((slot) => ({
      ...slot,
      connectAvailable: !slot.ready && composioConnectAvailable(slot.provider)
    }));
    return {
      attention,
      jobs,
      activity,
      health: {
        overall: readiness?.overall ?? null,
        readySlots,
        totalSlots: slots.length,
        slots: healthSlots
      },
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  });
}

export { collectContextWidgets as c };
