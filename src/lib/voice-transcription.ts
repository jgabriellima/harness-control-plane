import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

import { resolveProjectRoot } from './project-root';
import { loadUIConfig } from './ui-config';
import { resolveVoiceInputConfig } from './voice-input-config';
import { VOICE_TRANSCRIPTION_WARM_SCRIPT } from './voice-transcription-warm-script';

export type VoiceTranscriptionStatusCode =
  | 'ready'
  | 'provisioning'
  | 'missing_python'
  | 'error';

export type VoiceTranscriptionPhase =
  | 'idle'
  | 'python'
  | 'venv'
  | 'packages'
  | 'model'
  | 'ready';

export interface VoiceTranscriptionStatus {
  status: VoiceTranscriptionStatusCode;
  ready: boolean;
  phase: VoiceTranscriptionPhase;
  progress: number;
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

function normalizeStatus(raw: Partial<VoiceTranscriptionStatus>): VoiceTranscriptionStatus {
  return {
    status: raw.status ?? 'provisioning',
    ready: Boolean(raw.ready),
    phase: raw.phase ?? (raw.ready ? 'ready' : 'idle'),
    progress: typeof raw.progress === 'number' ? raw.progress : raw.ready ? 100 : 0,
    pythonPath: raw.pythonPath ?? null,
    venvPath: raw.venvPath ?? null,
    message: raw.message ?? null,
    updatedAt: raw.updatedAt ?? nowIso(),
  };
}

function statusSnapshot(
  partial: Omit<VoiceTranscriptionStatus, 'updatedAt'>,
): VoiceTranscriptionStatus {
  return normalizeStatus({ ...partial, updatedAt: nowIso() });
}

export function resolveVoiceTranscriptionPaths(projectRoot?: string): {
  runtimeDir: string;
  venvDir: string;
  requirementsPath: string;
  statusPath: string;
  warmScriptPath: string;
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
    warmScriptPath: join(runtimeDir, 'warm.py'),
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
    const raw = await readFile(statusPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<VoiceTranscriptionStatus>;
    if (typeof parsed.status === 'string' && typeof parsed.ready === 'boolean') {
      return normalizeStatus(parsed);
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

async function ensureWarmScript(warmScriptPath: string): Promise<void> {
  if (await pathExists(warmScriptPath)) {
    return;
  }
  await writeFile(warmScriptPath, VOICE_TRANSCRIPTION_WARM_SCRIPT, 'utf8');
}

async function warmSpeechModel(pythonPath: string): Promise<VoiceTranscriptionStatus> {
  const { statusPath, warmScriptPath } = resolveVoiceTranscriptionPaths();
  await ensureWarmScript(warmScriptPath);

  await setStatus({
    status: 'provisioning',
    ready: false,
    phase: 'model',
    progress: 50,
    pythonPath,
    venvPath: resolveVoiceTranscriptionPaths().venvDir,
    message: `Downloading speech model (${DEFAULT_MODEL})…`,
  });

  const warmResult = await runCommand(pythonPath, [warmScriptPath, statusPath, DEFAULT_MODEL]);
  const diskStatus = await readVoiceTranscriptionStatusFromDisk();

  if (warmResult.code === 0 && diskStatus?.ready) {
    cachedStatus = diskStatus;
    return diskStatus;
  }

  return setStatus({
    status: 'error',
    ready: false,
    phase: 'model',
    progress: diskStatus?.progress ?? 50,
    pythonPath,
    venvPath: resolveVoiceTranscriptionPaths().venvDir,
    message:
      warmResult.stderr.trim() ||
      diskStatus?.message ||
      'Failed to download or load the speech model.',
  });
}

async function isModelWarmed(pythonPath: string): Promise<boolean> {
  const diskStatus = await readVoiceTranscriptionStatusFromDisk();
  if (diskStatus?.ready && diskStatus.pythonPath === pythonPath && diskStatus.phase === 'ready') {
    return true;
  }

  const probe = await runCommand(pythonPath, [
    '-c',
    [
      'from faster_whisper import WhisperModel',
      `WhisperModel("${DEFAULT_MODEL}", device="cpu", compute_type="int8")`,
      'print("ok")',
    ].join('\n'),
  ]);
  return probe.code === 0 && probe.stdout.includes('ok');
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
  if (cachedStatus?.ready) {
    return cachedStatus;
  }

  const diskStatus = await readVoiceTranscriptionStatusFromDisk();
  if (diskStatus?.ready) {
    cachedStatus = diskStatus;
    return diskStatus;
  }

  if (bootstrapPromise) {
    const inFlight = await readVoiceTranscriptionStatusFromDisk();
    if (inFlight && !inFlight.ready) {
      cachedStatus = inFlight;
      return inFlight;
    }
  }

  if (!(await shouldProvisionVoiceTranscription())) {
    return statusSnapshot({
      status: 'ready',
      ready: true,
      phase: 'ready',
      progress: 100,
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
      phase: 'python',
      progress: 5,
      pythonPath: null,
      venvPath: resolveVoiceTranscriptionPaths().venvDir,
      message: 'Setting up voice input…',
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
        phase: 'ready',
        progress: 100,
        pythonPath: null,
        venvPath: null,
        message: null,
      });
    }

    const existing = await readVoiceTranscriptionStatusFromDisk();
    if (existing?.ready) {
      cachedStatus = existing;
      return existing;
    }

    await setStatus({
      status: 'provisioning',
      ready: false,
      phase: 'python',
      progress: 8,
      pythonPath: null,
      venvPath: resolveVoiceTranscriptionPaths().venvDir,
      message: 'Checking Python runtime…',
    });

    const systemPython = await resolveSystemPython();
    if (!systemPython) {
      return setStatus({
        status: 'missing_python',
        ready: false,
        phase: 'python',
        progress: 8,
        pythonPath: null,
        venvPath: resolveVoiceTranscriptionPaths().venvDir,
        message: 'Python 3 is required for voice transcription but was not found on PATH.',
      });
    }

    let activePython = systemPython;

    if (await probePythonImport(systemPython) && (await isModelWarmed(systemPython))) {
      return setStatus({
        status: 'ready',
        ready: true,
        phase: 'ready',
        progress: 100,
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
      await setStatus({
        status: 'provisioning',
        ready: false,
        phase: 'venv',
        progress: 18,
        pythonPath: null,
        venvPath: venvDir,
        message: 'Creating local speech environment…',
      });

      const venvResult = await runCommand(systemPython, ['-m', 'venv', venvDir]);
      if (venvResult.code !== 0) {
        return setStatus({
          status: 'error',
          ready: false,
          phase: 'venv',
          progress: 18,
          pythonPath: null,
          venvPath: venvDir,
          message: venvResult.stderr.trim() || 'Failed to create voice transcription virtualenv.',
        });
      }
    }

    activePython = pythonPath;

    if (!(await probePythonImport(activePython))) {
      await setStatus({
        status: 'provisioning',
        ready: false,
        phase: 'packages',
        progress: 28,
        pythonPath: activePython,
        venvPath: venvDir,
        message: 'Installing speech dependencies…',
      });

      const pipUpgrade = await runCommand(activePython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
      if (pipUpgrade.code !== 0) {
        return setStatus({
          status: 'error',
          ready: false,
          phase: 'packages',
          progress: 28,
          pythonPath: activePython,
          venvPath: venvDir,
          message: pipUpgrade.stderr.trim() || 'Failed to upgrade pip for voice transcription.',
        });
      }

      await setStatus({
        status: 'provisioning',
        ready: false,
        phase: 'packages',
        progress: 36,
        pythonPath: activePython,
        venvPath: venvDir,
        message: 'Installing faster-whisper…',
      });

      const pipInstall = await runCommand(activePython, [
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
          phase: 'packages',
          progress: 36,
          pythonPath: activePython,
          venvPath: venvDir,
          message: pipInstall.stderr.trim() || 'Failed to install faster-whisper.',
        });
      }

      if (!(await probePythonImport(activePython))) {
        return setStatus({
          status: 'error',
          ready: false,
          phase: 'packages',
          progress: 36,
          pythonPath: activePython,
          venvPath: venvDir,
          message: 'Speech dependencies installed but faster-whisper import failed.',
        });
      }
    }

    if (await isModelWarmed(activePython)) {
      return setStatus({
        status: 'ready',
        ready: true,
        phase: 'ready',
        progress: 100,
        pythonPath: activePython,
        venvPath: venvDir,
        message: null,
      });
    }

    const warmed = await warmSpeechModel(activePython);
    if (warmed.ready) {
      return setStatus({
        ...warmed,
        pythonPath: activePython,
        venvPath: venvDir,
      });
    }

    return warmed;
  })();

  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

export async function resolveVoiceTranscriptionPython(): Promise<string> {
  const status = cachedStatus?.ready ? cachedStatus : await ensureVoiceTranscriptionReady();

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

if (process.env.CONTROL_PLANE_DESKTOP === '1' && process.env.VOICE_TRANSCRIPTION_SKIP_PROVISION !== '1') {
  scheduleVoiceTranscriptionBootstrap();
}
