import { isTauriDesktopShell } from './runtime-surface';

export function shouldUseTauriSecrets(): boolean {
  return isTauriDesktopShell();
}

export async function tauriSecretsSet(key: string, value: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('secrets_set', { key, value });
}

export async function tauriSecretsHas(key: string): Promise<boolean> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('secrets_has', { key });
}

export async function enrichKeychainPresence<
  T extends { env_var: string; storage: string; present: boolean },
>(entries: T[]): Promise<T[]> {
  if (!shouldUseTauriSecrets()) {
    return entries;
  }

  return Promise.all(
    entries.map(async (entry) => {
      if (entry.storage !== 'keychain') {
        return entry;
      }
      try {
        const present = await tauriSecretsHas(entry.env_var);
        return { ...entry, present };
      } catch {
        return entry;
      }
    }),
  );
}
