import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { resolveProjectRoot } from '../../../lib/project-root';
import { resolveRuntimeSurface } from '../../../lib/runtime-surface';
import { loadUIConfig } from '../../../lib/ui-config';
import { resolveVoiceInputConfig } from '../../../lib/voice-input-config';
import {
  getVoiceTranscriptionStatus,
  scheduleVoiceTranscriptionBootstrap,
} from '../../../lib/voice-transcription';

export const GET: APIRoute = async () => {
  try {
    const projectRoot = resolveProjectRoot();
    const uiConfig = await loadUIConfig(projectRoot);
    const desktopRuntime = process.env.CONTROL_PLANE_DESKTOP === '1';
    const surface = resolveRuntimeSurface({
      distributionSurface: uiConfig.distribution?.surface,
      desktopRuntime,
    });
    const voiceInput = resolveVoiceInputConfig(uiConfig, { desktopRuntime });

    if (voiceInput.enabled && voiceInput.engine === 'media') {
      scheduleVoiceTranscriptionBootstrap();
    }

    const voiceTranscription =
      voiceInput.enabled && voiceInput.engine === 'media'
        ? await getVoiceTranscriptionStatus()
        : null;

    return jsonOk({
      voice_input: voiceInput,
      voice_transcription: voiceTranscription,
      locale: uiConfig.presentation?.locale ?? 'en-US',
      surface,
      desktop_runtime: desktopRuntime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load composer config';
    return jsonError(message, 500);
  }
};
