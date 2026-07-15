'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

type PluginsTab = 'installed' | 'available' | 'sources' | 'team';

function PluginRow({
  plugin,
  onUse,
  using,
}: {
  plugin: DesignPluginRecord;
  onUse: (pluginId: string) => void;
  using: boolean;
}) {
  return (
    <article className="plugins-view__card" data-testid="design-plugin-card">
      <div className="plugins-view__card-main">
        <div className="plugins-view__card-head">
          <h3 className="plugins-view__card-title">{plugin.title}</h3>
        </div>
        <p className="plugins-view__card-desc">{pluginDescription(plugin)}</p>
        <div className="plugins-view__card-tags">
          <span className="plugins-view__tag">community/registry</span>
        </div>
      </div>
      <div className="plugins-view__card-actions">
        <button
          type="button"
          className="plugins-view__ghost-btn"
          onClick={() => navigateDesign(designPathForView('plugin-detail', { pluginId: plugin.id }))}
        >
          Details
        </button>
        <button
          type="button"
          className="plugins-view__primary-btn"
          onClick={() => onUse(plugin.id)}
          disabled={using}
          data-testid="design-plugin-use"
        >
          {using ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Install
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
  const [activeTab, setActiveTab] = useState<PluginsTab>('available');

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

  const stats = useMemo(() => {
    const installed = plugins.filter(
      (plugin) => plugin.sourceKind === 'user' || plugin.sourceKind === 'installed',
    ).length;
    const available = plugins.length;
    return { installed, available, sources: 2 };
  }, [plugins]);

  const visiblePlugins = useMemo(() => {
    switch (activeTab) {
      case 'installed':
        return plugins.filter(
          (plugin) => plugin.sourceKind === 'user' || plugin.sourceKind === 'installed',
        );
      case 'available':
        return plugins;
      case 'sources':
      case 'team':
        return [];
      default:
        return plugins;
    }
  }, [activeTab, plugins]);

  const showInstallRow = activeTab === 'available';

  async function handleInstall() {
    const source = installSource.trim();
    if (!source || installing) return;

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
    <div className="plugins-view" data-testid="design-plugins-view">
      <header className="plugins-view__hero">
        <div>
          <p className="plugins-view__kicker">Plugins</p>
          <h1 className="entry-page-title">Plugins</h1>
          <p className="plugins-view__lede">
            Browse installed workflows, install from a registry source, and apply plugins to the Home composer.
          </p>
        </div>
        <div className="plugins-view__hero-actions">
          <button type="button" className="plugins-view__primary-btn">
            Create plugin
          </button>
          <button type="button" className="plugins-view__ghost-btn">
            Import plugin
          </button>
        </div>
      </header>

      <div className="plugins-view__stats">
        <div className="plugins-view__stat">
          <span className="plugins-view__stat-value">{stats.installed}</span>
          <span className="plugins-view__stat-label">Installed</span>
        </div>
        <div className="plugins-view__stat">
          <span className="plugins-view__stat-value">{stats.available}</span>
          <span className="plugins-view__stat-label">Available</span>
        </div>
        <div className="plugins-view__stat">
          <span className="plugins-view__stat-value">{stats.sources}</span>
          <span className="plugins-view__stat-label">Sources</span>
        </div>
      </div>

      <div className="plugins-view__tabs" role="tablist">
        {(
          [
            ['installed', 'Installed', 'Your plugins'],
            ['available', 'Available', 'From sources'],
            ['sources', 'Sources', 'Catalogs'],
            ['team', 'Team', 'Enterprise'],
          ] as const
        ).map(([id, label, meta]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={`plugins-view__tab${activeTab === id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <span className="plugins-view__tab-label">{label}</span>
            <span className="plugins-view__tab-meta">{meta}</span>
          </button>
        ))}
      </div>

      <div className="plugins-view__install-row">
        {showInstallRow ? (
          <>
            <input
              type="text"
              value={installSource}
              onChange={(event) => setInstallSource(event.target.value)}
              placeholder="github:org/repo or marketplace URL"
              className="plugins-view__search-input"
              data-testid="design-plugin-install-source"
            />
            <button
              type="button"
              onClick={() => void handleInstall()}
              disabled={!installSource.trim() || installing}
              className="plugins-view__primary-btn"
              data-testid="design-plugin-install-submit"
            >
              {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Install
            </button>
          </>
        ) : null}
      </div>

      {activeTab === 'sources' && !loading ? (
        <div className="plugins-view__list">
          <article className="plugins-view__card">
            <div className="plugins-view__card-main">
              <h3 className="plugins-view__card-title">Open Design official registry</h3>
              <p className="plugins-view__card-desc">Bundled community and official plugin catalog from the local daemon vendor tree.</p>
            </div>
          </article>
          <article className="plugins-view__card">
            <div className="plugins-view__card-main">
              <h3 className="plugins-view__card-title">GitHub marketplace</h3>
              <p className="plugins-view__card-desc">Install additional plugins from `github:org/repo` sources on the Available tab.</p>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === 'team' && !loading ? (
        <div className="plugins-view__empty">
          Team plugin governance requires an enterprise workspace. Connect integrations to enable shared catalogs.
        </div>
      ) : null}

      {activeTab === 'installed' || activeTab === 'available' ? (
        error ? (
          <p className="plugins-view__error" data-testid="design-plugins-error">
            {error}
          </p>
        ) : null
      ) : null}

      {activeTab === 'installed' || activeTab === 'available' ? (
        loading ? (
          <div className="plugins-view__empty">Loading plugins...</div>
        ) : visiblePlugins.length === 0 ? (
          <div className="plugins-view__empty">No plugins in this tab yet.</div>
        ) : (
          <div className="plugins-view__list">
            {visiblePlugins.map((plugin) => (
              <PluginRow
                key={plugin.id}
                plugin={plugin}
                onUse={(id) => void handleUse(id)}
                using={usingPluginId === plugin.id}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
