#!/usr/bin/env node
/**
 * Blocking voice-transcription bootstrap for desktop install/dev prepare.
 * Requires CONTROL_PLANE_PROJECT_ROOT (app directory with ui.config.yaml).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!process.env.CONTROL_PLANE_PROJECT_ROOT?.trim()) {
  process.env.CONTROL_PLANE_PROJECT_ROOT = path.resolve(harnessRoot, '..', 'business-workflow', 'app');
}

const { ensureVoiceTranscriptionReady } = await import('../src/lib/voice-transcription.ts');

console.log('[voice:prepare] ensuring local speech transcription…');
const status = await ensureVoiceTranscriptionReady();

if (!status.ready) {
  console.error(`[voice:prepare] failed: ${status.message ?? status.status}`);
  process.exit(1);
}

console.log(`[voice:prepare] ready (${status.pythonPath ?? 'system python'})`);
process.exit(0);
