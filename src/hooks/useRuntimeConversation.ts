'use client';

import { useEffect, useRef } from 'react';

import { createConversationState } from '@/lib/runtime-hub-store';
import type { ChatMessage, ConversationRuntimeState } from '@/lib/runtime-hub-types';
import { DRAFT_CONVERSATION_ID } from '@/lib/draft-conversation';
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
  const hydrateConversationRef = useRef(hub.hydrateConversation);
  hydrateConversationRef.current = hub.hydrateConversation;

  const storageKey = conversationId ?? DRAFT_CONVERSATION_ID;

  useEffect(() => {
    if (conversationId) {
      void hydrateConversationRef.current(conversationId);
    }
  }, [conversationId]);

  const state = hub.getConversationState(storageKey) ?? createConversationState(storageKey);

  const visibleMessages = state.messages;

  const hasConversationContent = visibleMessages.some(
    (message) => message.role === 'user' || message.role === 'assistant',
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
