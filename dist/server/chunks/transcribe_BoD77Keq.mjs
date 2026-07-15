import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { s as scheduleVoiceTranscriptionBootstrap, g as getVoiceTranscriptionStatus, e as ensureVoiceTranscriptionReady, t as transcribeAudioFile } from './voice-transcription_BDPyoG_X.mjs';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const POST = async ({ request, url }) => {
  scheduleVoiceTranscriptionBootstrap();
  const readiness = await getVoiceTranscriptionStatus();
  if (!readiness.ready) {
    if (readiness.status === "provisioning") {
      const provisioned = await ensureVoiceTranscriptionReady();
      if (!provisioned.ready) {
        return jsonError(provisioned.message ?? "Voice transcription is still starting.", 503, {
          detail: provisioned.status
        });
      }
    } else {
      return jsonError(readiness.message ?? "Voice transcription is unavailable.", 503, {
        detail: readiness.status
      });
    }
  }
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Request body must be multipart form data", 400);
  }
  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return jsonError("Missing audio file", 400);
  }
  if (audio.size === 0) {
    return jsonError("Audio file is empty", 400);
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonError("Audio file exceeds 10MB limit", 400);
  }
  const language = url.searchParams.get("language")?.trim() || void 0;
  const tempDir = await mkdtemp(join(tmpdir(), "hcp-voice-"));
  const audioPath = join(tempDir, "voice-input.webm");
  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    await writeFile(audioPath, buffer);
    const text = await transcribeAudioFile(audioPath, language);
    if (!text) {
      return jsonError("No speech detected", 422);
    }
    return jsonOk({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
