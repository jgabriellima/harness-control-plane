export const CONVERSATION_PANE_DRAG_MIME = 'application/x-jambu-conversation-id';

export function setConversationDragData(dataTransfer: DataTransfer, conversationId: string): void {
  dataTransfer.setData(CONVERSATION_PANE_DRAG_MIME, conversationId);
  dataTransfer.setData('text/plain', conversationId);
  dataTransfer.effectAllowed = 'move';
}

export function readConversationDragData(dataTransfer: DataTransfer): string | null {
  const fromMime = dataTransfer.getData(CONVERSATION_PANE_DRAG_MIME);
  if (fromMime) {
    return fromMime;
  }

  const plain = dataTransfer.getData('text/plain').trim();
  return plain.length > 0 ? plain : null;
}

export function isConversationDragEvent(dataTransfer: DataTransfer): boolean {
  return (
    dataTransfer.types.includes(CONVERSATION_PANE_DRAG_MIME) ||
    dataTransfer.types.includes('text/plain')
  );
}
