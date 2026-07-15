import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { resolveHarnessBinding } from './harness-binding';
import { resolveKeychainService } from './keychain-service';

const execFileAsync = promisify(execFile);

export async function refreshReadinessSnapshot(workspaceRoot?: string): Promise<void> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const doctorPath = join(binding.harnessRoot, 'bin', 'business_doctor.py');
  const bundleId = await resolveKeychainService();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    JAMBU_HOST_BUNDLE_ID: bundleId,
    TAURI_BUNDLE_IDENTIFIER: bundleId,
  };

  await execFileAsync(
    'python3',
    [doctorPath, '--mode', 'operational', '--write-snapshot'],
    {
      cwd: binding.workspaceRoot,
      maxBuffer: 4 * 1024 * 1024,
      env,
    },
  ).catch(() => undefined);
}
