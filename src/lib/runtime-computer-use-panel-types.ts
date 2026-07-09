export type ComputerUseControlMode = 'user' | 'agent';

export type ComputerUsePreviewTargetMode = 'host' | 'sandbox';

export type ComputerUsePreviewStreamKind = 'host_screencast' | 'sandbox_vnc';

export type SandboxLoadPhase =
  | 'idle'
  | 'preflight'
  | 'provisioning'
  | 'starting'
  | 'vnc_connecting'
  | 'ready'
  | 'error';

export interface RuntimeComputerUseSelection {
  sessionId: string | null;
  conversationId: string;
  targetMode: ComputerUsePreviewTargetMode;
  streamKind: ComputerUsePreviewStreamKind;
  loading: boolean;
  error: string | null;
  streamUrl: string | null;
  vncUrl: string | null;
  sandboxPhase: SandboxLoadPhase | null;
  sandboxMessage: string | null;
  sandboxPreflightChecks: SandboxPreflightCheckSummary[] | null;
  controlMode: ComputerUseControlMode;
  viewportWidth: number;
  viewportHeight: number;
  label: string;
}

export interface SandboxPreflightCheckSummary {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  remediation: string | null;
}

export function emptyComputerUseSelection(conversationId: string): RuntimeComputerUseSelection {
  return {
    sessionId: null,
    conversationId,
    targetMode: 'host',
    streamKind: 'host_screencast',
    loading: true,
    error: null,
    streamUrl: null,
    vncUrl: null,
    sandboxPhase: null,
    sandboxMessage: null,
    sandboxPreflightChecks: null,
    controlMode: 'agent',
    viewportWidth: 1280,
    viewportHeight: 720,
    label: 'My computer',
  };
}
