import { isTauriDesktopShell } from './runtime-surface';

/**
 * Open a URL in the user's default browser (Tauri desktop) or a new tab (web).
 * Returns false when the environment cannot launch an external navigation target.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  const target = url.trim();
  if (!target) {
    return false;
  }

  if (isTauriDesktopShell()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(target);
      return true;
    } catch {
      return false;
    }
  }

  const popup = window.open(target, '_blank', 'noopener,noreferrer');
  if (popup) {
    return true;
  }

  const anchor = document.createElement('a');
  anchor.href = target;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  return true;
}
