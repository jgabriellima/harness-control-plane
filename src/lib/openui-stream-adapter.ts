import { splitOpenUIEnvelope } from './openui-envelope';
import {
  createOpenUISurfacePart,
  createTextPart,
  type AssistantMessagePart,
} from './message-parts';

export interface OpenUIStreamAdapterState {
  raw: string;
  surfaceId: string;
}

export function createOpenUIStreamAdapter(surfaceId: string): OpenUIStreamAdapterState {
  return { raw: '', surfaceId };
}

export interface OpenUIStreamDelta {
  parts: AssistantMessagePart[];
  text: string;
  openuiSource: string;
  openFence: boolean;
}

export function ingestOpenUIAssistantChunk(
  state: OpenUIStreamAdapterState,
  chunk: string,
): { state: OpenUIStreamAdapterState; delta: OpenUIStreamDelta } {
  const nextRaw = state.raw + chunk;
  const split = splitOpenUIEnvelope(nextRaw);
  const parts: AssistantMessagePart[] = [];

  if (split.text.length > 0) {
    parts.push(createTextPart(split.text));
  }

  if (split.openuiSource.length > 0 || split.openFence) {
    parts.push(
      createOpenUISurfacePart(
        state.surfaceId,
        split.openuiSource,
        split.openFence ? 'streaming' : 'completed',
      ),
    );
  }

  return {
    state: { ...state, raw: nextRaw },
    delta: {
      parts,
      text: split.text,
      openuiSource: split.openuiSource,
      openFence: split.openFence,
    },
  };
}

export function finalizeOpenUIStream(
  state: OpenUIStreamAdapterState,
): AssistantMessagePart[] {
  const split = splitOpenUIEnvelope(state.raw);
  const parts: AssistantMessagePart[] = [];

  if (split.text.length > 0) {
    parts.push(createTextPart(split.text));
  }

  if (split.openuiSource.length > 0) {
    parts.push(createOpenUISurfacePart(state.surfaceId, split.openuiSource, 'completed'));
  } else if (split.openFence) {
    parts.push(createOpenUISurfacePart(state.surfaceId, split.openuiSource, 'failed'));
  }

  return parts;
}
