import type { ChatSessionMode, DesignDeliveryOutcome } from '@/lib/chat-types';
import type { ChatMessage } from '@/lib/runtime-hub-types';

export interface DesignDeliveryInput {
  sessionMode: ChatSessionMode | null | undefined;
  runStatus: ChatMessage['runStatus'];
  content: string;
  producedFileCount: number;
}

export function isRetryableAssistantTerminalFailure(
  message: Pick<ChatMessage, 'runStatus' | 'resultDeliveryState'>,
): boolean {
  return (
    message.runStatus === 'failed' ||
    message.resultDeliveryState === 'no_result' ||
    message.resultDeliveryState === 'delivery_failed'
  );
}

function asksForUserInput(content: string): boolean {
  return /<(?:question-form|ask-question)\b/i.test(content);
}

export function resolveDesignDeliveryOutcome(input: DesignDeliveryInput): DesignDeliveryOutcome {
  if (input.sessionMode !== 'design' || input.runStatus !== 'succeeded') {
    return 'not_required';
  }
  if (asksForUserInput(input.content)) {
    return 'awaiting_input';
  }
  if (input.producedFileCount > 0) {
    return 'delivered';
  }
  return 'no_result';
}

export function resolveNextStepVariant(
  sessionMode: ChatSessionMode | null | undefined,
  deliveryOutcome: DesignDeliveryOutcome,
): 'default' | 'project-incomplete' | 'plan' | null {
  if (sessionMode === 'plan') {
    return 'plan';
  }
  if (deliveryOutcome === 'no_result' || deliveryOutcome === 'delivery_failed') {
    return 'project-incomplete';
  }
  if (deliveryOutcome === 'delivered' || deliveryOutcome === 'awaiting_input') {
    return 'default';
  }
  return null;
}
