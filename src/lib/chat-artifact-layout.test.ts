import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CHAT_ARTIFACT_LAYOUT_DEFAULTS,
  CHAT_ARTIFACT_PANEL_IDS,
  sanitizeChatArtifactLayout,
} from './chat-artifact-layout.ts';

describe('sanitizeChatArtifactLayout', () => {
  it('returns defaults when layout is undefined', () => {
    const layout = sanitizeChatArtifactLayout(undefined);
    assert.equal(layout[CHAT_ARTIFACT_PANEL_IDS.chat], CHAT_ARTIFACT_LAYOUT_DEFAULTS.chat);
    assert.equal(layout[CHAT_ARTIFACT_PANEL_IDS.artifact], CHAT_ARTIFACT_LAYOUT_DEFAULTS.artifact);
  });

  it('enforces minimum panel sizes', () => {
    const layout = sanitizeChatArtifactLayout({
      [CHAT_ARTIFACT_PANEL_IDS.chat]: 10,
      [CHAT_ARTIFACT_PANEL_IDS.artifact]: 90,
    });
    assert.ok(layout[CHAT_ARTIFACT_PANEL_IDS.chat] >= 28);
    assert.ok(layout[CHAT_ARTIFACT_PANEL_IDS.artifact] >= 32);
  });

  it('normalizes totals to 100', () => {
    const layout = sanitizeChatArtifactLayout({
      [CHAT_ARTIFACT_PANEL_IDS.chat]: 40,
      [CHAT_ARTIFACT_PANEL_IDS.artifact]: 40,
    });
    const total = layout[CHAT_ARTIFACT_PANEL_IDS.chat] + layout[CHAT_ARTIFACT_PANEL_IDS.artifact];
    assert.equal(total, 100);
  });
});
