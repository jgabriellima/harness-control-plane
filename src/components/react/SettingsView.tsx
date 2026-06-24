import React, { useCallback, useEffect, useState } from 'react';

import type { SettingsSnapshot } from '../../lib/settings-snapshot';
import SecretInput from './SecretInput';
import IntegrationConnectButton from './IntegrationConnectButton';

interface CredentialPresence {
  env_var: string;
  storage: string;
  required: boolean;
  description: string;
  present: boolean;
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

function IntegrationCredentials({ slotId, provider }: { slotId: string; provider: string }) {
  const [credentials, setCredentials] = useState<CredentialPresence[]>([]);
  const [connectAvailable, setConnectAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [credentialsResponse, connectResponse] = await Promise.all([
        fetch(`/api/integrations/${encodeURIComponent(slotId)}/credentials`),
        fetch(`/api/integrations/${encodeURIComponent(slotId)}/connect`),
      ]);
      const credentialsPayload = (await credentialsResponse.json()) as CredentialPresence[];
      const connectPayload = (await connectResponse.json()) as { connect_available?: boolean };
      if (credentialsResponse.ok) {
        setCredentials(credentialsPayload);
      }
      if (connectResponse.ok) {
        setConnectAvailable(Boolean(connectPayload.connect_available));
      }
    } finally {
      setLoading(false);
    }
  }, [slotId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function saveCredential(envVar: string, value: string): Promise<void> {
    const response = await fetch(`/api/integrations/${encodeURIComponent(slotId)}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env_var: envVar, value }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? 'Failed to save credential');
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
      {connectAvailable ? <IntegrationConnectButton slotId={slotId} onConnected={reload} /> : null}
      {!connectAvailable ? (
        <p className="mb-3 text-xs text-gray-500">
          Values are stored in the OS keychain (service: ai.jambu.business-runtime). Never written to the repo.
        </p>
      ) : null}
      {!connectAvailable
        ? credentials.map((credential) => (
            <SecretInput
              key={credential.env_var}
              envVar={credential.env_var}
              label={credential.description || credential.env_var}
              present={credential.present}
              required={credential.required}
              onSave={(value) => saveCredential(credential.env_var, value)}
            />
          ))
        : null}
      <p className="mt-2 text-xs text-gray-400">{provider}</p>
    </div>
  );
}

export default function SettingsView() {
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/settings');
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
  }, []);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="settings-view">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8 pb-12">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Project Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Runtime profile and credentials from <code className="text-xs">.business/business.yaml</code> and OS keychain
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
            <FieldRow label="Engine" value={settings.runtime.engine} />
            <FieldRow label="Specialization Layer" value={settings.runtime.specializationLayer} />
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

      <SettingsSection title="Integrations">
        {settings.integrations.length === 0 ? (
          <p className="text-sm text-gray-500">No integration slots configured.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {settings.integrations.map((slot) => (
              <li key={slot.slotId} className="py-3 first:pt-0 last:pb-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() =>
                    setExpandedSlot((current) => (current === slot.slotId ? null : slot.slotId))
                  }
                  data-testid={`integration-toggle-${slot.slotId}`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{slot.provider}</p>
                    <p className="text-xs text-gray-500">{slot.slotId}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xs font-semibold uppercase ${
                        slot.status === 'active' ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {slot.status}
                    </p>
                    {slot.tenantScope ? (
                      <p className="mt-0.5 max-w-[200px] truncate text-xs text-gray-400">
                        {slot.tenantScope}
                      </p>
                    ) : null}
                  </div>
                </button>
                {expandedSlot === slot.slotId ? (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <IntegrationCredentials slotId={slot.slotId} provider={slot.provider} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
      </div>
    </div>
  );
}
