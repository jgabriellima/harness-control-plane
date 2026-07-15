import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { r as resolveKeychainService } from './runtime-credentials-activate_BGtjWMAg.mjs';

const execFileAsync = promisify(execFile);
async function refreshReadinessSnapshot(workspaceRoot) {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const doctorPath = join(binding.harnessRoot, "bin", "business_doctor.py");
  const bundleId = await resolveKeychainService();
  const env = {
    ...process.env,
    JAMBU_HOST_BUNDLE_ID: bundleId,
    TAURI_BUNDLE_IDENTIFIER: bundleId
  };
  await execFileAsync(
    "python3",
    [doctorPath, "--mode", "operational", "--write-snapshot"],
    {
      cwd: binding.workspaceRoot,
      maxBuffer: 4 * 1024 * 1024,
      env
    }
  ).catch(() => void 0);
}

export { refreshReadinessSnapshot as r };
