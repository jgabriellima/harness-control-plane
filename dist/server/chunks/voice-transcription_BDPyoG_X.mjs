import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { r as resolveProjectRoot } from './project-root_D7dTqIZJ.mjs';
import { l as loadUIConfig } from './ui-config_Wh0_gC44.mjs';
import { r as resolveVoiceInputConfig } from './voice-input-config_CWyqBP_K.mjs';

const VOICE_TRANSCRIPTION_WARM_SCRIPT = `#!/usr/bin/env python3
"""Download and warm the faster-whisper model; updates status.json with progress."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def write_status(status_path: Path, **fields: object) -> None:
    current: dict[str, object] = {}
    if status_path.exists():
        try:
            current = json.loads(status_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            current = {}

    current.update(fields)
    current["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(current, indent=2) + "\\n", encoding="utf-8")


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: warm.py <status.json> <model>", file=sys.stderr)
        return 2

    status_path = Path(sys.argv[1])
    model = sys.argv[2].strip() or "base"

    write_status(
        status_path,
        status="provisioning",
        ready=False,
        phase="model",
        progress=52,
        message=f"Downloading speech model ({model})…",
    )

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        snapshot_download = None

    repo_id = f"Systran/faster-whisper-{model}"

    if snapshot_download is not None:
        write_status(status_path, progress=58, message=f"Fetching {repo_id} from Hugging Face…")
        snapshot_download(repo_id=repo_id)
        write_status(status_path, progress=78, message="Loading speech model into memory…")
    else:
        write_status(status_path, progress=65, message="Loading speech model…")

    from faster_whisper import WhisperModel

    WhisperModel(model, device="cpu", compute_type="int8")

    write_status(
        status_path,
        status="ready",
        ready=True,
        phase="ready",
        progress=100,
        message=None,
    )
    print("ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

const REQUIREMENTS = "faster-whisper>=1.0.0\n";
const DEFAULT_MODEL = process.env.VOICE_TRANSCRIPTION_MODEL?.trim() || "base";
let cachedStatus = null;
let bootstrapScheduled = false;
let bootstrapPromise = null;
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function normalizeStatus(raw) {
  return {
    status: raw.status ?? "provisioning",
    ready: Boolean(raw.ready),
    phase: raw.phase ?? (raw.ready ? "ready" : "idle"),
    progress: typeof raw.progress === "number" ? raw.progress : raw.ready ? 100 : 0,
    pythonPath: raw.pythonPath ?? null,
    venvPath: raw.venvPath ?? null,
    message: raw.message ?? null,
    updatedAt: raw.updatedAt ?? nowIso()
  };
}
function statusSnapshot(partial) {
  return normalizeStatus({ ...partial, updatedAt: nowIso() });
}
function resolveVoiceTranscriptionPaths(projectRoot) {
  const root = resolveProjectRoot();
  const runtimeDir = join(root, ".business", "runtime", "voice-transcription");
  const venvDir = join(runtimeDir, ".venv");
  const pythonPath = process.platform === "win32" ? join(venvDir, "Scripts", "python.exe") : join(venvDir, "bin", "python");
  return {
    runtimeDir,
    venvDir,
    requirementsPath: join(runtimeDir, "requirements.txt"),
    statusPath: join(runtimeDir, "status.json"),
    warmScriptPath: join(runtimeDir, "warm.py"),
    pythonPath
  };
}
async function pathExists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
async function probePythonImport(pythonPath) {
  const result = await runCommand(pythonPath, [
    "-c",
    'from faster_whisper import WhisperModel; print("ok")'
  ]);
  return result.code === 0 && result.stdout.includes("ok");
}
async function resolveSystemPython() {
  for (const candidate of ["python3", "python"]) {
    try {
      const version = await runCommand(candidate, ["--version"]);
      if (version.code === 0) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}
async function writeStatusSnapshot(status) {
  cachedStatus = status;
  const { runtimeDir, statusPath } = resolveVoiceTranscriptionPaths();
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(statusPath, `${JSON.stringify(status, null, 2)}
`, "utf8");
}
async function readVoiceTranscriptionStatusFromDisk() {
  const { statusPath } = resolveVoiceTranscriptionPaths();
  if (!await pathExists(statusPath)) {
    return null;
  }
  try {
    const raw = await readFile(statusPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.status === "string" && typeof parsed.ready === "boolean") {
      return normalizeStatus(parsed);
    }
  } catch {
    return null;
  }
  return null;
}
async function setStatus(partial) {
  const next = statusSnapshot(partial);
  await writeStatusSnapshot(next);
  return next;
}
async function ensureWarmScript(warmScriptPath) {
  if (await pathExists(warmScriptPath)) {
    return;
  }
  await writeFile(warmScriptPath, VOICE_TRANSCRIPTION_WARM_SCRIPT, "utf8");
}
async function warmSpeechModel(pythonPath) {
  const { statusPath, warmScriptPath } = resolveVoiceTranscriptionPaths();
  await ensureWarmScript(warmScriptPath);
  await setStatus({
    status: "provisioning",
    ready: false,
    phase: "model",
    progress: 50,
    pythonPath,
    venvPath: resolveVoiceTranscriptionPaths().venvDir,
    message: `Downloading speech model (${DEFAULT_MODEL})…`
  });
  const warmResult = await runCommand(pythonPath, [warmScriptPath, statusPath, DEFAULT_MODEL]);
  const diskStatus = await readVoiceTranscriptionStatusFromDisk();
  if (warmResult.code === 0 && diskStatus?.ready) {
    cachedStatus = diskStatus;
    return diskStatus;
  }
  return setStatus({
    status: "error",
    ready: false,
    phase: "model",
    progress: diskStatus?.progress ?? 50,
    pythonPath,
    venvPath: resolveVoiceTranscriptionPaths().venvDir,
    message: warmResult.stderr.trim() || diskStatus?.message || "Failed to download or load the speech model."
  });
}
async function isModelWarmed(pythonPath) {
  const diskStatus = await readVoiceTranscriptionStatusFromDisk();
  if (diskStatus?.ready && diskStatus.pythonPath === pythonPath && diskStatus.phase === "ready") {
    return true;
  }
  const probe = await runCommand(pythonPath, [
    "-c",
    [
      "from faster_whisper import WhisperModel",
      `WhisperModel("${DEFAULT_MODEL}", device="cpu", compute_type="int8")`,
      'print("ok")'
    ].join("\n")
  ]);
  return probe.code === 0 && probe.stdout.includes("ok");
}
async function shouldProvisionVoiceTranscription() {
  if (process.env.VOICE_TRANSCRIPTION_SKIP_PROVISION === "1") {
    return false;
  }
  try {
    const projectRoot = resolveProjectRoot();
    const uiConfig = await loadUIConfig(projectRoot);
    const desktopRuntime = process.env.CONTROL_PLANE_DESKTOP === "1";
    const voiceInput = resolveVoiceInputConfig(uiConfig, { desktopRuntime });
    return voiceInput.enabled && voiceInput.engine === "media";
  } catch {
    return process.env.CONTROL_PLANE_DESKTOP === "1";
  }
}
function scheduleVoiceTranscriptionBootstrap() {
  if (bootstrapScheduled) {
    return;
  }
  bootstrapScheduled = true;
  setImmediate(() => {
    void ensureVoiceTranscriptionReady();
  });
}
async function getVoiceTranscriptionStatus() {
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
  if (!await shouldProvisionVoiceTranscription()) {
    return statusSnapshot({
      status: "ready",
      ready: true,
      phase: "ready",
      progress: 100,
      pythonPath: null,
      venvPath: null,
      message: null
    });
  }
  scheduleVoiceTranscriptionBootstrap();
  return cachedStatus ?? diskStatus ?? statusSnapshot({
    status: "provisioning",
    ready: false,
    phase: "python",
    progress: 5,
    pythonPath: null,
    venvPath: resolveVoiceTranscriptionPaths().venvDir,
    message: "Setting up voice input…"
  });
}
async function ensureVoiceTranscriptionReady() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }
  bootstrapPromise = (async () => {
    if (!await shouldProvisionVoiceTranscription()) {
      return setStatus({
        status: "ready",
        ready: true,
        phase: "ready",
        progress: 100,
        pythonPath: null,
        venvPath: null,
        message: null
      });
    }
    const existing = await readVoiceTranscriptionStatusFromDisk();
    if (existing?.ready) {
      cachedStatus = existing;
      return existing;
    }
    await setStatus({
      status: "provisioning",
      ready: false,
      phase: "python",
      progress: 8,
      pythonPath: null,
      venvPath: resolveVoiceTranscriptionPaths().venvDir,
      message: "Checking Python runtime…"
    });
    const systemPython = await resolveSystemPython();
    if (!systemPython) {
      return setStatus({
        status: "missing_python",
        ready: false,
        phase: "python",
        progress: 8,
        pythonPath: null,
        venvPath: resolveVoiceTranscriptionPaths().venvDir,
        message: "Python 3 is required for voice transcription but was not found on PATH."
      });
    }
    let activePython = systemPython;
    if (await probePythonImport(systemPython) && await isModelWarmed(systemPython)) {
      return setStatus({
        status: "ready",
        ready: true,
        phase: "ready",
        progress: 100,
        pythonPath: systemPython,
        venvPath: null,
        message: null
      });
    }
    const { runtimeDir, venvDir, requirementsPath, pythonPath } = resolveVoiceTranscriptionPaths();
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(requirementsPath, REQUIREMENTS, "utf8");
    if (!await pathExists(pythonPath)) {
      await setStatus({
        status: "provisioning",
        ready: false,
        phase: "venv",
        progress: 18,
        pythonPath: null,
        venvPath: venvDir,
        message: "Creating local speech environment…"
      });
      const venvResult = await runCommand(systemPython, ["-m", "venv", venvDir]);
      if (venvResult.code !== 0) {
        return setStatus({
          status: "error",
          ready: false,
          phase: "venv",
          progress: 18,
          pythonPath: null,
          venvPath: venvDir,
          message: venvResult.stderr.trim() || "Failed to create voice transcription virtualenv."
        });
      }
    }
    activePython = pythonPath;
    if (!await probePythonImport(activePython)) {
      await setStatus({
        status: "provisioning",
        ready: false,
        phase: "packages",
        progress: 28,
        pythonPath: activePython,
        venvPath: venvDir,
        message: "Installing speech dependencies…"
      });
      const pipUpgrade = await runCommand(activePython, ["-m", "pip", "install", "--upgrade", "pip"]);
      if (pipUpgrade.code !== 0) {
        return setStatus({
          status: "error",
          ready: false,
          phase: "packages",
          progress: 28,
          pythonPath: activePython,
          venvPath: venvDir,
          message: pipUpgrade.stderr.trim() || "Failed to upgrade pip for voice transcription."
        });
      }
      await setStatus({
        status: "provisioning",
        ready: false,
        phase: "packages",
        progress: 36,
        pythonPath: activePython,
        venvPath: venvDir,
        message: "Installing faster-whisper…"
      });
      const pipInstall = await runCommand(activePython, [
        "-m",
        "pip",
        "install",
        "-r",
        requirementsPath
      ]);
      if (pipInstall.code !== 0) {
        return setStatus({
          status: "error",
          ready: false,
          phase: "packages",
          progress: 36,
          pythonPath: activePython,
          venvPath: venvDir,
          message: pipInstall.stderr.trim() || "Failed to install faster-whisper."
        });
      }
      if (!await probePythonImport(activePython)) {
        return setStatus({
          status: "error",
          ready: false,
          phase: "packages",
          progress: 36,
          pythonPath: activePython,
          venvPath: venvDir,
          message: "Speech dependencies installed but faster-whisper import failed."
        });
      }
    }
    if (await isModelWarmed(activePython)) {
      return setStatus({
        status: "ready",
        ready: true,
        phase: "ready",
        progress: 100,
        pythonPath: activePython,
        venvPath: venvDir,
        message: null
      });
    }
    const warmed = await warmSpeechModel(activePython);
    if (warmed.ready) {
      return setStatus({
        ...warmed,
        pythonPath: activePython,
        venvPath: venvDir
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
async function resolveVoiceTranscriptionPython() {
  const status = cachedStatus?.ready ? cachedStatus : await ensureVoiceTranscriptionReady();
  if (!status.ready || !status.pythonPath) {
    throw new Error(status.message ?? "Voice transcription is not ready.");
  }
  return status.pythonPath;
}
async function transcribeAudioFile(audioPath, language) {
  const pythonPath = await resolveVoiceTranscriptionPython();
  const lang = language?.trim() ?? "";
  const result = await runCommand(pythonPath, [
    "-c",
    [
      "import sys",
      "from faster_whisper import WhisperModel",
      `model = WhisperModel("${DEFAULT_MODEL}", device="cpu", compute_type="int8")`,
      "segments, _info = model.transcribe(sys.argv[1], language=sys.argv[2] or None)",
      'print("".join(segment.text for segment in segments).strip())'
    ].join("\n"),
    audioPath,
    lang
  ]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `Voice transcription failed with code ${result.code}`);
  }
  return result.stdout.trim();
}

export { ensureVoiceTranscriptionReady as e, getVoiceTranscriptionStatus as g, scheduleVoiceTranscriptionBootstrap as s, transcribeAudioFile as t };
