import React, { useId, useState } from 'react';

import { DEFAULT_WORKSPACE_ID } from '@/lib/workspace-constants';
import { isUnknownSlashCommand } from '../../lib/slash-command';
import { subscribeRuntimeStream } from '../../lib/sse-client';

interface ChatDispatchResponse {
  run_id: string;
  agent_id: string;
  stream_url: string;
}

interface ApiErrorResponse {
  error?: string;
}

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  projectId?: string;
  conversationId?: string;
  agentId?: string;
  knownCommands?: readonly string[];
  deepResearch?: boolean;
  integrationSlots?: string[];
  onSubmit?: (value: string) => void;
  onStreamEvent?: (event: { type: string; payload: Record<string, unknown> }) => void;
}

export default function MessageComposer({
  value,
  onChange,
  projectId = DEFAULT_WORKSPACE_ID,
  conversationId,
  agentId,
  knownCommands = [],
  deepResearch = false,
  integrationSlots = [],
  onSubmit,
  onStreamEvent,
}: MessageComposerProps) {
  const textareaId = useId();
  const emptyHintId = useId();
  const slashHintId = useId();
  const dispatchHintId = useId();

  const [emptyError, setEmptyError] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>(agentId);

  const showSlashHint = isUnknownSlashCommand(value, knownCommands);
  const sendDisabled = showSlashHint || isDispatching || projectId.trim().length === 0;

  async function dispatchChat(message: string): Promise<void> {
    const payload: Record<string, unknown> = {
      project_id: projectId,
      message,
      mode: deepResearch ? 'deep_research' : 'default',
    };

    if (conversationId) {
      payload.conversation_id = conversationId;
    }

    if (activeAgentId) {
      payload.agent_id = activeAgentId;
    }

    if (integrationSlots.length > 0) {
      payload.integration_slots = integrationSlots;
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as ChatDispatchResponse & ApiErrorResponse;

    if (!response.ok) {
      throw new Error(body.error ?? 'Failed to dispatch chat to runtime');
    }

    if (!body.stream_url || !body.agent_id) {
      throw new Error('Runtime dispatch did not return stream metadata');
    }

    setActiveAgentId(body.agent_id);

    await new Promise<void>((resolve, reject) => {
      const unsubscribe = subscribeRuntimeStream(body.stream_url, {
        onEvent: (event) => {
          onStreamEvent?.(event);
        },
        onError: (error) => {
          unsubscribe();
          reject(error);
        },
        onComplete: () => {
          unsubscribe();
          resolve();
        },
      });
    });
  }

  async function handleSubmit() {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setEmptyError(true);
      return;
    }

    if (isUnknownSlashCommand(trimmed, knownCommands)) {
      return;
    }

    setEmptyError(false);
    setDispatchError(null);
    onSubmit?.(trimmed);

    setIsDispatching(true);

    try {
      await dispatchChat(trimmed);
      onChange('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to dispatch chat to runtime';
      setDispatchError(message);
    } finally {
      setIsDispatching(false);
    }
  }

  function handleChange(nextValue: string) {
    if (emptyError && nextValue.trim().length > 0) {
      setEmptyError(false);
    }
    if (dispatchError) {
      setDispatchError(null);
    }
    onChange(nextValue);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4" data-testid="message-composer">
      <div className="mx-auto max-w-3xl rounded-2xl border-2 border-violet-200 bg-white p-4 shadow-sm">
        <label htmlFor={textareaId} className="sr-only">
          Message composer
        </label>
        <textarea
          id={textareaId}
          className="w-full resize-none border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          rows={2}
          placeholder="Ask the runtime or type '/' for harness commands..."
          aria-label="Message composer"
          aria-describedby={
            emptyError || showSlashHint || dispatchError
              ? [
                  emptyError ? emptyHintId : '',
                  showSlashHint ? slashHintId : '',
                  dispatchError ? dispatchHintId : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              : undefined
          }
          aria-invalid={emptyError || showSlashHint || Boolean(dispatchError)}
          value={value}
          disabled={isDispatching}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        {emptyError ? (
          <p id={emptyHintId} className="mt-1 text-xs text-red-600" role="alert">
            Message cannot be empty.
          </p>
        ) : null}

        {showSlashHint ? (
          <p id={slashHintId} className="mt-1 text-xs text-amber-600" role="status">
            Unknown command. Harness commands are loaded from `.cursor/commands/` on each request.
          </p>
        ) : null}

        {dispatchError ? (
          <p id={dispatchHintId} className="mt-1 text-xs text-red-600" role="alert">
            {dispatchError}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              disabled={isDispatching}
              aria-label="Upload file"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              Attach
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              disabled={isDispatching}
              aria-label="Active integrations"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
              Integrations
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg p-2 text-violet-500 hover:bg-violet-50"
              aria-label="Deep research mode"
              disabled={isDispatching}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l1.09 3.26L16 6.27l-2.91 2.12L14.18 12 12 9.77 9.82 12l1.09-3.61L8 6.27l2.91-.01L12 2z" />
              </svg>
            </button>
            <button
              type="button"
              data-testid="message-composer-send"
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={sendDisabled}
              aria-busy={isDispatching}
              onClick={() => {
                void handleSubmit();
              }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m22 2-7 20-4-9-9-4z" />
                <path d="M22 2 11 13" />
              </svg>
              {isDispatching ? 'Streaming…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
