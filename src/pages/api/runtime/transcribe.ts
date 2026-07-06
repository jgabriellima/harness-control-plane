import type { APIRoute } from 'astro';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { jsonError, jsonOk } from '../../../lib/api-json';
import {
  ensureVoiceTranscriptionReady,
  getVoiceTranscriptionStatus,
  scheduleVoiceTranscriptionBootstrap,
  transcribeAudioFile,
} from '../../../lib/voice-transcription';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export const POST: APIRoute = async ({ request, url }) => {
  scheduleVoiceTranscriptionBootstrap();

  const readiness = await getVoiceTranscriptionStatus();
  if (!readiness.ready) {
    if (readiness.status === 'provisioning') {
      const provisioned = await ensureVoiceTranscriptionReady();
      if (!provisioned.ready) {
        return jsonError(provisioned.message ?? 'Voice transcription is still starting.', 503, {
          detail: provisioned.status,
        });
      }
    } else {
      return jsonError(readiness.message ?? 'Voice transcription is unavailable.', 503, {
        detail: readiness.status,
      });
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError('Request body must be multipart form data', 400);
  }

  const audio = formData.get('audio');
  if (!(audio instanceof File)) {
    return jsonError('Missing audio file', 400);
  }

  if (audio.size === 0) {
    return jsonError('Audio file is empty', 400);
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonError('Audio file exceeds 10MB limit', 400);
  }

  const language = url.searchParams.get('language')?.trim() || undefined;
  const tempDir = await mkdtemp(join(tmpdir(), 'hcp-voice-'));
  const audioPath = join(tempDir, 'voice-input.webm');

  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    await writeFile(audioPath, buffer);
    const text = await transcribeAudioFile(audioPath, language);
    if (!text) {
      return jsonError('No speech detected', 422);
    }
    return jsonOk({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcription failed';
    return jsonError(message, 500);
  }
};
