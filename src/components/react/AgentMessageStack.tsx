'use client';

import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Message, MessageContent } from '@/components/ui/message';
import type { AssistantMessagePart } from '@/lib/message-parts';
import type { UserContextBadge } from '@/lib/user-message-display';
import { formatUserMessageForDisplay } from '@/lib/user-message-display';
import { stripRedactedReasoningContent } from '@/lib/strip-redacted-content';
import { cn } from '@/lib/utils';

import ThinkingPanel from './ThinkingPanel';
import OpenUISurface from './OpenUISurface';
import UserContextBadgeRow from './UserContextBadgeRow';
import { StreamingPlaceholder } from './RuntimeActivityIndicator';
import { formatRecordedAt } from '@/lib/format-recorded-at';
import { splitOpenUIEnvelope } from '@/lib/openui-envelope';
import { createOpenUISurfacePart, createTextPart } from '@/lib/message-parts';

type ChatMessageRole = 'user' | 'assistant' | 'system' | 'thinking' | 'tool';

export interface StackMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  contextBadges?: UserContextBadge[];
  parts?: AssistantMessagePart[];
  streaming?: boolean;
  durationMs?: number;
  recordedAt?: string;
  toolInput?: string;
  toolOutput?: string;
  branchAnchorId?: string;
  branchVersionIndex?: number;
  branchVersionCount?: number;
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

function MessageActionButton({
  label,
  testId,
  onClick,
  disabled = false,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      className={cn(
        'inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-medium text-gray-600 transition-all duration-200 ease-out',
        disabled
          ? 'cursor-not-allowed opacity-30'
          : 'opacity-0 hover:bg-gray-50 hover:text-gray-700 active:scale-95 group-hover:opacity-100',
      )}
      onClick={onClick}
    >
      <span>{label}</span>
    </button>
  );
}

function MessageBranchNavigator({
  versionIndex,
  versionCount,
  onPrev,
  onNext,
  disabled,
}: {
  versionIndex: number;
  versionCount: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}) {
  if (versionCount <= 1) {
    return null;
  }

  const atStart = versionIndex <= 0;
  const atEnd = versionIndex >= versionCount - 1;

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1 py-0.5 text-[10px] font-medium text-gray-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
      data-testid="chat-message-branch-nav"
    >
      <button
        type="button"
        aria-label="Previous message version"
        data-testid="chat-message-branch-prev"
        disabled={disabled || atStart}
        className={cn(
          'rounded p-0.5 transition-colors',
          atStart || disabled ? 'cursor-not-allowed opacity-30' : 'hover:bg-gray-100 hover:text-gray-800',
        )}
        onClick={onPrev}
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span
        className="min-w-[2rem] text-center tabular-nums"
        data-testid="chat-message-branch-indicator"
      >
        {versionIndex + 1}/{versionCount}
      </span>
      <button
        type="button"
        aria-label="Next message version"
        data-testid="chat-message-branch-next"
        disabled={disabled || atEnd}
        className={cn(
          'rounded p-0.5 transition-colors',
          atEnd || disabled ? 'cursor-not-allowed opacity-30' : 'hover:bg-gray-100 hover:text-gray-800',
        )}
        onClick={onNext}
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

const COPY_FEEDBACK_MS = 2000;

function MessageCopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied'>('idle');
  const resetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setState('copied');
        if (resetTimeoutRef.current !== null) {
          window.clearTimeout(resetTimeoutRef.current);
        }
        resetTimeoutRef.current = window.setTimeout(() => {
          setState('idle');
          resetTimeoutRef.current = null;
        }, COPY_FEEDBACK_MS);
      }
    } catch {
      setState('idle');
    }
  }, [text]);

  const copied = state === 'copied';

  return (
    <button
      type="button"
      aria-label={copied ? 'Copied to clipboard' : 'Copy message'}
      data-testid="chat-message-copy"
      data-copy-state={state}
      className={cn(
        'inline-flex min-w-[3.5rem] items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-all duration-300 ease-out active:scale-95',
        copied
          ? 'scale-[1.02] bg-emerald-50 text-emerald-700 opacity-100 shadow-sm'
          : 'scale-100 text-gray-600 opacity-0 hover:bg-gray-50 hover:text-gray-700 group-hover:opacity-100',
      )}
      onClick={() => {
        void handleCopy();
      }}
    >
      {copied ? (
        <>
          <Check
            className="h-3 w-3 shrink-0 animate-[copy-check-in_0.35s_ease-out]"
            strokeWidth={2.5}
          />
          <span className="animate-[copy-text-in_0.25s_ease-out]">Copied</span>
        </>
      ) : (
        <span>Copy</span>
      )}
    </button>
  );
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

