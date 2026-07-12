'use client';

import React, { useMemo } from 'react';

import { ToolInspectorGroup } from '@/components/react/ToolInspector';
import { useSdkObservability, mergeToolCallsWithLiveMessages } from '@/hooks/useSdkObservability';
import { sdkToolCallToToolRecord } from '@/lib/sdk-tool-call-mapper';
import type { ChatMessage } from '@/lib/runtime-hub-types';

function isToolStatusRunning(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'running' || normalized === 'pending' || normalized === 'in_progress';
}

interface ComposerToolActivityProps {
  messages: ChatMessage[];
  streaming: boolean;
  agentId: string | null;
  projectId: string;
  conversationId: string;
  refreshRevision?: number;
}

export default function ComposerToolActivity({
  messages,
  agentId,
  projectId,
  conversationId,
  refreshRevision = 0,
}: ComposerToolActivityProps) {
  const observability = useSdkObservability({
    agentId,
    projectId,
    conversationId,
    refreshRevision,
  });

  const toolCalls = useMemo(
    () => mergeToolCallsWithLiveMessages(observability.toolCalls, messages),
    [messages, observability.toolCalls],
  );

  const defaultCollapsed = true;
  const groupTimestamp = toolCalls.find((call) => call.recordedAt)?.recordedAt;

  const activeToolId = useMemo(() => {
    const running = toolCalls.find((call) => isToolStatusRunning(call.status));
    return running?.callId ?? toolCalls[0]?.callId;
  }, [toolCalls]);

  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <div className="mb-2" data-testid="chat-pane-tool-activity">
      <ToolInspectorGroup
        groupRecordedAt={groupTimestamp}
        tools={toolCalls.map((call) => ({
          id: call.callId,
          streaming: isToolStatusRunning(call.status),
          tool: sdkToolCallToToolRecord(call),
        }))}
        defaultCollapsed={defaultCollapsed}
        activeToolId={activeToolId}
      />
    </div>
  );
}
