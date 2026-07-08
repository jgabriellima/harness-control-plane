/**
 * Dev-server guard: Astro registers an unhandledRejection listener that pushes
 * every rejection to the error overlay. Connect RPC stream teardown after idle
 * (ECONNRESET, unauthenticated end-stream) must not trigger that overlay.
 */

const RECOVERABLE_MARKERS = [
  '[unauthenticated]',
  '[canceled]',
  '[aborted]',
  'invalid api key',
  'econnreset',
  'econnrefused',
  'epipe',
  'etimedout',
  'socket hang up',
  'connection reset',
  'network request failed',
];

const FILTER_FLAG = Symbol.for('jambu.runtimeRejectionFilter');

/**
 * @param {unknown} reason
 * @returns {boolean}
 */
export function isRecoverableConnectRejection(reason) {
  if (reason == null) {
    return false;
  }

  const code =
    typeof reason === 'object' && reason !== null && 'code' in reason
      ? String(reason.code)
      : '';

  if (code === '16' || code === '1' || code === '10' || code === '4' || code === '14') {
    // Connect Code: Unauthenticated, Canceled, Aborted, DeadlineExceeded, Unavailable
    return true;
  }

  const message =
    reason instanceof Error
      ? reason.message.toLowerCase()
      : String(reason).toLowerCase();

  return RECOVERABLE_MARKERS.some((marker) => message.includes(marker));
}

/**
 * Wrap existing unhandledRejection listeners so recoverable Connect errors are
 * logged and swallowed before Astro's dev overlay handler runs.
 */
export function installAstroUnhandledRejectionFilter() {
  if (typeof process === 'undefined' || typeof process.on !== 'function') {
    return;
  }

  const existing = process.listeners('unhandledRejection');
  if (existing.some((listener) => listener[FILTER_FLAG] === true)) {
    return;
  }

  process.removeAllListeners('unhandledRejection');

  /** @type {(reason: unknown, promise?: Promise<unknown>) => void} */
  const filtered = (reason, promise) => {
    if (isRecoverableConnectRejection(reason)) {
      const message =
        reason instanceof Error ? reason.message : String(reason ?? 'unknown');
      console.warn(`[runtime] connect rejection recovered (overlay suppressed): ${message}`);
      return;
    }

    for (const listener of existing) {
      listener(reason, promise);
    }
  };

  filtered[FILTER_FLAG] = true;
  process.on('unhandledRejection', filtered);
}
