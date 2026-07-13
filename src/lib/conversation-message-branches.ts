import type { ChatMessage, MessageBranchGroup, MessageBranchStore, MessageBranchVersion } from './runtime-hub-types';

export type { MessageBranchGroup, MessageBranchStore, MessageBranchVersion };

const BRANCH_STORAGE_PREFIX = 'runtime-message-branches:';

function cloneMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    contextBadges: message.contextBadges ? [...message.contextBadges] : undefined,
    parts: message.parts ? [...message.parts] : undefined,
  };
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(cloneMessage);
}

export function resolveBranchAnchorId(message: ChatMessage): string | null {
  if (message.role !== 'user') {
    return null;
  }
  return message.branchAnchorId ?? message.id;
}

export function findUserMessageIndex(messages: ChatMessage[], messageId: string): number {
  return messages.findIndex((message) => message.role === 'user' && message.id === messageId);
}

export function getBranchGroup(
  store: MessageBranchStore,
  anchorId: string,
): MessageBranchGroup | undefined {
  return store[anchorId];
}

export function getVersionCount(store: MessageBranchStore, anchorId: string): number {
  const group = store[anchorId];
  if (!group) {
    return 1;
  }
  return Math.max(1, group.versions.length);
}

export function getActiveVersionIndex(
  store: MessageBranchStore,
  anchorId: string,
  message: ChatMessage,
): number {
  const group = store[anchorId];
  if (group) {
    return group.activeVersionIndex;
  }
  return message.branchVersionIndex ?? 0;
}

