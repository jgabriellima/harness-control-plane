'use client';

import { useCallback, useState } from 'react';

import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import {
  isConversationDragEvent,
  readConversationDragData,
} from '@/lib/conversation-pane-drag';

interface ConversationPaneDropHandlers {
  isDragOver: boolean;
  canAcceptDrop: boolean;
  onDragEnter: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}

export function useConversationPaneDrop(paneIndex: number): ConversationPaneDropHandlers {
  const hub = useRuntimeHub();
  const [isDragOver, setIsDragOver] = useState(false);
  const canAcceptDrop = hub.layoutMode !== 'single';

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!canAcceptDrop || !isConversationDragEvent(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    },
    [canAcceptDrop],
  );

  const onDragEnter = useCallback(
    (event: React.DragEvent) => {
      if (!canAcceptDrop || !isConversationDragEvent(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      setIsDragOver(true);
    },
    [canAcceptDrop],
  );

  const onDragLeave = useCallback((event: React.DragEvent) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      setIsDragOver(false);

      if (!canAcceptDrop) {
        return;
      }

      const conversationId = readConversationDragData(event.dataTransfer);
      if (!conversationId) {
        return;
      }

      event.preventDefault();
      hub.navigateToConversation(conversationId, { paneIndex });
    },
    [canAcceptDrop, hub, paneIndex],
  );

  return {
    isDragOver,
    canAcceptDrop,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
  };
}
