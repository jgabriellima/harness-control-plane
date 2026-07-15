import type { SDKMessage } from '@cursor/sdk';

import { joinAssistantTextBlocks } from './assistant-text';
import { mergeStreamingAssistantText } from './assistant-text';
import {
  createOpenUISurfacePart,
  createTextPart,
  type AssistantMessagePart,
} from './message-parts';
import { splitOpenUIEnvelope } from './openui-envelope';
import type { RuntimeHubWireEvent } from './runtime-hub-types';

const rawAssistantByRun = new Map<string, string>();

export function clearOpenUIAssistantAccumulator(runId: string): void {
  rawAssistantByRun.delete(runId);
}

function buildAssistantParts(
  surfaceId: string,
  split: ReturnType<typeof splitOpenUIEnvelope>,
): AssistantMessagePart[] {
  const parts: AssistantMessagePart[] = [];

  if (split.text.length > 0) {
    parts.push(createTextPart(split.text));
  }

  if (split.openuiSource.length > 0 || split.openFence) {
    parts.push(
      createOpenUISurfacePart(
        surfaceId,
        split.openuiSource,
        split.openFence ? 'streaming' : 'completed',
      ),
    );
  }

  return parts;
}

export function wireOpenUIAssistantMessage(
  message: Extract<SDKMessage, { type: 'assistant' }>,
  runId: string,
  agentId: string,
  conversationId: string,
  surfaceId: string,
): RuntimeHubWireEvent {
  const chunk = joinAssistantTextBlocks(
    message.message.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text),
  );

  const previous = rawAssistantByRun.get(runId) ?? '';
  const raw = mergeStreamingAssistantText(previous, chunk);
  rawAssistantByRun.set(runId, raw);

  const split = splitOpenUIEnvelope(raw);
  const parts = buildAssistantParts(surfaceId, split);
  const timestamp = new Date().toISOString();

  return {
    type: 'assistant',
    run_id: runId,
    agent_id: agentId,
    conversation_id: conversationId,
    timestamp,
    payload: {
      text: split.text,
      parts,
      openui_source: split.openuiSource,
      openui_status: split.openFence
        ? 'streaming'
        : split.openuiSource.length > 0
          ? 'completed'
          : undefined,
    },
  };
}
