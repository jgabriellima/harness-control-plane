import { getCursorLocalAdapter } from './runtime-adapters/cursor-local';
import type { NormalizedMessage, SessionRefs } from './runtime-adapters/types';
import { readLatestBindings } from './runtime-session-registry';
import { resolveAppRoot } from './app-root';

export async function resolveConversationRefs(
  harnessConversationId: string,
  vendorAgentId: string,
): Promise<SessionRefs> {
  const adapter = getCursorLocalAdapter();
  const cwd = resolveAppRoot();
  return adapter.resolveSessionRefs(vendorAgentId, cwd);
}

export async function loadConversationMessages(
  harnessConversationId: string,
  vendorAgentId: string,
): Promise<NormalizedMessage[]> {
  const adapter = getCursorLocalAdapter();
  const refs = await resolveConversationRefs(harnessConversationId, vendorAgentId);
  const transcript = await adapter.getTranscript(vendorAgentId, refs);
  return transcript.messages;
}

export async function lookupBoundAgentId(harnessConversationId: string): Promise<string | null> {
  const bindings = await readLatestBindings();
  const event = bindings.get(harnessConversationId);
  return event?.vendorAgentId ?? null;
}
