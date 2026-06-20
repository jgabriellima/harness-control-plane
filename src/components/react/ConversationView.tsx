import React, { useEffect, useState } from 'react';

import { formatStatusLabel } from '../../lib/execution-events';
import type { ConversationDetail, ExecutionStatus, ExecutionSummary } from '../../lib/harness-types';
import MessageComposer from './MessageComposer';

interface ConversationViewProps {
  conversationId: string;
}

interface ConversationDetailResponse extends ConversationDetail {
  error?: string;
}

function statusTone(status: ExecutionStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    case 'failed':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    case 'blocked':
    case 'paused':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    case 'running':
    case 'in_progress':
      return 'bg-violet-50 text-violet-700 ring-violet-600/20';
    default:
      return 'bg-gray-50 text-gray-600 ring-gray-500/20';
  }
}

function formatTimestamp(value: string): string {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ExecutionTimelineItem({ execution }: { execution: ExecutionSummary }) {
  const href = `/execution/${encodeURIComponent(execution.id)}`;

  return (
    <li>
      <a
        href={href}
        className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-violet-200 hover:bg-violet-50/40"
        data-testid={`execution-timeline-item-${execution.id}`}
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${statusTone(execution.status)}`}
            >
              {formatStatusLabel(execution.status)}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              {execution.workflowId}
            </span>
          </div>

          <p className="mt-1 truncate text-sm font-medium text-gray-900 group-hover:text-violet-800">
            {execution.intent || 'Untitled execution'}
          </p>

          <p className="mt-1 font-mono text-xs text-gray-500">{execution.id}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xs text-gray-500">{formatTimestamp(execution.updatedAt)}</p>
          <p className="mt-1 text-xs font-medium text-violet-600 opacity-0 transition-opacity group-hover:opacity-100">
            View execution
          </p>
        </div>
      </a>
    </li>
  );
}

export default function ConversationView({ conversationId }: ConversationViewProps) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadConversation(): Promise<void> {
      try {
        const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? 'Failed to load conversation');
        }

        const payload = (await response.json()) as ConversationDetailResponse;

        if (cancelled) {
          return;
        }

        setDetail(payload);
        setLoadError(null);
        setLoading(false);
      } catch (error) {
        if (!cancelled) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to load conversation';
          setLoadError(errorMessage);
          setLoading(false);
        }
      }
    }

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-16" data-testid="conversation-loading">
        <p className="text-sm text-gray-500">Loading conversation...</p>
      </div>
    );
  }

  if (loadError || !detail) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-16" data-testid="conversation-error">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-red-600">{loadError ?? 'Conversation not found'}</p>
          <p className="mt-2 font-mono text-xs text-gray-500">{conversationId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col" data-testid="conversation-view">
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-gray-900">{detail.title}</h1>
            <p className="mt-1 text-xs text-gray-500">
              Updated {formatTimestamp(detail.updatedAt)} · Project {detail.projectId}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Execution timeline
            </h2>
            <span className="text-xs text-gray-500">
              {detail.executions.length} execution{detail.executions.length === 1 ? '' : 's'}
            </span>
          </div>

          {detail.executions.length === 0 ? (
            <div
              className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center"
              data-testid="conversation-empty-timeline"
            >
              <p className="text-sm font-medium text-gray-700">No executions yet</p>
              <p className="mt-1 text-xs text-gray-500">
                Send a message below to start the first workflow run in this conversation.
              </p>
            </div>
          ) : (
            <ul className="space-y-3" data-testid="conversation-execution-timeline">
              {detail.executions.map((execution) => (
                <ExecutionTimelineItem key={execution.id} execution={execution} />
              ))}
            </ul>
          )}
        </div>
      </div>

      <MessageComposer
        value={message}
        onChange={setMessage}
        projectId={detail.projectId}
        conversationId={detail.id}
      />
    </div>
  );
}
