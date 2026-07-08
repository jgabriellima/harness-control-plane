import React, { useCallback, useEffect, useState } from 'react';

import type { SettingsSnapshot } from '../../lib/settings-snapshot';
import {
  COMPUTER_USE_CURSOR_SDK_WARNING,
  COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE,
  COMPUTER_USE_PERMISSION_DIALOG_HINT,
  COMPUTER_USE_PERMISSION_HINT,
  COMPUTER_USE_PERMISSION_PRODUCT_NAME,
  COMPUTER_USE_PERMISSION_STEPS,
  COMPUTER_USE_PERMISSION_SYSTEM_NAME,
} from '../../lib/runtime-computer-use-copy';

type ComputerUseSummary = NonNullable<SettingsSnapshot['computerUse']>;

interface SetupPayload {
  phase?: string;
  ready?: boolean;
  message?: string | null;
  userAction?: string | null;
}

interface StatusPayload {
  setup?: SetupPayload;
  active?: boolean;
  preferences?: {
    hostControlEnabled: boolean;
    allowForegroundCursor: boolean;
    consentedAt: string | null;
  };
}

interface GrantResponse {
  activated?: boolean;
  setup?: SetupPayload;
  message?: string;
  error?: string;
  opened_settings?: boolean;
  grant_started?: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  idle: 'Preparing',
  installing: 'Installing driver',
  configuring: 'Configuring agent tools',
  permissions: 'Waiting for your approval',
  ready: 'Ready',
  error: 'Setup failed',
};

