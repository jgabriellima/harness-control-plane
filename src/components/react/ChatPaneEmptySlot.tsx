'use client';

import React, { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import { DEFAULT_WORKSPACE_ID } from '@/lib/workspace-constants';

interface ChatPaneEmptySlotProps {
  paneIndex: number;
  paneLabel?: string;
}

export default function ChatPaneEmptySlot({ paneIndex, paneLabel }: ChatPaneEmptySlotProps) {
  const hub = useRuntimeHub();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = paneLabel ?? `Pane ${paneIndex + 1}`;

  async function handleStartSession(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const foregroundProjectId =
        hub.foregroundConversationId != null
          ? hub.getConversationState(hub.foregroundConversationId)?.projectId
          : undefined;
      await hub.startSessionInPane(paneIndex, foregroundProjectId ?? DEFAULT_WORKSPACE_ID);
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : 'Failed to start session';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-8 py-10 text-center"
      data-testid="chat-pane-picker"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-600">
        <MessageSquarePlus className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="max-w-xs space-y-1">
        <p className="text-sm font-medium text-gray-900">{label} is empty</p>
        <p className="text-xs leading-relaxed text-gray-500">
          Sidebar links focus the primary pane. Start a separate runtime session here, or pick a chat
          from the sidebar to fill the next open slot.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={loading}
        data-testid={`chat-pane-start-session-${paneIndex}`}
        onClick={() => {
          void handleStartSession();
        }}
      >
        {loading ? 'Starting session…' : 'New session here'}
      </Button>
      {error ? (
        <p className="max-w-xs text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
