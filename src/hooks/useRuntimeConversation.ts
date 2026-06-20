'use client';

import { useEffect, useMemo } from 'react';

import { createConversationState } from '@/lib/runtime-hub-store';
import type { ChatMessage, ConversationRuntimeState } from '@/lib/runtime-hub-types';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';

export interface UseRuntimeConversationResult {
  conversationId: string | null;
  state: ConversationRuntimeState;
  dispatchMessage: ReturnType<typeof useRuntimeHub>['dispatchMessage'];
  isLoading: boolean;
  visibleMessages: ChatMessage[];
  hasConversationContent: boolean;
}

export function useRuntimeConversation(conversationId: string | null): UseRuntimeConversationResult {
  const hub = useRuntimeHub();
  const storageKey = conversationId ?? 'ephemeral-new-chat';

  useEffect(() => {
    if (conversationId) {
      void hub.hydrateConversation(conversationId);
    }
  }, [conversationId, hub]);

  const state = hub.getConversationState(storageKey) ?? createConversationState(storageKey);

  const visibleMessages = useMemo(
    () => state.messages.filter((message) => message.role !== 'tool'),
    [state.messages],
  );

  const hasConversationContent = useMemo(
    () => visibleMessages.some((message) => message.role === 'user' || message.role === 'assistant'),
    [visibleMessages],
  );

  const dispatchMessage = async (
    payload: Parameters<typeof hub.dispatchMessage>[1],
  ): Promise<void> => {
    await hub.dispatchMessage(conversationId, payload);
  };

  return {
    conversationId,
    state,
    dispatchMessage,
    isLoading: state.runPhase === 'streaming',
    visibleMessages,
    hasConversationContent,
  };
}

export function useConversationStreamingPhase(conversationId: string): boolean {
  const hub = useRuntimeHub();
  return hub.getConversationPhase(conversationId) === 'streaming';
}