function createVersionSnapshot(
  userMessage: ChatMessage,
  downstream: ChatMessage[],
): MessageBranchVersion {
  return {
    versionId: `version-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userMessage: cloneMessage(userMessage),
    downstream: cloneMessages(downstream),
    createdAt: new Date().toISOString(),
  };
}

function upsertVersion(
  group: MessageBranchGroup,
  snapshot: MessageBranchVersion,
  versionIndex: number,
): MessageBranchGroup {
  const versions = [...group.versions];
  if (versionIndex >= 0 && versionIndex < versions.length) {
    versions[versionIndex] = snapshot;
  } else {
    versions.push(snapshot);
  }
  return {
    ...group,
    versions,
  };
}

export function ensureBranchGroup(
  store: MessageBranchStore,
  anchorId: string,
  userMessage: ChatMessage,
  downstream: ChatMessage[],
): MessageBranchStore {
  if (store[anchorId]) {
    return store;
  }

  const snapshot = createVersionSnapshot(userMessage, downstream);
  return {
    ...store,
    [anchorId]: {
      anchorId,
      activeVersionIndex: 0,
      versions: [snapshot],
    },
  };
}

export function snapshotCurrentBranch(
  store: MessageBranchStore,
  messages: ChatMessage[],
  userMessageIndex: number,
): MessageBranchStore {
  const userMessage = messages[userMessageIndex];
  if (!userMessage || userMessage.role !== 'user') {
    return store;
  }

  const anchorId = resolveBranchAnchorId(userMessage);
  if (!anchorId) {
    return store;
  }

  const downstream = messages.slice(userMessageIndex + 1);
  const snapshot = createVersionSnapshot(userMessage, downstream);
  const versionIndex = getActiveVersionIndex(store, anchorId, userMessage);

  const existing = store[anchorId];
  if (!existing) {
    return {
      ...store,
      [anchorId]: {
        anchorId,
        activeVersionIndex: versionIndex,
        versions: [snapshot],
      },
    };
  }

  return {
    ...store,
    [anchorId]: upsertVersion(existing, snapshot, versionIndex),
  };
}

export interface PrepareEditBranchResult {
  store: MessageBranchStore;
  messages: ChatMessage[];
  anchorId: string;
}

export function prepareEditBranch(
  store: MessageBranchStore,
  messages: ChatMessage[],
  messageId: string,
  editedContent: string,
): PrepareEditBranchResult | null {
  const userMessageIndex = findUserMessageIndex(messages, messageId);
  if (userMessageIndex === -1) {
    return null;
  }

  const currentUserMessage = messages[userMessageIndex];
  const anchorId = resolveBranchAnchorId(currentUserMessage);
  if (!anchorId) {
    return null;
  }

  const nextStore = snapshotCurrentBranch(store, messages, userMessageIndex);
  const group = nextStore[anchorId];
  const nextVersionIndex = group ? group.versions.length : 1;

  const turnStamp = Date.now();
  const newUserMessage: ChatMessage = {
    ...cloneMessage(currentUserMessage),
    id: `user-${turnStamp}`,
    content: editedContent,
    branchAnchorId: anchorId,
    branchVersionIndex: nextVersionIndex,
    recordedAt: new Date().toISOString(),
  };

  const truncated = messages.slice(0, userMessageIndex);

  const updatedGroup: MessageBranchGroup = {
    anchorId,
    activeVersionIndex: nextVersionIndex,
    versions: [
      ...(group?.versions ?? []),
      createVersionSnapshot(newUserMessage, []),
    ],
  };

  return {
    store: {
      ...nextStore,
      [anchorId]: updatedGroup,
    },
    messages: [...truncated, newUserMessage],
    anchorId,
  };
}

export interface SwitchBranchVersionResult {
  store: MessageBranchStore;
  messages: ChatMessage[];
}

export function switchBranchVersion(
  store: MessageBranchStore,
  messages: ChatMessage[],
  anchorId: string,
  direction: 'prev' | 'next',
): SwitchBranchVersionResult | null {
  const group = store[anchorId];
  if (!group || group.versions.length <= 1) {
    return null;
  }

  const userMessageIndex = messages.findIndex(
    (message) => message.role === 'user' && resolveBranchAnchorId(message) === anchorId,
  );
  if (userMessageIndex === -1) {
    return null;
  }

  const currentIndex = group.activeVersionIndex;
  const nextIndex =
    direction === 'prev'
      ? Math.max(0, currentIndex - 1)
      : Math.min(group.versions.length - 1, currentIndex + 1);

  if (nextIndex === currentIndex) {
    return null;
  }

  const currentUserMessage = messages[userMessageIndex];
  const currentDownstream = messages.slice(userMessageIndex + 1);
  const currentSnapshot = createVersionSnapshot(currentUserMessage, currentDownstream);
  const versionsWithCurrent = upsertVersion(group, currentSnapshot, currentIndex);

  const targetVersion = versionsWithCurrent.versions[nextIndex];
  if (!targetVersion) {
    return null;
  }

  const prefix = messages.slice(0, userMessageIndex);
  const restoredUser: ChatMessage = {
    ...cloneMessage(targetVersion.userMessage),
    branchAnchorId: anchorId,
    branchVersionIndex: nextIndex,
  };

  return {
    store: {
      ...store,
      [anchorId]: {
        ...versionsWithCurrent,
        activeVersionIndex: nextIndex,
      },
    },
    messages: [...prefix, restoredUser, ...cloneMessages(targetVersion.downstream)],
  };
}

export function annotateUserMessagesWithBranches(
  messages: ChatMessage[],
  store: MessageBranchStore,
): ChatMessage[] {
  return messages.map((message) => {
    if (message.role !== 'user') {
      return message;
    }
    const anchorId = resolveBranchAnchorId(message);
    if (!anchorId) {
      return message;
    }
    const versionIndex = getActiveVersionIndex(store, anchorId, message);
    const versionCount = getVersionCount(store, anchorId);
    return {
      ...message,
      branchAnchorId: anchorId,
      branchVersionIndex: versionIndex,
      branchVersionCount: versionCount,
    };
  });
}

export function persistBranchStore(conversationId: string, store: MessageBranchStore): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    if (Object.keys(store).length === 0) {
      sessionStorage.removeItem(`${BRANCH_STORAGE_PREFIX}${conversationId}`);
      return;
    }
    sessionStorage.setItem(`${BRANCH_STORAGE_PREFIX}${conversationId}`, JSON.stringify(store));
  } catch {
    // Ignore quota errors.
  }
}

export function loadBranchStore(conversationId: string): MessageBranchStore {
  if (typeof sessionStorage === 'undefined') {
    return {};
  }
  try {
    const raw = sessionStorage.getItem(`${BRANCH_STORAGE_PREFIX}${conversationId}`);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as MessageBranchStore;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function tagNewUserMessage(message: ChatMessage): ChatMessage {
  if (message.role !== 'user') {
    return message;
  }
  const anchorId = message.branchAnchorId ?? message.id;
  return {
    ...message,
    branchAnchorId: anchorId,
    branchVersionIndex: message.branchVersionIndex ?? 0,
  };
}
