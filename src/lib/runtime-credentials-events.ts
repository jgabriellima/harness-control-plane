export const RUNTIME_CREDENTIALS_CHANGED_EVENT = 'runtime-credentials-changed';

export function dispatchRuntimeCredentialsChanged(detail?: { env_var?: string }): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(RUNTIME_CREDENTIALS_CHANGED_EVENT, { detail }));
}
