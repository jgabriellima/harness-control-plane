import * as Sentry from '@sentry/astro';

import { composioConnectAvailable } from './composio-auth-config';
import { formatStatusLabel } from './execution-events';
import { listExecutions, loadReadinessSnapshot, loadScheduleRegistry } from './harness-reader';
import type { ExecutionStatus, ReadinessSlot, ScheduleRegistryEntry } from './harness-types';

export interface ContextWidgetItem {
  id: string;
  label: string;
  status: ExecutionStatus | null;
  statusLabel: string | null;
  href: string | null;
  timestamp: string | null;
}

export interface ContextHealthSlot extends ReadinessSlot {
  connectAvailable: boolean;
}

export interface ContextHealthSnapshot {
  overall: string | null;
  readySlots: number;
  totalSlots: number;
  slots: ContextHealthSlot[];
}

export interface ContextWidgetsSnapshot {
  attention: ContextWidgetItem[];
  jobs: ContextWidgetItem[];
  activity: ContextWidgetItem[];
  health: ContextHealthSnapshot;
  generatedAt: string;
}

function needsAttention(status: ExecutionStatus): boolean {
  return status === 'failed' || status === 'blocked' || status === 'paused';
}

function isQueued(status: ExecutionStatus): boolean {
  return status === 'pending' || status === 'queued';
}

function executionHref(executionId: string): string {
  return `/execution/${encodeURIComponent(executionId)}`;
}

function toWidgetItem(
  id: string,
  label: string,
  status: ExecutionStatus,
  timestamp: string,
): ContextWidgetItem {
  return {
    id,
    label,
    status,
    statusLabel: formatStatusLabel(status),
    href: executionHref(id),
    timestamp,
  };
}

function scheduleEntryLabel(entry: ScheduleRegistryEntry): string {
  if (entry.title?.trim()) {
    return entry.title.trim();
  }
  if (entry.description?.trim()) {
    return entry.description.trim().slice(0, 56);
  }
  return entry.workflowId;
}

function toScheduleJobItem(entry: ScheduleRegistryEntry): ContextWidgetItem {
  return {
    id: `schedule-${entry.id}`,
    label: scheduleEntryLabel(entry),
    status: null,
    statusLabel: 'Next run',
    href: '/scheduled',
    timestamp: entry.nextRunAt,
  };
}

function compareNextRunAt(left: ScheduleRegistryEntry, right: ScheduleRegistryEntry): number {
  const leftTime = left.nextRunAt ? new Date(left.nextRunAt).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right.nextRunAt ? new Date(right.nextRunAt).getTime() : Number.POSITIVE_INFINITY;
  return leftTime - rightTime;
}

export async function collectContextWidgets(): Promise<ContextWidgetsSnapshot> {
  return Sentry.startSpan({ name: 'collectContextWidgets', op: 'fs.read' }, async () => {
    const [executions, readiness, scheduleRegistry] = await Promise.all([
      listExecutions(),
      loadReadinessSnapshot(),
      loadScheduleRegistry(),
    ]);

    const attention = executions
      .filter((execution) => needsAttention(execution.status))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5)
      .map((execution) =>
        toWidgetItem(execution.id, execution.intent, execution.status, execution.updatedAt),
      );

    const scheduledJobs = (scheduleRegistry?.spec.entries ?? [])
      .filter(
        (entry) =>
          entry.trigger.type === 'schedule' && entry.enabled && entry.nextRunAt != null,
      )
      .sort(compareNextRunAt)
      .slice(0, 5)
      .map(toScheduleJobItem);

    const queuedExecutions = executions
      .filter((execution) => isQueued(execution.status))
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
      .slice(0, 5)
      .map((execution) =>
        toWidgetItem(execution.id, execution.intent, execution.status, execution.recordedAt),
      );

    const jobs = scheduledJobs.length > 0 ? scheduledJobs : queuedExecutions;

    const activity = [...executions]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 8)
      .map((execution) =>
        toWidgetItem(execution.id, execution.intent, execution.status, execution.updatedAt),
      );

    const slots = readiness?.slots ?? [];
    const readySlots = slots.filter((slot) => slot.ready).length;
    const healthSlots: ContextHealthSlot[] = slots.map((slot) => ({
      ...slot,
      connectAvailable: !slot.ready && composioConnectAvailable(slot.provider),
    }));

    return {
      attention,
      jobs,
      activity,
      health: {
        overall: readiness?.overall ?? null,
        readySlots,
        totalSlots: slots.length,
        slots: healthSlots,
      },
      generatedAt: new Date().toISOString(),
    };
  });
}
