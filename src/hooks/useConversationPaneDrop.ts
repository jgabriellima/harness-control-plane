'use client';

import { useCallback, useEffect, useState } from 'react';

import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import {
  CONVERSATION_PANE_DRAG_END_EVENT,
  CONVERSATION_PANE_DRAG_START_EVENT,
  endConversationPaneDrag,
  isConversationDragEvent,
  isConversationPaneDragActive,
  readConversationDragData,
} from '@/lib/conversation-pane-drag';

interface ConversationPaneDropHandlers {
  isDragOver: boolean;
  isDragSessionActive: boolean;
  canAcceptDrop: boolean;
  onDragEnter: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}

export function useConversationPaneDrop(paneIndex: number): ConversationPaneDropHandlers {
  const hub = useRuntimeHub();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragSessionActive, setIsDragSessionActive] = useState(false);
  const canAcceptDrop = hub.layoutMode !== 'single';

  useEffect(() => {
    function handleDragStart(): void {
      setIsDragSessionActive(true);
    }

    function handleDragEnd(): void {
      setIsDragSessionActive(false);
      setIsDragOver(false);
    }

    window.addEventListener(CONVERSATION_PANE_DRAG_START_EVENT, handleDragStart);
    window.addEventListener(CONVERSATION_PANE_DRAG_END_EVENT, handleDragEnd);
    return () => {
      window.removeEventListener(CONVERSATION_PANE_DRAG_START_EVENT, handleDragStart);
      window.removeEventListener(CONVERSATION_PANE_DRAG_END_EVENT, handleDragEnd);
    };
  }, []);

  const acceptsConversationDrop = useCallback(
    (dataTransfer: DataTransfer) => {
      return canAcceptDrop && (isConversationDragEvent(dataTransfer) || isConversationPaneDragActive());
    },
    [canAcceptDrop],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!acceptsConversationDrop(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    },
    [acceptsConversationDrop],
  );

  const onDragEnter = useCallback(
    (event: React.DragEvent) => {
      if (!acceptsConversationDrop(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(true);
    },
    [acceptsConversationDrop],
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
        endConversationPaneDrag();
        return;
      }

      const conversationId = readConversationDragData(event.dataTransfer);
      endConversationPaneDrag();

      if (!conversationId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      hub.assignConversationToPane(paneIndex, conversationId);
    },
    [canAcceptDrop, hub, paneIndex],
  );

  return {
    isDragOver,
    isDragSessionActive,
    canAcceptDrop,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
  };
}
