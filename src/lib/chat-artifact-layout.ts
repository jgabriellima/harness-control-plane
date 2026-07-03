/** Percentage layout for chat ↔ artifact split inside the runtime console main column. */

export const CHAT_ARTIFACT_LAYOUT_GROUP_ID = 'chat-artifact-split';

export const CHAT_ARTIFACT_PANEL_IDS = {
  chat: 'chat',
  artifact: 'artifact',
} as const;

export const CHAT_ARTIFACT_LAYOUT_DEFAULTS = {
  chat: 45,
  artifact: 55,
} as const;

export const CHAT_ARTIFACT_LAYOUT_MIN = {
  chat: 28,
  artifact: 32,
} as const;

export function sanitizeChatArtifactLayout(
  layout: Record<string, number> | undefined,
): Record<string, number> {
  const chatRaw = layout?.[CHAT_ARTIFACT_PANEL_IDS.chat] ?? CHAT_ARTIFACT_LAYOUT_DEFAULTS.chat;
  const artifactRaw =
    layout?.[CHAT_ARTIFACT_PANEL_IDS.artifact] ?? CHAT_ARTIFACT_LAYOUT_DEFAULTS.artifact;

  const chat = clampSize(chatRaw, CHAT_ARTIFACT_LAYOUT_DEFAULTS.chat, CHAT_ARTIFACT_LAYOUT_MIN.chat);
  const artifact = clampSize(
    artifactRaw,
    CHAT_ARTIFACT_LAYOUT_DEFAULTS.artifact,
    CHAT_ARTIFACT_LAYOUT_MIN.artifact,
  );

  const total = chat + artifact;
  if (Math.abs(total - 100) > 0.5) {
    const normalizedChat = Math.round((chat / total) * 100);
    return {
      [CHAT_ARTIFACT_PANEL_IDS.chat]: normalizedChat,
      [CHAT_ARTIFACT_PANEL_IDS.artifact]: 100 - normalizedChat,
    };
  }

  return {
    [CHAT_ARTIFACT_PANEL_IDS.chat]: chat,
    [CHAT_ARTIFACT_PANEL_IDS.artifact]: artifact,
  };
}

function clampSize(value: number, fallback: number, minimum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(72, Math.max(minimum, value));
}
