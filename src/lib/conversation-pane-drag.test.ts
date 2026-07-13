import { describe, expect, it } from 'vitest';

import {
  CONVERSATION_PANE_DRAG_MIME,
  isConversationDragEvent,
  readConversationDragData,
  setConversationDragData,
} from './conversation-pane-drag';

function createDataTransferStub(): DataTransfer {
  const store = new Map<string, string>();
  return {
    types: [] as string[],
    effectAllowed: 'none',
    dropEffect: 'none',
    setData(type: string, value: string) {
      store.set(type, value);
      if (!this.types.includes(type)) {
        this.types.push(type);
      }
    },
    getData(type: string) {
      return store.get(type) ?? '';
    },
    clearData() {
      store.clear();
      this.types = [];
    },
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    setDragImage() {},
  } as DataTransfer;
}

describe('conversation-pane-drag', () => {
  it('round-trips conversation id through drag data', () => {
    const transfer = createDataTransferStub();
    setConversationDragData(transfer, 'conv-123');

    expect(transfer.getData(CONVERSATION_PANE_DRAG_MIME)).toBe('conv-123');
    expect(readConversationDragData(transfer)).toBe('conv-123');
    expect(isConversationDragEvent(transfer)).toBe(true);
  });
});
