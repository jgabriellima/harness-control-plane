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

  return (
    <div
      className={`relative h-full min-h-0 ${
        paneDrop.isDragOver ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''
      }`}
      data-pane-drop-target={paneDrop.canAcceptDrop ? String(paneIndex) : undefined}
      onDragEnterCapture={paneDrop.onDragEnter}
      onDragLeaveCapture={paneDrop.onDragLeave}
      onDragOverCapture={paneDrop.onDragOver}
      onDropCapture={paneDrop.onDrop}
    >
      {paneConversationId ? (
        <ChatPane conversationId={paneConversationId} compact paneIndex={paneIndex} />
      ) : (
        <ChatPaneEmptySlot paneIndex={paneIndex} paneLabel={paneLabel} />
      )}
    </div>
  );
}