export default function ComputerUseActivatePanel({
  initial,
  onUpdated,
}: {
  initial: ComputerUseSummary;
  onUpdated: (next: ComputerUseSummary) => void;
}) {
  const [summary, setSummary] = useState(initial);
  const [activating, setActivating] = useState(false);
  const [pendingAction, setPendingAction] = useState<'grant' | 'settings' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const applyStatusPayload = useCallback(
    (payload: StatusPayload | null): ComputerUseSummary | null => {
      if (!payload?.setup) {
        return null;
      }

      const next: ComputerUseSummary = {
        ...summary,
        hostControlEnabled: payload.preferences?.hostControlEnabled ?? summary.hostControlEnabled,
        allowForegroundCursor:
          payload.preferences?.allowForegroundCursor ?? summary.allowForegroundCursor,
        consentedAt: payload.preferences?.consentedAt ?? summary.consentedAt,
        active: payload.active ?? false,
        setupPhase: payload.setup.phase ?? summary.setupPhase,
        setupReady: payload.setup.ready ?? summary.setupReady,
        driverOnPath: summary.driverOnPath || payload.setup.phase !== 'idle',
      };

      setSummary(next);
      onUpdated(next);

      if (payload.setup.message) {
        setStatusMessage(payload.setup.message);
      }

      return next;
    },
    [summary, onUpdated],
  );

  const refreshStatus = useCallback(async (): Promise<StatusPayload | null> => {
    const response = await fetch('/api/settings/computer-use');
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as StatusPayload;
  }, []);

  useEffect(() => {
    if (summary.active || summary.setupPhase !== 'permissions') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void refreshStatus().then((payload) => {
        const next = applyStatusPayload(payload);
        if (next?.active) {
          setStatusMessage(COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE);
        }
      });
    }, 2000);

    return () => window.clearInterval(interval);
  }, [summary.active, summary.setupPhase, refreshStatus, applyStatusPayload]);

  async function activate(): Promise<void> {
    setActivating(true);
    setError(null);
    setStatusMessage('Installing and configuring computer use…');

    try {
      const response = await fetch('/api/settings/computer-use/activate', { method: 'POST' });
      const payload = (await response.json()) as GrantResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? 'Activation failed');
      }

      if (payload.message) {
        setStatusMessage(payload.message);
      } else if (payload.setup?.message) {
        setStatusMessage(payload.setup.message);
      }

      const refreshed = await refreshStatus();
      const next = applyStatusPayload(refreshed) ?? {
        ...summary,
        setupPhase: payload.setup?.phase ?? 'permissions',
        driverOnPath: true,
      };

      if (!next.active && (payload.setup?.phase === 'permissions' || next.setupPhase === 'permissions')) {
        setStatusMessage(
          payload.setup?.userAction ??
            COMPUTER_USE_PERMISSION_DIALOG_HINT,
        );
      }
    } catch (activateError) {
      const message = activateError instanceof Error ? activateError.message : 'Activation failed';
      setError(message);
    } finally {
      setActivating(false);
    }
  }

  async function grantPermissions(openSettings: boolean): Promise<void> {
    setPendingAction(openSettings ? 'settings' : 'grant');
    setError(null);
    setStatusMessage(
      openSettings
        ? 'Opening System Settings…'
        : COMPUTER_USE_PERMISSION_DIALOG_HINT,
    );

    try {
      const response = await fetch('/api/settings/computer-use/grant-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          open_settings: openSettings,
          grant_only: !openSettings,
        }),
      });
      const payload = (await response.json()) as GrantResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? 'Permission request failed');
      }

      if (payload.message) {
        setStatusMessage(payload.message);
      }

      const refreshed = await refreshStatus();
      applyStatusPayload(refreshed);
    } catch (grantError) {
      const message = grantError instanceof Error ? grantError.message : 'Permission request failed';
      setError(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function deactivate(): Promise<void> {
    setActivating(true);
    setError(null);

    try {
      const response = await fetch('/api/settings/computer-use/activate', { method: 'DELETE' });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to deactivate');
      }

      const next: ComputerUseSummary = {
        ...summary,
        hostControlEnabled: false,
        allowForegroundCursor: false,
        consentedAt: null,
        active: false,
        setupPhase: 'permissions',
        setupReady: false,
      };

      setSummary(next);
      onUpdated(next);
      setStatusMessage(null);
    } catch (deactivateError) {
      const message = deactivateError instanceof Error ? deactivateError.message : 'Deactivate failed';
      setError(message);
    } finally {
      setActivating(false);
    }
  }

  async function patchForeground(enabled: boolean): Promise<void> {
    const response = await fetch('/api/settings/computer-use', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowForegroundCursor: enabled }),
    });
    const payload = (await response.json()) as {
      preferences?: { allowForegroundCursor: boolean };
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? 'Failed to update setting');
    }

    const next = {
      ...summary,
      allowForegroundCursor: payload.preferences?.allowForegroundCursor ?? enabled,
    };
    setSummary(next);
    onUpdated(next);
  }

  if (summary.active) {
    const healthDegraded = summary.healthOk === false;

    return (
      <div className="space-y-4" data-testid="settings-computer-use-active">
        <div
          className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
            healthDegraded
              ? 'border-amber-200 bg-amber-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <div>
            <p
              className={`text-sm font-semibold ${
                healthDegraded ? 'text-amber-900' : 'text-emerald-900'
              }`}
            >
              {healthDegraded ? 'Computer Use — driver unreachable' : 'Computer Use active'}
            </p>
            <p className={`text-xs ${healthDegraded ? 'text-amber-800' : 'text-emerald-800'}`}>
              {healthDegraded
                ? (summary.healthError ?? 'Health probe failed. Retry activation or restart CuaDriver.')
                : 'Capability ready — enable Computer Use per chat in the composer (+) menu.'}
            </p>
            {summary.healthOk === true && summary.healthLatencyMs != null ? (
              <p className="mt-1 text-xs text-emerald-700">
                Driver probe {summary.healthLatencyMs}ms
              </p>
            ) : null}
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white ${
              healthDegraded ? 'bg-amber-600' : 'bg-emerald-600'
            }`}
          >
            CUA
          </span>
        </div>

        <button
          type="button"
          className="text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
          disabled={activating}
          onClick={() => void deactivate()}
          data-testid="computer-use-deactivate"
        >
          Turn off
        </button>

        <button
          type="button"
          className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
          onClick={() => setShowAdvanced((value) => !value)}
        >
          {showAdvanced ? 'Hide advanced' : 'Advanced options'}
        </button>

        {showAdvanced ? (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300"
              checked={summary.allowForegroundCursor}
              disabled={activating}
              onChange={(event) => {
                void patchForeground(event.target.checked).catch((patchError) => {
                  setError(patchError instanceof Error ? patchError.message : 'Update failed');
                });
              }}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Foreground cursor</span>
              <span className="block text-xs text-gray-500">
                Allows moving your real cursor when background automation is not enough.
              </span>
            </span>
          </label>
        ) : null}

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const awaitingPermissions = summary.setupPhase === 'permissions' || activating;
  const grantBusy = pendingAction === 'grant';
  const settingsBusy = pendingAction === 'settings';

  return (
    <div className="space-y-4" data-testid="settings-computer-use-setup">
      <p className="text-sm text-gray-600">
        One-click setup installs the driver and macOS permissions. Each chat opts in separately via the composer menu.
      </p>

      {!awaitingPermissions ? (
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          disabled={activating}
          onClick={() => void activate()}
          data-testid="computer-use-activate"
        >
          {activating ? 'Activating…' : 'Activate Computer Use'}
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
          <p className="text-sm font-medium text-amber-950">
            {activating ? 'Setting up…' : (PHASE_LABELS[summary.setupPhase] ?? 'Setting up')}
          </p>
          <p className="text-sm text-amber-900">
            {statusMessage ?? COMPUTER_USE_PERMISSION_STEPS}
          </p>
          <ol className="list-decimal space-y-1 rounded-md border border-amber-200 bg-white/80 px-4 py-3 text-xs text-amber-950">
            <li>
              Toggle <span className="font-semibold">{COMPUTER_USE_PERMISSION_SYSTEM_NAME}</span> ON in
              Accessibility and Screen Recording.
            </li>
            <li>
              If macOS shows &quot;Quit &amp; Reopen&quot; — click <span className="font-semibold">Later</span>.
              {' '}{COMPUTER_USE_PERMISSION_PRODUCT_NAME} restarts the driver for you.
            </li>
            <li>Stay on this page — setup completes automatically in a few seconds.</li>
          </ol>
          <p className="text-xs text-amber-800">{COMPUTER_USE_CURSOR_SDK_WARNING}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
              disabled={grantBusy}
              onClick={() => void grantPermissions(false)}
              data-testid="computer-use-grant-permissions"
            >
              {grantBusy ? 'Opening dialogs…' : 'Grant permissions'}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-60"
              disabled={settingsBusy}
              onClick={() => void grantPermissions(true)}
              data-testid="computer-use-open-settings"
            >
              {settingsBusy ? 'Opening…' : 'Open System Settings'}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
