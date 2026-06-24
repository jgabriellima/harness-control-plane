import * as Sentry from '@sentry/astro';

import { composioConnectAvailable } from './composio-auth-config';
import { formatStatusLabel } from './execution-events';
import { listExecutions, loadReadinessSnapshot } from './harness-reader';
import type { ExecutionStatus, ReadinessSlot } from './harness-types';

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

export async function collectContextWidgets(): Promise<ContextWidgetsSnapshot> {
  return Sentry.startSpan({ name: 'collectContextWidgets', op: 'fs.read' }, async () => {
    const [executions, readiness] = await Promise.all([listExecutions(), loadReadinessSnapshot()]);

    const attention = executions
      .filter((execution) => needsAttention(execution.status))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5)
      .map((execution) =>
        toWidgetItem(execution.id, execution.intent, execution.status, execution.updatedAt),
      );

    const jobs = executions
      .filter((execution) => isQueued(execution.status))
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
      .slice(0, 5)
      .map((execution) =>
        toWidgetItem(execution.id, execution.intent, execution.status, execution.recordedAt),
      );

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
      connectAvailable: !slot.ready && composioConnectAvailable(slot.slotId),
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