function resolveAssistantParts(message: StackMessage): AssistantMessagePart[] | undefined {
  if (
    message.streaming &&
    message.parts?.some((part) => part.type === 'openui')
  ) {
    return message.parts;
  }

  const textFromParts = message.parts
    ?.filter((part): part is Extract<AssistantMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n');

  const source = textFromParts && textFromParts.length > 0 ? textFromParts : message.content;

  const split = splitOpenUIEnvelope(source);
  if (!split.openuiSource && !split.openFence) {
    return message.parts;
  }

  const parts: AssistantMessagePart[] = [];
  if (split.text.length > 0) {
    parts.push(createTextPart(split.text));
  }

  parts.push(
    createOpenUISurfacePart(
      `surface-${message.id}`,
      split.openuiSource,
      split.openFence || message.streaming ? 'streaming' : 'completed',
    ),
  );

  return parts;
}

function resolveUserDisplay(message: StackMessage): { body: string; badges: UserContextBadge[] } {
  if (message.contextBadges?.length) {
    return { body: message.content, badges: message.contextBadges };
  }

  const display = formatUserMessageForDisplay(message.content);
  return { body: display.body, badges: display.badges };
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
  const parts = thinkingActive ? undefined : resolveAssistantParts(message);

  if (thinkingActive) {
    return (
      <MessageContent className="border border-gray-100 bg-white text-gray-900 shadow-sm">
        <StreamingPlaceholder />
      </MessageContent>
    );
  }

  if (parts?.length) {
    return (
      <div className="space-y-3">
        {parts.map((part, index) => {
          if (part.type === 'text') {
            return (
              <MessageContent
                key={`text-${index}`}
                markdown
                className="border border-gray-100 bg-white text-gray-900 shadow-sm"
                onFileClick={onFileClick}
                onLinkClick={onLinkClick}
              >
                {part.text}
              </MessageContent>
            );
          }

          return (
            <div
              key={part.id}
              className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm"
            >
              <OpenUISurface part={part} isStreaming={message.streaming} />
            </div>
          );
        })}
        {renderStreamingStatus(message, hasVisibleContent)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <MessageContent
        markdown
        className="border border-gray-100 bg-white text-gray-900 shadow-sm"
        onFileClick={onFileClick}
        onLinkClick={onLinkClick}
      >
        {hasVisibleContent ? visibleContent : null}
      </MessageContent>
      {renderStreamingStatus(message, hasVisibleContent)}
    </div>
  );
}

export default function AgentMessageStack({
  messages,
  onFileClick,
  onLinkClick,
  onEditMessage,
  onSwitchBranchVersion,
  branchNavigationDisabled = false,
}: {
  messages: StackMessage[];
  onFileClick?: (filePath: string) => void;
  onLinkClick?: (url: string) => void;
  streaming?: boolean;
  onEditMessage?: (messageId: string, content: string) => void;
  onSwitchBranchVersion?: (anchorId: string, direction: 'prev' | 'next') => void;
  branchNavigationDisabled?: boolean;
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
                  <MessageCopyButton text={assistantContent} />
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
        const userDisplay = message.role === 'user' ? resolveUserDisplay(message) : null;

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
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <MessageTimestamp value={message.recordedAt} />
                {message.role === 'user' ? (
                  <>
                    {message.branchAnchorId && onSwitchBranchVersion ? (
                      <MessageBranchNavigator
                        versionIndex={message.branchVersionIndex ?? 0}
                        versionCount={message.branchVersionCount ?? 1}
                        disabled={branchNavigationDisabled}
                        onPrev={() => onSwitchBranchVersion(message.branchAnchorId!, 'prev')}
                        onNext={() => onSwitchBranchVersion(message.branchAnchorId!, 'next')}
                      />
                    ) : null}
                    {onEditMessage && !branchNavigationDisabled ? (
                      <MessageActionButton
                        label="Edit"
                        testId="chat-message-edit"
                        onClick={() => onEditMessage(message.id, userDisplay?.body ?? visibleContent)}
                      />
                    ) : null}
                  </>
                ) : null}
                <MessageCopyButton text={userDisplay?.body ?? visibleContent} />
              </div>
              {message.role === 'assistant' ? (
                renderAssistantBody(message, visibleContent, onFileClick, onLinkClick)
              ) : (
                <MessageContent className="bg-gray-100 text-sm text-gray-900 shadow-sm">
                  {userDisplay ? (
                    <>
                      <UserContextBadgeRow badges={userDisplay.badges} />
                      {userDisplay.body}
                    </>
                  ) : (
                    visibleContent
                  )}
                </MessageContent>
              )}
            </div>
          </Message>
        );
      })}
    </div>
  );
}
