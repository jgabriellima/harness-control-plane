'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Grid3x3, Loader2, Plus, Search, X } from 'lucide-react';

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
import PluginTrustBadge from './PluginTrustBadge';

type PluginsTab = 'installed' | 'available' | 'sources' | 'team';

const TAB_HINTS: Record<PluginsTab, { label: string; hint: string }> = {
  installed: { label: 'Installed', hint: 'Your plugins' },
  available: { label: 'Available', hint: 'From sources' },
  sources: { label: 'Sources', hint: 'Catalogs' },
  team: { label: 'Team', hint: 'Enterprise' },
};

function pluginTrust(plugin: DesignPluginRecord): string {
  return plugin.sourceKind ?? 'restricted';
}

function pluginVersion(plugin: DesignPluginRecord): string | null {
  const manifest = plugin.manifest as { version?: string } | undefined;
  if (typeof manifest?.version === 'string' && manifest.version.trim()) {
    return manifest.version.trim();
  }
  return null;
}

function pluginSourceLabel(plugin: DesignPluginRecord): string {
  return plugin.sourceKind ?? 'community/registry';
}

function InstalledPluginRow({
  plugin,
  onUse,
  using,
}: {
  plugin: DesignPluginRecord;
  onUse: (pluginId: string) => void;
  using: boolean;
}) {
  const version = pluginVersion(plugin);

  return (
    <article className="plugins-view__row" data-testid="design-plugin-card">
      <div className="plugins-view__row-main">
        <div className="plugins-view__row-title">
          <span>{plugin.title}</span>
          <PluginTrustBadge trust={pluginTrust(plugin)} />
        </div>
        <p>{pluginDescription(plugin)}</p>
        <div className="plugins-view__meta">
          <span>{plugin.id}</span>
          {version ? <span>v{version}</span> : null}
          <span>{pluginSourceLabel(plugin)}</span>
        </div>
      </div>
      <div className="plugins-view__row-actions">
        <button
          type="button"
          className="plugins-view__secondary"
          onClick={() => navigateDesign(designPathForView('plugin-detail', { pluginId: plugin.id }))}
        >
          Details
        </button>
        <button
          type="button"
          className="plugins-view__primary"
          onClick={() => onUse(plugin.id)}
          disabled={using}
          data-testid="design-plugin-use"
        >
          {using ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Use
        </button>
      </div>
    </article>
  );
}

function AvailablePluginRow({
  plugin,
  onInstall,
  installing,
}: {
  plugin: DesignPluginRecord;
  onInstall: (pluginId: string) => void;
  installing: boolean;
}) {
  const version = pluginVersion(plugin);
  const isInstalled =
    plugin.sourceKind === 'user' || plugin.sourceKind === 'installed';

  return (
    <article className="plugins-view__available-card" data-testid="design-plugin-card">
      <div className="plugins-view__available-main">
        <div className="plugins-view__row-title">
          <span>{plugin.title}</span>
          <PluginTrustBadge trust={pluginTrust(plugin)} />
        </div>
        <p>{pluginDescription(plugin)}</p>
        <div className="plugins-view__meta">
          <span>{plugin.id}</span>
          {version ? <span>v{version}</span> : null}
          <span>{pluginSourceLabel(plugin)}</span>
        </div>
      </div>
      <div className="plugins-view__row-actions">
        <button
          type="button"
          className="plugins-view__secondary"
          onClick={() => navigateDesign(designPathForView('plugin-detail', { pluginId: plugin.id }))}
        >
          Details
        </button>
        <button
          type="button"
          className="plugins-view__primary"
          onClick={() => onInstall(plugin.id)}
          disabled={installing || isInstalled}
          data-testid="design-plugin-install"
        >
          {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isInstalled ? 'Installed' : 'Install'}
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
  const [installingPluginId, setInstallingPluginId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PluginsTab>('available');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

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

  const installedPlugins = useMemo(
    () =>
      plugins.filter(
        (plugin) => plugin.sourceKind === 'user' || plugin.sourceKind === 'installed',
      ),
    [plugins],
  );

  const sourceOptions = useMemo(() => {
    const kinds = new Set(plugins.map((plugin) => plugin.sourceKind ?? 'community'));
    return Array.from(kinds).map((kind) => ({
      id: kind,
      label: kind,
    }));
  }, [plugins]);

  const filteredAvailable = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return plugins.filter((plugin) => {
      if (sourceFilter !== 'all' && (plugin.sourceKind ?? 'community') !== sourceFilter) {
        return false;
      }
      if (!needle) return true;
      const haystack = `${plugin.title} ${pluginDescription(plugin)} ${plugin.id}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [plugins, searchQuery, sourceFilter]);

  const stats = useMemo(
    () => ({
      installed: installedPlugins.length,
      available: plugins.length,
      sources: 2,
    }),
    [installedPlugins.length, plugins.length],
  );

  async function handleInstallSource(event: React.FormEvent) {
    event.preventDefault();
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

  async function handleInstallPlugin(pluginId: string) {
    setInstallingPluginId(pluginId);
    setError(null);
    try {
      const outcome = await installPluginFromSource(pluginId);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstallingPluginId(null);
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
    <section className="plugins-view" data-testid="design-plugins-view" aria-labelledby="plugins-title">
      <header className="plugins-view__hero">
        <div>
          <p className="plugins-view__kicker">Plugins</p>
          <h1 id="plugins-title" className="entry-section__title">
            Plugins
          </h1>
          <p className="plugins-view__lede">
            Browse installed workflows, install from a registry source, and apply plugins to the Home
            composer.
          </p>
        </div>
        <div className="plugins-view__hero-actions">
          <button type="button" className="plugins-view__primary" data-testid="plugins-create-button">
            <Plus className="h-3.5 w-3.5" />
            <span>Create plugin</span>
          </button>
          <button type="button" className="plugins-view__secondary" data-testid="plugins-import-button">
            <Plus className="h-3.5 w-3.5" />
            <span>Import plugin</span>
          </button>
          <div className="plugins-view__badge" aria-hidden>
            <Grid3x3 className="h-4 w-4" />
            <span>Agent context</span>
          </div>
        </div>
      </header>

      <div className="plugins-view__stats" aria-label="Plugin summary">
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

      <nav className="plugins-view__tabs" role="tablist" aria-label="Plugin areas">
        {(Object.keys(TAB_HINTS) as PluginsTab[]).map((tabId) => {
          const tab = TAB_HINTS[tabId];
          return (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={activeTab === tabId}
              className={`plugins-view__tab${activeTab === tabId ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tabId)}
              data-testid={`plugins-tab-${tabId}`}
            >
              <span className="plugins-view__tab-label">{tab.label}</span>
              <span className="plugins-view__tab-hint">{tab.hint}</span>
            </button>
          );
        })}
      </nav>

      {error ? (
        <div className="plugins-view__notice is-error" data-testid="design-plugins-error">
          {error}
        </div>
      ) : null}

      {loading ? <div className="plugins-view__empty">Loading plugins...</div> : null}

      {!loading && activeTab === 'installed' ? (
        <section className="plugins-view__section" aria-labelledby="plugins-installed-title">
          <div className="plugins-view__section-head">
            <div>
              <h2 id="plugins-installed-title">Installed plugins</h2>
              <p>Workflows ready to apply from the Home composer.</p>
            </div>
            <span className="plugins-view__section-count">{installedPlugins.length}</span>
          </div>
          {installedPlugins.length === 0 ? (
            <div className="plugins-view__empty">No installed plugins yet.</div>
          ) : (
            <div className="plugins-view__list">
              {installedPlugins.map((plugin) => (
                <InstalledPluginRow
                  key={plugin.id}
                  plugin={plugin}
                  onUse={(id) => void handleUse(id)}
                  using={usingPluginId === plugin.id}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading && activeTab === 'available' ? (
        <section className="plugins-view__section" aria-labelledby="plugins-available-title">
          <div className="plugins-view__section-head">
            <div>
              <h2 id="plugins-available-title">Available from sources</h2>
              <p>Install plugins from bundled catalogs and marketplace sources.</p>
            </div>
            <span className="plugins-view__section-count">
              {filteredAvailable.length === plugins.length
                ? plugins.length
                : `${filteredAvailable.length} of ${plugins.length}`}
            </span>
          </div>

          {plugins.length > 0 ? (
            <div className="plugins-view__available-controls" aria-label="Filter available plugins">
              <div className="plugins-view__search">
                <Search className="plugins-view__search-icon h-3.5 w-3.5" />
                <input
                  id="plugins-available-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search available plugins"
                  aria-label="Search available plugins"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="plugins-view__search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
              <label className="plugins-view__filter" htmlFor="plugins-available-source">
                <span>Source</span>
                <select
                  id="plugins-available-source"
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
                >
                  <option value="all">All sources</option>
                  {sourceOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {plugins.length === 0 ? (
            <div className="plugins-view__empty">No plugins available from configured sources.</div>
          ) : filteredAvailable.length === 0 ? (
            <div className="plugins-view__empty">No plugins match your search.</div>
          ) : (
            <div className="plugins-view__available-list">
              {filteredAvailable.map((plugin) => (
                <AvailablePluginRow
                  key={plugin.id}
                  plugin={plugin}
                  onInstall={(id) => void handleInstallPlugin(id)}
                  installing={installingPluginId === plugin.id}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading && activeTab === 'sources' ? (
        <section className="plugins-view__section" aria-labelledby="plugins-sources-title">
          <div className="plugins-view__section-head">
            <div>
              <h2 id="plugins-sources-title">Plugin sources</h2>
              <p>Add marketplace catalogs and GitHub sources for the Available tab.</p>
            </div>
            <span className="plugins-view__section-count">{stats.sources}</span>
          </div>

          <form className="plugins-view__source-manager" onSubmit={(event) => void handleInstallSource(event)}>
            <label htmlFor="plugin-marketplace-url">Source URL</label>
            <div className="plugins-view__source-row">
              <input
                id="plugin-marketplace-url"
                value={installSource}
                onChange={(event) => setInstallSource(event.target.value)}
                placeholder="github:org/repo or marketplace URL"
                disabled={installing}
                data-testid="design-plugin-install-source"
              />
              <select aria-label="Default trust" defaultValue="restricted">
                <option value="restricted">Restricted</option>
                <option value="trusted">Trusted</option>
                <option value="official">Official</option>
              </select>
              <button
                type="submit"
                className="plugins-view__primary"
                disabled={!installSource.trim() || installing}
                data-testid="design-plugin-install-submit"
              >
                {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Add source
              </button>
            </div>
            <p className="plugins-view__source-help">
              Install from <code>github:org/repo</code> or a marketplace JSON URL.
            </p>
          </form>

          <div className="plugins-view__marketplaces">
            <article className="plugins-view__marketplace">
              <div>
                <h3>Open Design official registry</h3>
                <a href="#" onClick={(event) => event.preventDefault()}>
                  bundled://official
                </a>
                <div className="plugins-view__meta">
                  <PluginTrustBadge trust="official" />
                  <span>{plugins.length} plugins</span>
                </div>
              </div>
            </article>
            <article className="plugins-view__marketplace">
              <div>
                <h3>Community registry</h3>
                <a href="#" onClick={(event) => event.preventDefault()}>
                  bundled://community
                </a>
                <div className="plugins-view__meta">
                  <PluginTrustBadge trust="restricted" />
                  <span>community catalog</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {!loading && activeTab === 'team' ? (
        <section className="plugins-view__section">
          <div className="plugins-view__team">
            <div>
              <h2>Team plugins</h2>
              <p>
                Team plugin governance requires an enterprise workspace. Connect integrations to
                enable shared catalogs.
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
