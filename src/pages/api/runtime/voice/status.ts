import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import {
  getVoiceTranscriptionStatus,
  scheduleVoiceTranscriptionBootstrap,
} from '../../../../lib/voice-transcription';
import { loadUIConfig } from '../../../../lib/ui-config';
import { resolveProjectRoot } from '../../../../lib/project-root';
import { resolveVoiceInputConfig } from '../../../../lib/voice-input-config';

export const GET: APIRoute = async () => {
  try {
    const projectRoot = resolveProjectRoot();
    const uiConfig = await loadUIConfig(projectRoot);
    const desktopRuntime = process.env.CONTROL_PLANE_DESKTOP === '1';
    const voiceInput = resolveVoiceInputConfig(uiConfig, { desktopRuntime });

    if (!voiceInput.enabled || voiceInput.engine !== 'media') {
      return jsonOk({
        enabled: false,
        ready: true,
        status: 'ready',
        message: null,
      });
    }

    scheduleVoiceTranscriptionBootstrap();
    const status = await getVoiceTranscriptionStatus();
    return jsonOk({
      enabled: true,
      ready: status.ready,
      status: status.status,
      message: status.message,
      python_path: status.pythonPath,
      venv_path: status.venvPath,
      updated_at: status.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load voice transcription status';
    return jsonError(message, 500);
  }
};
