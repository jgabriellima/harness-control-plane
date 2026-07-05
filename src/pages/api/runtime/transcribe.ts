import type { APIRoute } from 'astro';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { jsonError, jsonOk } from '../../../lib/api-json';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

async function transcribeWithFasterWhisper(audioPath: string, language?: string): Promise<string> {
  const args = [
    '-c',
    [
      'import sys',
      'from faster_whisper import WhisperModel',
      'model = WhisperModel("base", device="cpu", compute_type="int8")',
      'segments, _info = model.transcribe(sys.argv[1], language=sys.argv[2] or None)',
      'print("".join(segment.text for segment in segments).strip())',
    ].join('\n'),
    audioPath,
    language ?? '',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('python3', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `faster-whisper exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export const POST: APIRoute = async ({ request, url }) => {
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

    try {
      const text = await transcribeWithFasterWhisper(audioPath, language);
      if (!text) {
        return jsonError('No speech detected', 422);
      }
      return jsonOk({ text });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Transcription failed';
      return jsonError(
        'Server transcription unavailable. Install faster-whisper (`pip install faster-whisper`) or use composer.voice_input.engine: browser.',
        503,
        { detail },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcription failed';
    return jsonError(message, 500);
  }
};
