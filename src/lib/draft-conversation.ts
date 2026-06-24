export const DRAFT_CONVERSATION_ID = 'new';

export function isDraftConversationId(conversationId: string | null | undefined): boolean {
  if (!conversationId) {
    return true;
  }

  return conversationId === DRAFT_CONVERSATION_ID || conversationId === 'ephemeral-new-chat';
}
