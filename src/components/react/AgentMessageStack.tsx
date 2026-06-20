'use client';

import React, { useMemo } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Message, MessageContent } from '@/components/ui/message';

import { ToolInspectorGroup, type ToolRecord } from './ToolInspector';

type ChatMessageRole = 'user' | 'assistant' | 'system' | 'thinking' | 'tool';

export interface StackMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  streaming?: boolean;
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
  return {
    name: name.trim(),
    status: status.trim(),
  };
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
}: {
  messages: StackMessage[];
  onFileClick?: (filePath: string) => void;
}) {
  const segments = useMemo(() => buildSegments(messages), [messages]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
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
            <div key={message.id} className="pl-11" data-testid="chat-message-thinking">
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                reasoning{message.streaming ? ' · streaming' : ''}
              </p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-400">
                {message.content || (message.streaming ? '…' : '')}
              </p>
            </div>
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
          <Message key={message.id} data-testid={`chat-message-${message.role}`}>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{avatarLabel(message.role)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              {message.role === 'assistant' ? (
                <MessageContent
                  markdown={!message.streaming}
                  className="border border-gray-100 bg-white text-gray-900 shadow-sm"
                  onFileClick={onFileClick}
                >
                  {message.content || (message.streaming ? '…' : '')}
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
