'use client';

import React from 'react';

import ChatPane from './ChatPane';
import ChatPaneEmptySlot from './ChatPaneEmptySlot';
import { useConversationPaneDrop } from '@/hooks/useConversationPaneDrop';

interface ChatPaneSlotProps {
  paneIndex: number;
  paneConversationId: string;
  paneLabel: string;
}

export default function ChatPaneSlot({
  paneIndex,
  paneConversationId,
  paneLabel,
}: ChatPaneSlotProps) {
  const paneDrop = useConversationPaneDrop(paneIndex);
  const showDropOverlay = paneDrop.canAcceptDrop && (paneDrop.isDragSessionActive || paneDrop.isDragOver);

  return (
    <div
      className={`relative h-full min-h-0 ${
        paneDrop.isDragOver ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''
      }`}
      data-pane-drop-target={paneDrop.canAcceptDrop ? String(paneIndex) : undefined}
    >
      {paneConversationId ? (
        <ChatPane conversationId={paneConversationId} compact paneIndex={paneIndex} />
      ) : (
        <ChatPaneEmptySlot paneIndex={paneIndex} paneLabel={paneLabel} />
      )}
      {showDropOverlay ? (
        <div
          className="absolute inset-0 z-50"
          data-testid={`chat-pane-drop-overlay-${paneIndex}`}
          onDragEnter={paneDrop.onDragEnter}
          onDragLeave={paneDrop.onDragLeave}
          onDragOver={paneDrop.onDragOver}
          onDrop={paneDrop.onDrop}
        />
      ) : null}
    </div>
  );
}
