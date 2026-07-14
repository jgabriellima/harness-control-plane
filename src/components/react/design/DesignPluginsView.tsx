'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import {
  applyPlugin,
  DESIGN_APPLIED_PLUGIN_QUERY_KEY,
  installPluginFromSource,
  listPlugins,
  pluginDescription,
  type DesignPluginRecord,
} from '@/lib/design-api';
import { designPathForView } from '@/lib/design-navigation';
import { navigateDesign } from '@/lib/design-shell-navigation';

function PluginCard({
  plugin,
  onUse,
  using,
}: {
  plugin: DesignPluginRecord;
  onUse: (pluginId: string) => void;
  using: boolean;
}) {
  return (
    <article
      className="flex flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]"
      data-testid="design-plugin-card"
    >
      <h3 className="text-[16px] font-semibold text-[var(--text)]">{plugin.title}</h3>
      <p className="mt-2 flex-1 text-[14px] leading-6 text-[var(--text-muted)]">
        {pluginDescription(plugin)}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--text-strong)] px-3 py-2 text-[12px] font-medium text-[var(--bg-elevated)] disabled:opacity-40"
          onClick={() => onUse(plugin.id)}
          disabled={using}
          data-testid="design-plugin-use"
        >
          {using ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Use plugin
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--border-soft)] px-3 py-2 text-[12px] font-medium text-[var(--text-muted)]"
          onClick={() =>
            navigateDesign(designPathForView('plugin-detail', { pluginId: plugin.id }))
          }
        >
          Details
        </button>
      </div>
    </article>
  );
}

export default function DesignPluginsView() {
  const [plugins, setPlugins] = useState<DesignPluginRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installSource, setInstallSource] = useState('');
  const [installing, setInstalling] = useState(false);
  const [usingPluginId, setUsingPluginId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const rows = await listPlugins();
    setPlugins(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const rows = await listPlugins();
        if (!cancelled) {
          setPlugins(rows);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load plugins');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleInstall() {
    const source = installSource.trim();
    if (!source || installing) {
      return;
    }

    setInstalling(true);
    setError(null);

    try {
      const outcome = await installPluginFromSource(source);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setInstallSource('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstalling(false);
    }
  }

  async function handleUse(pluginId: string) {
    setUsingPluginId(pluginId);
    setError(null);

    try {
      const result = await applyPlugin(pluginId);
      if (!result?.query) {
        setError('Plugin could not be applied');
        return;
      }
      sessionStorage.setItem(DESIGN_APPLIED_PLUGIN_QUERY_KEY, result.query);
      navigateDesign(designPathForView('home'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply plugin');
    } finally {
      setUsingPluginId(null);
    }
  }

  return (
    <div className="h-full overflow-auto bg-[var(--bg)] px-8 py-10" data-testid="design-plugins-view">
      <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">Plugins</p>
      <h1 className="mt-2 font-serif text-[36px] text-[var(--text)]">Plugins</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-[var(--text-muted)]">
        Browse installed workflows, install from a registry source, and apply plugins to the Home composer.
      </p>

      <div className="mt-8 flex max-w-3xl flex-col gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="text-[13px] font-medium text-[var(--text)]">Install from source</span>
          <input
            type="text"
            value={installSource}
            onChange={(event) => setInstallSource(event.target.value)}
            placeholder="github:org/repo or marketplace URL"
            className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--text)] outline-none focus:border-[var(--border)]"
            data-testid="design-plugin-install-source"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleInstall()}
          disabled={!installSource.trim() || installing}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-[12px] font-medium text-[var(--bg-elevated)] disabled:opacity-40"
          data-testid="design-plugin-install-submit"
        >
          {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Install
        </button>
      </div>

      {error ? (
        <p className="mt-4 text-[13px] text-[var(--red)]" data-testid="design-plugins-error">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-8 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-6 py-12 text-[14px] text-[var(--text-muted)]">
          Loading plugins...
        </div>
      ) : plugins.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-12 text-[14px] text-[var(--text-muted)]">
          No plugins installed yet. Install from a source above.
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              onUse={(id) => void handleUse(id)}
              using={usingPluginId === plugin.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
