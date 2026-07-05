'use client';

import React, { useEffect, useMemo } from 'react';

import { ToolInspectorGroup, type ToolRecord } from '@/components/react/ToolInspector';
import { normalizeInspectablePayload } from '@/lib/format-inspect';
import type { ChatMessage } from '@/lib/runtime-hub-types';

function resolveToolRecord(message: ChatMessage): ToolRecord {
  const [name = 'tool', status = 'running'] = message.content.split(' · ');
  let args: unknown;
  let result: unknown;

  if (message.toolInput) {
    args = normalizeInspectablePayload(message.toolInput);
  }

  if (message.toolOutput) {
    result = normalizeInspectablePayload(message.toolOutput);
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

function isRunningToolMessage(message: ChatMessage, streaming: boolean): boolean {
  if (streaming || message.streaming) {
    return true;
  }

  const status = message.content.split(' · ')[1]?.trim().toLowerCase() ?? '';
  return status === 'running' || status === 'pending' || status === 'in_progress';
}

interface ComposerToolActivityProps {
  messages: ChatMessage[];
  streaming: boolean;
}

export default function ComposerToolActivity({ messages, streaming }: ComposerToolActivityProps) {
  const tools = useMemo(() => currentTurnToolMessages(messages), [messages]);
  const groupTimestamp = tools.find((message) => message.recordedAt)?.recordedAt;
  const hasRunningTool = tools.some((message) => isRunningToolMessage(message, streaming));
  const defaultCollapsed = !hasRunningTool;

  const activeToolId = useMemo(() => {
    const running = tools.find((message) => isRunningToolMessage(message, streaming));
    return running?.id ?? tools[tools.length - 1]?.id;
  }, [streaming, tools]);

  useEffect(() => {
    if (defaultCollapsed || !activeToolId) {
      return;
    }

    const list = document.querySelector(
      '[data-testid="chat-pane-tool-activity"] [data-testid="tool-activity-list"]',
    );
    const row = list?.querySelector(`[data-tool-row-id="${activeToolId}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeToolId, defaultCollapsed, tools.length]);

  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="mb-2" data-testid="chat-pane-tool-activity">
      <ToolInspectorGroup
        groupRecordedAt={groupTimestamp}
        tools={tools.map((message) => ({
          id: message.id,
          tool: resolveToolRecord(message),
          streaming: isRunningToolMessage(message, streaming),
        }))}
        defaultCollapsed={defaultCollapsed}
        activeToolId={activeToolId}
      />
    </div>
  );
}
