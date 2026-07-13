'use client';

import React, { useMemo } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Message, MessageContent } from '@/components/ui/message';
import { stripRedactedReasoningContent } from '@/lib/strip-redacted-content';

import ThinkingPanel from './ThinkingPanel';
import { StreamingPlaceholder } from './RuntimeActivityIndicator';
import { formatRecordedAt } from '@/lib/format-recorded-at';

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
}

type RenderSegment =
  | { kind: 'single'; message: StackMessage }
  | { kind: 'turn'; assistant: StackMessage; thinking?: StackMessage };

function buildSegments(messages: StackMessage[]): RenderSegment[] {
  const filtered = messages.filter((message) => message.role !== 'tool');
  const segments: RenderSegment[] = [];

  for (let index = 0; index < filtered.length; index += 1) {
    const message = filtered[index];

    if (message.role === 'thinking') {
      const next = filtered[index + 1];
      if (next?.role === 'assistant') {
        segments.push({ kind: 'turn', thinking: message, assistant: next });
        index += 1;
        continue;
      }
      segments.push({ kind: 'single', message });
      continue;
    }

    if (message.role === 'assistant') {
      const previous = filtered[index - 1];
      if (previous?.role === 'thinking') {
        continue;
      }
      segments.push({ kind: 'turn', assistant: message });
      continue;
    }

    segments.push({ kind: 'single', message });
  }

  return segments;
}

function MessageTimestamp({
  value,
  className = 'text-gray-400',
}: {
  value: string | undefined;
  className?: string;
}) {
  const formatted = formatRecordedAt(value);
  if (!formatted) {
    return null;
  }
  return (
    <time
      dateTime={value}
      className={`mb-1 block text-[10px] ${className}`}
      data-testid="chat-message-timestamp"
    >
      {formatted}
    </time>
  );
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

function renderStreamingStatus(message: StackMessage, hasVisibleContent: boolean): React.ReactNode {
  if (!message.streaming) {
    return null;
  }

  if (!hasVisibleContent) {
    return <StreamingPlaceholder />;
  }

  return (
    <div className="mt-2">
      <StreamingPlaceholder />
    </div>
  );
}

function renderAssistantBody(
  message: StackMessage,
  visibleContent: string,
  onFileClick?: (filePath: string) => void,
  onLinkClick?: (url: string) => void,
  options?: { thinkingActive?: boolean },
): React.ReactNode {
  const thinkingActive = options?.thinkingActive ?? false;
  const hasVisibleContent = !thinkingActive && visibleContent.length > 0;

  if (thinkingActive) {
    return (
      <MessageContent className="border border-gray-100 bg-white text-gray-900 shadow-sm">
        <StreamingPlaceholder />
      </MessageContent>
    );
  }

  return (
    <MessageContent
      markdown
      className="border border-gray-100 bg-white text-gray-900 shadow-sm"
      onFileClick={onFileClick}
      onLinkClick={onLinkClick}
    >
      {hasVisibleContent ? visibleContent : null}
      {renderStreamingStatus(message, hasVisibleContent)}
    </MessageContent>
  );
}

export default function AgentMessageStack({
  messages,
  onFileClick,
  onLinkClick,
}: {
  messages: StackMessage[];
  onFileClick?: (filePath: string) => void;
  onLinkClick?: (url: string) => void;
  streaming?: boolean;
}) {
  const segments = useMemo(() => buildSegments(messages), [messages]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
      {segments.map((segment) => {
        if (segment.kind === 'turn') {
          const { assistant, thinking } = segment;
          const assistantContent = stripRedactedReasoningContent(assistant.content);
          const thinkingContent = thinking ? stripRedactedReasoningContent(thinking.content) : '';
          const thinkingActive = thinking?.streaming === true;

          return (
            <Message key={assistant.id} data-testid="chat-message-assistant" className="group">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{avatarLabel('assistant')}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <MessageTimestamp value={assistant.recordedAt} />
                  <button
                    type="button"
                    className="text-[10px] font-medium text-gray-600 opacity-0 transition-opacity hover:text-gray-700 group-hover:opacity-100"
                    onClick={() => {
                      void copyToClipboard(assistantContent);
                    }}
                  >
                    Copy
                  </button>
                </div>
                {renderAssistantBody(assistant, assistantContent, onFileClick, onLinkClick, {
                  thinkingActive,
                })}
                {thinking ? (
                  <div className="mt-2">
                    <ThinkingPanel
                      content={thinkingContent}
                      streaming={thinking.streaming}
                      durationMs={thinking.durationMs}
                    />
                  </div>
                ) : null}
              </div>
            </Message>
          );
        }

        const message = segment.message;
        const visibleContent =
          message.role === 'assistant' || message.role === 'thinking'
            ? stripRedactedReasoningContent(message.content)
            : message.content;

        if (message.role === 'thinking') {
          return (
            <div key={message.id}>
              <MessageTimestamp value={message.recordedAt} />
              <ThinkingPanel
                content={visibleContent}
                streaming={message.streaming}
                durationMs={message.durationMs}
              />
            </div>
          );
        }

        if (message.role === 'system') {
          return (
            <Message key={message.id} data-testid="chat-message-system">
              <MessageContent className="border border-amber-100 bg-amber-50 text-sm text-amber-900">
                <MessageTimestamp value={message.recordedAt} />
                {visibleContent}
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
              <div className="mb-1 flex items-center gap-2">
                <MessageTimestamp value={message.recordedAt} />
                <button
                  type="button"
                  className="text-[10px] font-medium text-gray-600 opacity-0 transition-opacity hover:text-gray-700 group-hover:opacity-100"
                  onClick={() => {
                    void copyToClipboard(visibleContent);
                  }}
                >
                  Copy
                </button>
              </div>
              {message.role === 'assistant' ? (
                renderAssistantBody(message, visibleContent, onFileClick, onLinkClick)
              ) : (
                <MessageContent className="bg-gray-100 text-sm text-gray-900 shadow-sm">
                  {visibleContent}
                </MessageContent>
              )}
            </div>
          </Message>
        );
      })}
    </div>
  );
}
