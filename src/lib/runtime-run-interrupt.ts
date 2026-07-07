import { appendRunTerminal } from './runtime-run-registry';

export type RunInterruptReason =
  | 'app_close'
  | 'sidecar_crash'
  | 'stale_reattach'
  | 'operator_confirmed'
  | 'registry_desync';

export async function appendRunInterrupted(input: {
  runId: string;
  reason: RunInterruptReason;
  message?: string;
  resumable?: boolean;
  workspaceRoot?: string;
}): Promise<void> {
  const args: Parameters<typeof appendRunTerminal>[0] = {
    runId: input.runId,
    event: 'run.interrupted',
    status: 'interrupted',
    reason: input.reason,
    message: input.message ?? `Run interrupted (${input.reason})`,
    workspaceRoot: input.workspaceRoot,
  };

  await appendRunTerminal(args);
}
