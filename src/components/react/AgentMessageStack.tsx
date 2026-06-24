'use client';

import React, { useMemo } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Message, MessageContent } from '@/components/ui/message';

import RuntimeActivityIndicator, { StreamingPlaceholder } from './RuntimeActivityIndicator';
import ThinkingPanel from './ThinkingPanel';
import { ToolInspectorGroup, type ToolRecord } from './ToolInspector';
import type { RunActivityPhase } from '@/lib/runtime-hub-types';

type ChatMessageRole = 'user' | 'assistant' | 'system' | 'thinking' | 'tool';

export interface StackMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  streaming?: boolean;
  durationMs?: number;
  recordedAt?: string;
  toolInput?: string;
  toolOutput?: string;
  tool?: ToolRecord;
}

type RenderSegment =
  | { kind: 'single'; message: StackMessage }
  | { kind: 'tool-group'; messages: StackMessage[]; groupId: string };

function buildSegments(messages: StackMessage[]): RenderSegment[] {
  const segments: RenderSegment[] = [];
  let toolBuffer: StackMessage[] = [];

  function flushTools(): void {
    if (toolBuffer.length === 0) {
      return;
    }
    segments.push({
      kind: 'tool-group',
      messages: toolBuffer,
      groupId: toolBuffer[0]?.id ?? `tools-${segments.length}`,
    });
    toolBuffer = [];
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      toolBuffer.push(message);
      continue;
    }

    flushTools();
    segments.push({ kind: 'single', message });
  }

  flushTools();
  return segments;
}

function resolveToolRecord(message: StackMessage): ToolRecord {
  if (message.tool) {
    return message.tool;
  }

  const [name = 'tool', status = 'completed'] = message.content.split(' · ');
  let args: unknown;
  let result: unknown;
  if (message.toolInput) {
    try {
      args = JSON.parse(message.toolInput);
    } catch {
      args = message.toolInput;
    }
  }
  if (message.toolOutput) {
    try {
      result = JSON.parse(message.toolOutput);
    } catch {
      result = message.toolOutput;
    }
  }
  return {
    name: name.trim(),
    status: status.trim(),
    args,
    result,
  };
}

function formatRecordedAt(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}

function avatarLabel(role: ChatMessageRole): string {
  if (role === 'user') {
    return 'U';
  }
  if (role === 'thinking') {
    return 'R';
  }
  return 'A';
}

export default function AgentMessageStack({
  messages,
  onFileClick,
  showStreamingIndicator = false,
  runActivity = 'idle',
  toolActivity = [],
}: {
  messages: StackMessage[];
  onFileClick?: (filePath: string) => void;
  showStreamingIndicator?: boolean;
  runActivity?: RunActivityPhase;
  toolActivity?: string[];
}) {
  const segments = useMemo(() => buildSegments(messages), [messages]);
  const streamingAssistantEmpty = messages.some(
    (message) => message.role === 'assistant' && message.streaming && message.content.trim().length === 0,
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
      {showStreamingIndicator && streamingAssistantEmpty ? (
        <RuntimeActivityIndicator activity={runActivity} toolActivity={toolActivity} />
      ) : null}
      {segments.map((segment) => {
        if (segment.kind === 'tool-group') {
          return (
            <ToolInspectorGroup
              key={segment.groupId}
              tools={segment.messages.map((message) => ({
                id: message.id,
                tool: resolveToolRecord(message),
                streaming: message.streaming,
              }))}
              defaultCollapsed={false}
            />
          );
        }

        const message = segment.message;

        if (message.role === 'thinking') {
          return (
            <ThinkingPanel
              key={message.id}
              content={message.content}
              streaming={message.streaming}
              durationMs={message.durationMs}
            />
          );
        }

        if (message.role === 'system') {
          return (
            <Message key={message.id} data-testid="chat-message-system">
              <MessageContent className="border border-amber-100 bg-amber-50 text-sm text-amber-900">
                {message.content}
              </MessageContent>
            </Message>
          );
        }

        return (
          <Message key={message.id} data-testid={`chat-message-${message.role}`} className="group">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{avatarLabel(message.role)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              {formatRecordedAt(message.recordedAt) ? (
                <div className="mb-1 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-[10px] text-gray-400">{formatRecordedAt(message.recordedAt)}</span>
                  <button
                    type="button"
                    className="text-[10px] font-medium text-violet-600 hover:text-violet-700"
                    onClick={() => {
                      void copyToClipboard(message.content);
                    }}
                  >
                    Copy
                  </button>
                </div>
              ) : null}
              {message.role === 'assistant' ? (
                <MessageContent
                  markdown={!message.streaming}
                  className="border border-gray-100 bg-white text-gray-900 shadow-sm"
                  onFileClick={onFileClick}
                >
                  {message.content || (message.streaming ? <StreamingPlaceholder /> : '')}
                </MessageContent>
              ) : (
                <MessageContent className="bg-violet-600 text-sm text-white shadow-sm">
                  {message.content}
                </MessageContent>
              )}
            </div>
          </Message>
        );
      })}
    </div>
  );
}
