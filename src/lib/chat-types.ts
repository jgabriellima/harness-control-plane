export type ChatSessionMode = 'design' | 'chat' | 'plan';

export type ChatRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export type DesignDeliveryOutcome =
  | 'not_required'
  | 'awaiting_input'
  | 'delivered'
  | 'no_result'
  | 'delivery_failed';

export type RunFailureCategory =
  | 'auth'
  | 'quota'
  | 'upstream'
  | 'config'
  | 'timeout'
  | 'unknown';

export type RunFailureDetail =
  | 'hard_quota'
  | 'workspace_credits_exhausted'
  | 'cli_not_installed'
  | 'timeout'
  | 'inactivity_timeout'
  | 'empty_output'
  | 'session_resume_expired'
  | 'git_bash_missing';

export interface ChatStatusEvent {
  kind: 'status';
  label: 'error' | 'info';
  detail: string;
  code?: string;
  failureCategory?: RunFailureCategory | null;
  failureDetail?: RunFailureDetail | null;
}

export type ChatMessageEvent = ChatStatusEvent;
