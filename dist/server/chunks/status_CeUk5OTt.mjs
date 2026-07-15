import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { s as scheduleVoiceTranscriptionBootstrap, g as getVoiceTranscriptionStatus } from './voice-transcription_BDPyoG_X.mjs';
import { l as loadUIConfig } from './ui-config_Wh0_gC44.mjs';
import { r as resolveProjectRoot } from './project-root_D7dTqIZJ.mjs';
import { r as resolveVoiceInputConfig } from './voice-input-config_CWyqBP_K.mjs';

const GET = async () => {
  try {
    const projectRoot = resolveProjectRoot();
    const uiConfig = await loadUIConfig(projectRoot);
    const desktopRuntime = process.env.CONTROL_PLANE_DESKTOP === "1";
    const voiceInput = resolveVoiceInputConfig(uiConfig, { desktopRuntime });
    if (!voiceInput.enabled || voiceInput.engine !== "media") {
      return jsonOk({
        enabled: false,
        ready: true,
        status: "ready",
        message: null
      });
    }
    scheduleVoiceTranscriptionBootstrap();
    const status = await getVoiceTranscriptionStatus();
    return jsonOk({
      enabled: true,
      ready: status.ready,
      status: status.status,
      phase: status.phase,
      progress: status.progress,
      message: status.message,
      python_path: status.pythonPath,
      venv_path: status.venvPath,
      updated_at: status.updatedAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load voice transcription status";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
