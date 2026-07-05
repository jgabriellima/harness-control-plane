'use client';

import React, { useMemo } from 'react';

import { ToolInspectorGroup, type ToolRecord } from '@/components/react/ToolInspector';
import type { ChatMessage } from '@/lib/runtime-hub-types';

function resolveToolRecord(message: ChatMessage): ToolRecord {
  const [name = 'tool', status = 'running'] = message.content.split(' · ');
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
    recordedAt: message.recordedAt,
  };
}

function currentTurnToolMessages(messages: ChatMessage[]): ChatMessage[] {
  const tools: ChatMessage[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user') {
      break;
    }
    if (message.role === 'tool') {
      tools.unshift(message);
    }
  }

  return tools;
}

interface ComposerToolActivityProps {
  messages: ChatMessage[];
  streaming: boolean;
}

export default function ComposerToolActivity({ messages, streaming }: ComposerToolActivityProps) {
  const tools = useMemo(() => currentTurnToolMessages(messages), [messages]);
  const groupTimestamp = tools.find((message) => message.recordedAt)?.recordedAt;

  if (!streaming || tools.length === 0) {
    return null;
  }

  return (
    <div className="mb-2" data-testid="chat-pane-tool-activity">
      <ToolInspectorGroup
        groupRecordedAt={groupTimestamp}
        tools={tools.map((message) => ({
          id: message.id,
          tool: resolveToolRecord(message),
          streaming: streaming || message.streaming,
        }))}
        defaultCollapsed={false}
      />
    </div>
  );
}
