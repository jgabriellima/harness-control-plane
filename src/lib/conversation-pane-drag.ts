export const CONVERSATION_PANE_DRAG_MIME = 'application/x-jambu-conversation-id';

export const CONVERSATION_PANE_DRAG_START_EVENT = 'runtime:conversation-pane-dragstart';
export const CONVERSATION_PANE_DRAG_END_EVENT = 'runtime:conversation-pane-dragend';

let activeConversationDragId: string | null = null;
let globalDragEndListenerAttached = false;

function ensureGlobalDragEndListener(): void {
  if (typeof window === 'undefined' || globalDragEndListenerAttached) {
    return;
  }

  globalDragEndListenerAttached = true;
  window.addEventListener('dragend', () => {
    endConversationPaneDrag();
  });
}

export function isConversationPaneDragActive(): boolean {
  return activeConversationDragId !== null;
}

function dispatchConversationDragEvent(type: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(type));
}

export function beginConversationPaneDrag(conversationId: string, dataTransfer: DataTransfer): void {
  ensureGlobalDragEndListener();
  activeConversationDragId = conversationId;
  dataTransfer.setData(CONVERSATION_PANE_DRAG_MIME, conversationId);
  dataTransfer.setData('text/plain', conversationId);
  dataTransfer.effectAllowed = 'move';
  dispatchConversationDragEvent(CONVERSATION_PANE_DRAG_START_EVENT);
}

export function endConversationPaneDrag(): void {
  if (activeConversationDragId === null) {
    return;
  }

  activeConversationDragId = null;
  dispatchConversationDragEvent(CONVERSATION_PANE_DRAG_END_EVENT);
}

/** @deprecated Use beginConversationPaneDrag */
export function setConversationDragData(dataTransfer: DataTransfer, conversationId: string): void {
  beginConversationPaneDrag(conversationId, dataTransfer);
}

export function readConversationDragData(dataTransfer: DataTransfer): string | null {
  const fromMime = dataTransfer.getData(CONVERSATION_PANE_DRAG_MIME);
  if (fromMime) {
    return fromMime;
  }

  const plain = dataTransfer.getData('text/plain').trim();
  if (plain.length > 0) {
    return plain;
  }

  return activeConversationDragId;
}

export function isConversationDragEvent(dataTransfer: DataTransfer): boolean {
  if (isConversationPaneDragActive()) {
    return true;
  }

  const normalizedTypes = Array.from(dataTransfer.types).map((type) => type.toLowerCase());
  return (
    normalizedTypes.includes(CONVERSATION_PANE_DRAG_MIME.toLowerCase()) ||
    normalizedTypes.includes('text/plain')
  );
}
