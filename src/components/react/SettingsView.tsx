import React, { useCallback, useEffect, useState } from 'react';

import type { SettingsSnapshot } from '../../lib/settings-snapshot';
import { clientSdkMessageContext } from '../../lib/runtime-sdk-messages';
import { dispatchRuntimeCredentialsChanged } from '../../lib/runtime-credentials-events';
import SecretInput from './SecretInput';
import { useActiveProject } from '../../hooks/useActiveProject';
import IntegrationConnectButton from './IntegrationConnectButton';
import IntegrationConnectionActions from './IntegrationConnectionActions';
import ComputerUseActivatePanel from './ComputerUseActivatePanel';
import PresentationSettingsPanel from './PresentationSettingsPanel';
import ReaderSettingsPanel from './ReaderSettingsPanel';
import { ReaderPreferencesProvider } from './ReaderPreferencesProvider';

interface CredentialPresence {
  env_var: string;
  storage: string;
  required: boolean;
  description: string;
  present: boolean;
  saved_at?: string | null;
  updated_at?: string | null;
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white" data-testid={`settings-section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <header className="border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 border-b border-gray-50 py-3 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

function IntegrationCredentials({
  slotId,
  provider,
  keychainService,
  reloadToken,
  projectId,
}: {
  slotId: string;
  provider: string;
  keychainService: string;
  reloadToken: number;
  projectId: string;
}) {
  const [credentials, setCredentials] = useState<CredentialPresence[]>([]);
  const [connectAvailable, setConnectAvailable] = useState(false);
  const [connected, setConnected] = useState(false);
  const [verified, setVerified] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [expectedSubdomain, setExpectedSubdomain] = useState<string | null>(null);
  const [authType, setAuthType] = useState<'manual' | 'composio_oauth'>('manual');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const connectParams = new URLSearchParams({
        provider,
        project_id: projectId,
      });
      const [credentialsResponse, connectResponse] = await Promise.all([
        fetch(`/api/integrations/${encodeURIComponent(slotId)}/credentials?project_id=${encodeURIComponent(projectId)}`),
        fetch(`/api/integrations/${encodeURIComponent(slotId)}/connect?${connectParams.toString()}`),
      ]);
      const credentialsPayload = (await credentialsResponse.json()) as CredentialPresence[];
      const connectPayload = (await connectResponse.json()) as {
        connect_available?: boolean;
        connected?: boolean;
        verified?: boolean;
        needs_reconnect?: boolean;
        failure_reason?: string | null;
        expected_subdomain?: string | null;
        auth_type?: 'manual' | 'composio_oauth';
      };
      if (credentialsResponse.ok) {
        setCredentials(credentialsPayload);
      }
      if (connectResponse.ok) {
        setConnectAvailable(Boolean(connectPayload.connect_available));
        setConnected(Boolean(connectPayload.connected));
        setVerified(Boolean(connectPayload.verified));
        setNeedsReconnect(Boolean(connectPayload.needs_reconnect));
        setFailureReason(connectPayload.failure_reason ?? null);
        setExpectedSubdomain(connectPayload.expected_subdomain ?? null);
        setAuthType(connectPayload.auth_type === 'composio_oauth' ? 'composio_oauth' : 'manual');
      }
    } finally {
      setLoading(false);
    }
  }, [slotId, provider, projectId]);

  useEffect(() => {
    void reload();
  }, [reload, reloadToken]);

  async function saveCredential(envVar: string, value: string): Promise<void> {
    const response = await fetch(
      `/api/integrations/${encodeURIComponent(slotId)}/credentials?project_id=${encodeURIComponent(projectId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env_var: envVar, value }),
      },
    );
    const payload = (await response.json()) as {
      error?: string;
      present?: boolean;
      saved_at?: string | null;
      updated_at?: string | null;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? 'Failed to save credential');
    }

    setCredentials((current) =>
      current.map((credential) =>
        credential.env_var === envVar
          ? {
              ...credential,
              present: true,
              saved_at: payload.saved_at ?? credential.saved_at ?? null,
              updated_at: payload.updated_at ?? new Date().toISOString(),
            }
          : credential,
      ),
    );

    if (envVar === 'RUNTIME_API_KEY' || envVar === 'CURSOR_API_KEY') {
      dispatchRuntimeCredentialsChanged({ env_var: envVar });
    }

    await reload();
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading credentials…</p>;
  }

  if (credentials.length === 0) {
    return <p className="text-sm text-gray-500">No credentials declared for this slot.</p>;
  }

  return (
    <div data-testid={`integration-credentials-${slotId}`}>
      {authType === 'composio_oauth' ? (
        connected ? (
          <div data-testid={`integration-connected-${slotId}`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                  verified && !needsReconnect
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {verified && !needsReconnect ? 'Connected' : 'Reconnect required'}
              </span>
              <span className="text-xs text-gray-500">
                Stored in OS keychain (service: {keychainService})
              </span>
            </div>
            <IntegrationConnectionActions
              slotId={slotId}
              provider={provider}
              projectId={projectId}
              verified={verified}
              needsReconnect={needsReconnect}
              failureReason={failureReason}
              expectedSubdomain={expectedSubdomain}
              onStateChange={() => {
                void reload();
              }}
            />
          </div>
        ) : connectAvailable ? (
          <IntegrationConnectButton
            slotId={slotId}
            provider={provider}
            projectId={projectId}
            onConnected={reload}
          />
        ) : (
          <p className="text-sm text-amber-700">
            Composio server key (COMPOSIO_API_KEY) is not configured — add it to the server environment to enable Connect.
          </p>
        )
      ) : null}
      {authType === 'manual' ? (
        <p className="mb-3 text-xs text-gray-500">
          Values are stored in the OS keychain (service: {keychainService}). Never written to the repo.
        </p>
      ) : null}
      {authType === 'manual'
        ? credentials.map((credential) => (
            <SecretInput
              key={credential.env_var}
              envVar={credential.env_var}
              label={credential.description || credential.env_var}
              present={credential.present}
              required={credential.required}
              hideEnvVar={credential.env_var === 'RUNTIME_API_KEY'}
              savedAt={credential.saved_at}
              updatedAt={credential.updated_at}
              onSave={(value) => saveCredential(credential.env_var, value)}
            />
          ))
        : null}
      <p className="mt-2 text-xs text-gray-400">{provider}</p>
    </div>
  );
}

interface SlotConnectState {
  authType: 'manual' | 'composio_oauth';
  connectAvailable: boolean;
  connected: boolean;
  verified: boolean;
  needsReconnect: boolean;
  failureReason: string | null;
  expectedSubdomain: string | null;
}

function IntegrationSlotRow({
  slotId,
  provider,
  status,
  tenantScope,
  keychainService,
  expanded,
  onToggle,
  reloadToken,
  projectId,
}: {
  slotId: string;
  provider: string;
  status: string;
  tenantScope: string | null;
  keychainService: string;
  expanded: boolean;
  onToggle: () => void;
  reloadToken: number;
  projectId: string;
}) {
  const [connectState, setConnectState] = useState<SlotConnectState | null>(null);

  const reloadConnectState = useCallback(async (): Promise<void> => {
    const params = new URLSearchParams({ provider, project_id: projectId });
    const response = await fetch(
      `/api/integrations/${encodeURIComponent(slotId)}/connect?${params.toString()}`,
    );
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      auth_type?: 'manual' | 'composio_oauth';
      connect_available?: boolean;
      connected?: boolean;
      verified?: boolean;
      needs_reconnect?: boolean;
      failure_reason?: string | null;
      expected_subdomain?: string | null;
    };
    setConnectState({
      authType: payload.auth_type === 'composio_oauth' ? 'composio_oauth' : 'manual',
      connectAvailable: Boolean(payload.connect_available),
      connected: Boolean(payload.connected),
      verified: Boolean(payload.verified),
      needsReconnect: Boolean(payload.needs_reconnect),
      failureReason: payload.failure_reason ?? null,
      expectedSubdomain: payload.expected_subdomain ?? null,
    });
  }, [slotId, provider, projectId]);

  useEffect(() => {
    void reloadConnectState();
  }, [reloadConnectState, reloadToken]);

  useEffect(() => {
    function handleFocus(): void {
      void reloadConnectState();
    }
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [reloadConnectState]);

  const displayStatus =
    connectState?.authType === 'composio_oauth'
      ? connectState.connected
        ? connectState.verified && !connectState.needsReconnect
          ? 'active'
          : 'reconnect'
        : 'pending'
      : status;
  const showRowConnect =
    connectState?.authType === 'composio_oauth' &&
    connectState.connectAvailable &&
    !connectState.connected;
  const showRowReconnect =
    connectState?.authType === 'composio_oauth' &&
    connectState.connected &&
    connectState.needsReconnect;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onToggle}
          data-testid={`integration-toggle-${slotId}`}
        >
          <p className="text-sm font-medium text-gray-900">{provider}</p>
          <p className="text-xs text-gray-500">{slotId}</p>
          {tenantScope ? (
            <p className="mt-0.5 max-w-[240px] truncate text-xs text-gray-400">{tenantScope}</p>
          ) : null}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p
            className={`text-xs font-semibold uppercase ${
              displayStatus === 'active'
                ? 'text-emerald-600'
                : displayStatus === 'reconnect'
                  ? 'text-amber-600'
                  : 'text-amber-600'
            }`}
          >
            {displayStatus === 'reconnect' ? 'reconnect' : displayStatus}
          </p>
          {showRowConnect ? (
            <IntegrationConnectButton
              slotId={slotId}
              provider={provider}
              projectId={projectId}
              compact
              onConnected={() => {
                void reloadConnectState();
              }}
            />
          ) : null}
          {showRowReconnect ? (
            <IntegrationConnectionActions
              slotId={slotId}
              provider={provider}
              projectId={projectId}
              compact
              verified={connectState?.verified ?? false}
              needsReconnect={connectState?.needsReconnect ?? true}
              failureReason={connectState?.failureReason ?? null}
              expectedSubdomain={connectState?.expectedSubdomain ?? null}
              onStateChange={() => {
                void reloadConnectState();
              }}
            />
          ) : null}
        </div>
      </div>
      {expanded ? (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <IntegrationCredentials
            slotId={slotId}
            provider={provider}
            keychainService={keychainService}
            reloadToken={reloadToken}
            projectId={projectId}
          />
        </div>
      ) : null}
    </li>
  );
}

export default function SettingsView() {
  const activeProject = useActiveProject();
  const projectId = activeProject?.id ?? 'default';
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [keychainService, setKeychainService] = useState('control-plane');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const channel = new BroadcastChannel('composio-oauth-complete');
    channel.onmessage = () => {
      setReloadToken((current) => current + 1);
    };
    return () => {
      channel.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/ui/composer-config')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { desktopIdentifier?: string };
        if (!cancelled && payload.desktopIdentifier) {
          setKeychainService(payload.desktopIdentifier);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/settings?project_id=${encodeURIComponent(projectId)}`);
        const payload = (await response.json()) as SettingsSnapshot & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load settings');
        }

        if (!cancelled) {
          setSettings(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load settings';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading && !settings) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8" data-testid="settings-loading">
        <p className="text-sm text-gray-500">Loading settings…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8" data-testid="settings-error">
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!settings) {
    return null;
  }

  const shippableDesktop = clientSdkMessageContext().operatorContext === false;

  return (
    <ReaderPreferencesProvider>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="settings-view">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8 pb-12">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Project Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          {shippableDesktop
            ? 'Runtime profile and secure credentials for this installation.'
            : 'Runtime profile and credentials from workspaces/{project}/.business and OS keychain'}
        </p>
      </header>

      <SettingsSection title="Project">
        <dl>
          <FieldRow label="Name" value={settings.project.name} />
          <FieldRow label="Description" value={settings.project.description || null} />
          <FieldRow label="Status" value={settings.project.status} />
          <FieldRow label="Initialized" value={settings.project.initialized} />
        </dl>
      </SettingsSection>

      <SettingsSection title="Execution">
        <dl>
          <FieldRow label="Default Workflow" value={settings.execution.defaultWorkflow} />
        </dl>
      </SettingsSection>

      <SettingsSection title="Runtime Profile">
        {settings.runtime ? (
          <dl>
            {settings.runtime.specializationLayer ? (
              <FieldRow label="Specialization Layer" value={settings.runtime.specializationLayer} />
            ) : null}
            <FieldRow label="Command Count" value={String(settings.runtime.commandCount)} />
          </dl>
        ) : (
          <p className="text-sm text-gray-500">No runtime profile configured.</p>
        )}
        {settings.runtime && settings.runtime.commands.length > 0 ? (
          <ul className="mt-4 space-y-1 border-t border-gray-100 pt-4">
            {settings.runtime.commands.map((command) => (
              <li key={command} className="font-mono text-xs text-gray-600">
                {command}
              </li>
            ))}
          </ul>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Runtime">
        <p className="mb-3 text-xs text-gray-500">
          Values are stored in the OS keychain (service: {keychainService}). Chat becomes available
          immediately after saving — no restart required.
        </p>
        <IntegrationCredentials
          slotId="runtime"
          provider="runtime"
          keychainService={keychainService}
          projectId={projectId}
        />
      </SettingsSection>

      <SettingsSection title="Integrations">
        {settings.integrations.length === 0 ? (
          <p className="text-sm text-gray-500">No integration slots configured.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {settings.integrations.map((slot) => (
              <IntegrationSlotRow
                key={slot.slotId}
                slotId={slot.slotId}
                provider={slot.provider}
                status={slot.status}
                tenantScope={slot.tenantScope}
                keychainService={keychainService}
                expanded={expandedSlot === slot.slotId}
                reloadToken={reloadToken}
                projectId={projectId}
                onToggle={() =>
                  setExpandedSlot((current) => (current === slot.slotId ? null : slot.slotId))
                }
              />
            ))}
          </ul>
        )}
      </SettingsSection>

      {settings.identityMigration && !shippableDesktop ? (
        <SettingsSection title="Identity Migration">
          <dl>
            <FieldRow label="Bundle ID" value={settings.identityMigration.bundleId} />
            <FieldRow
              label="Status"
              value={settings.identityMigration.completed ? 'Completed' : 'Pending first launch'}
            />
            <FieldRow
              label="Supersedes"
              value={
                settings.identityMigration.supersedes.length > 0
                  ? settings.identityMigration.supersedes.join(', ')
                  : null
              }
            />
            {settings.identityMigration.keychainKeysMigrated !== null ? (
              <FieldRow
                label="Keychain keys migrated"
                value={String(settings.identityMigration.keychainKeysMigrated)}
              />
            ) : null}
          </dl>
        </SettingsSection>
      ) : null}

      <SettingsSection title="Assistant presentation">
        <PresentationSettingsPanel />
      </SettingsSection>

      <SettingsSection title="Reader typography">
        <ReaderSettingsPanel />
      </SettingsSection>

      {settings.computerUse ? (
        <SettingsSection title="Computer Use">
          <ComputerUseActivatePanel
            initial={settings.computerUse}
            tccReauthRequired={settings.identityMigration?.tccReauthRequired ?? false}
            onUpdated={(next) => setSettings((current) => (current ? { ...current, computerUse: next } : current))}
          />
        </SettingsSection>
      ) : null}
        </div>
      </div>
    </ReaderPreferencesProvider>
  );
}
