import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

import { resolveProjectRoot } from './project-root';
import { loadUIConfig } from './ui-config';
import { resolveVoiceInputConfig } from './voice-input-config';

export type VoiceTranscriptionStatusCode =
  | 'ready'
  | 'provisioning'
  | 'missing_python'
  | 'error';

export interface VoiceTranscriptionStatus {
  status: VoiceTranscriptionStatusCode;
  ready: boolean;
  pythonPath: string | null;
  venvPath: string | null;
  message: string | null;
  updatedAt: string;
}

const REQUIREMENTS = 'faster-whisper>=1.0.0\n';
const DEFAULT_MODEL = process.env.VOICE_TRANSCRIPTION_MODEL?.trim() || 'base';

let cachedStatus: VoiceTranscriptionStatus | null = null;
let bootstrapScheduled = false;
let bootstrapPromise: Promise<VoiceTranscriptionStatus> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function statusSnapshot(
  partial: Omit<VoiceTranscriptionStatus, 'updatedAt'>,
): VoiceTranscriptionStatus {
  return { ...partial, updatedAt: nowIso() };
}

export function resolveVoiceTranscriptionPaths(projectRoot?: string): {
  runtimeDir: string;
  venvDir: string;
  requirementsPath: string;
  statusPath: string;
  pythonPath: string;
} {
  const root = projectRoot ?? resolveProjectRoot();
  const runtimeDir = join(root, '.business', 'runtime', 'voice-transcription');
  const venvDir = join(runtimeDir, '.venv');
  const pythonPath =
    process.platform === 'win32'
      ? join(venvDir, 'Scripts', 'python.exe')
      : join(venvDir, 'bin', 'python');

  return {
    runtimeDir,
    venvDir,
    requirementsPath: join(runtimeDir, 'requirements.txt'),
    statusPath: join(runtimeDir, 'status.json'),
    pythonPath,
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function probePythonImport(pythonPath: string): Promise<boolean> {
  const result = await runCommand(pythonPath, [
    '-c',
    'from faster_whisper import WhisperModel; print("ok")',
  ]);
  return result.code === 0 && result.stdout.includes('ok');
}

async function resolveSystemPython(): Promise<string | null> {
  for (const candidate of ['python3', 'python']) {
    try {
      const version = await runCommand(candidate, ['--version']);
      if (version.code === 0) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function writeStatusSnapshot(status: VoiceTranscriptionStatus): Promise<void> {
  cachedStatus = status;
  const { runtimeDir, statusPath } = resolveVoiceTranscriptionPaths();
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
}

export async function readVoiceTranscriptionStatusFromDisk(): Promise<VoiceTranscriptionStatus | null> {
  const { statusPath } = resolveVoiceTranscriptionPaths();
  if (!(await pathExists(statusPath))) {
    return null;
  }
  try {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(statusPath, 'utf8');
    const parsed = JSON.parse(raw) as VoiceTranscriptionStatus;
    if (typeof parsed.status === 'string' && typeof parsed.ready === 'boolean') {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

async function setStatus(
  partial: Omit<VoiceTranscriptionStatus, 'updatedAt'>,
): Promise<VoiceTranscriptionStatus> {
  const next = statusSnapshot(partial);
  await writeStatusSnapshot(next);
  return next;
}

export async function shouldProvisionVoiceTranscription(): Promise<boolean> {
  if (process.env.VOICE_TRANSCRIPTION_SKIP_PROVISION === '1') {
    return false;
  }

  try {
    const projectRoot = resolveProjectRoot();
    const uiConfig = await loadUIConfig(projectRoot);
    const desktopRuntime = process.env.CONTROL_PLANE_DESKTOP === '1';
    const voiceInput = resolveVoiceInputConfig(uiConfig, { desktopRuntime });
    return voiceInput.enabled && voiceInput.engine === 'media';
  } catch {
    return process.env.CONTROL_PLANE_DESKTOP === '1';
  }
}

export function scheduleVoiceTranscriptionBootstrap(): void {
  if (bootstrapScheduled) {
    return;
  }
  bootstrapScheduled = true;
  void ensureVoiceTranscriptionReady();
}

export async function getVoiceTranscriptionStatus(): Promise<VoiceTranscriptionStatus> {
  if (cachedStatus) {
    return cachedStatus;
  }

  const diskStatus = await readVoiceTranscriptionStatusFromDisk();
  if (diskStatus?.ready) {
    cachedStatus = diskStatus;
    return diskStatus;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  if (!(await shouldProvisionVoiceTranscription())) {
    return statusSnapshot({
      status: 'ready',
      ready: true,
      pythonPath: null,
      venvPath: null,
      message: null,
    });
  }

  scheduleVoiceTranscriptionBootstrap();
  return (
    cachedStatus ??
    diskStatus ??
    statusSnapshot({
      status: 'provisioning',
      ready: false,
      pythonPath: null,
      venvPath: resolveVoiceTranscriptionPaths().venvDir,
      message: 'Preparing local voice transcription…',
    })
  );
}

export async function ensureVoiceTranscriptionReady(): Promise<VoiceTranscriptionStatus> {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    if (!(await shouldProvisionVoiceTranscription())) {
      return setStatus({
        status: 'ready',
        ready: true,
        pythonPath: null,
        venvPath: null,
        message: null,
      });
    }

    await setStatus({
      status: 'provisioning',
      ready: false,
      pythonPath: null,
      venvPath: resolveVoiceTranscriptionPaths().venvDir,
      message: 'Preparing local voice transcription…',
    });

    const systemPython = await resolveSystemPython();
    if (!systemPython) {
      return setStatus({
        status: 'missing_python',
        ready: false,
        pythonPath: null,
        venvPath: resolveVoiceTranscriptionPaths().venvDir,
        message: 'Python 3 is required for voice transcription but was not found on PATH.',
      });
    }

    if (await probePythonImport(systemPython)) {
      return setStatus({
        status: 'ready',
        ready: true,
        pythonPath: systemPython,
        venvPath: null,
        message: null,
      });
    }

    const { runtimeDir, venvDir, requirementsPath, pythonPath } =
      resolveVoiceTranscriptionPaths();

    await mkdir(runtimeDir, { recursive: true });
    await writeFile(requirementsPath, REQUIREMENTS, 'utf8');

    if (!(await pathExists(pythonPath))) {
      const venvResult = await runCommand(systemPython, ['-m', 'venv', venvDir]);
      if (venvResult.code !== 0) {
        return setStatus({
          status: 'error',
          ready: false,
          pythonPath: null,
          venvPath: venvDir,
          message: venvResult.stderr.trim() || 'Failed to create voice transcription virtualenv.',
        });
      }
    }

    const pipUpgrade = await runCommand(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip']);
    if (pipUpgrade.code !== 0) {
      return setStatus({
        status: 'error',
        ready: false,
        pythonPath,
        venvPath: venvDir,
        message: pipUpgrade.stderr.trim() || 'Failed to upgrade pip for voice transcription.',
      });
    }

    const pipInstall = await runCommand(pythonPath, [
      '-m',
      'pip',
      'install',
      '-r',
      requirementsPath,
    ]);
    if (pipInstall.code !== 0) {
      return setStatus({
        status: 'error',
        ready: false,
        pythonPath,
        venvPath: venvDir,
        message: pipInstall.stderr.trim() || 'Failed to install faster-whisper.',
      });
    }

    if (!(await probePythonImport(pythonPath))) {
      return setStatus({
        status: 'error',
        ready: false,
        pythonPath,
        venvPath: venvDir,
        message: 'Voice transcription install finished but faster-whisper import failed.',
      });
    }

    return setStatus({
      status: 'ready',
      ready: true,
      pythonPath,
      venvPath: venvDir,
      message: null,
    });
  })();

  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

export async function resolveVoiceTranscriptionPython(): Promise<string> {
  const status = cachedStatus?.ready
    ? cachedStatus
    : await ensureVoiceTranscriptionReady();

  if (!status.ready || !status.pythonPath) {
    throw new Error(status.message ?? 'Voice transcription is not ready.');
  }

  return status.pythonPath;
}

export async function transcribeAudioFile(
  audioPath: string,
  language?: string,
): Promise<string> {
  const pythonPath = await resolveVoiceTranscriptionPython();
  const lang = language?.trim() ?? '';

  const result = await runCommand(pythonPath, [
    '-c',
    [
      'import sys',
      'from faster_whisper import WhisperModel',
      `model = WhisperModel("${DEFAULT_MODEL}", device="cpu", compute_type="int8")`,
      'segments, _info = model.transcribe(sys.argv[1], language=sys.argv[2] or None)',
      'print("".join(segment.text for segment in segments).strip())',
    ].join('\n'),
    audioPath,
    lang,
  ]);

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `Voice transcription failed with code ${result.code}`);
  }

  return result.stdout.trim();
}
