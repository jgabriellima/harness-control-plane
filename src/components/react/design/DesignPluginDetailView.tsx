'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';

import {
  applyPlugin,
  DESIGN_APPLIED_PLUGIN_QUERY_KEY,
  getPlugin,
  pluginDescription,
  type DesignPluginDetailRecord,
} from '@/lib/design-api';
import { designPathForView } from '@/lib/design-navigation';
import { navigateDesign } from '@/lib/design-shell-navigation';

interface DesignPluginDetailViewProps {
  pluginId: string;
}

function capabilityList(plugin: DesignPluginDetailRecord): string[] {
  const od = (plugin.manifest?.od ?? {}) as Record<string, unknown>;
  const declared = od.capabilities;
  if (Array.isArray(declared)) {
    return declared.filter((item): item is string => typeof item === 'string');
  }
  if (plugin.capabilitiesGranted && plugin.capabilitiesGranted.length > 0) {
    return plugin.capabilitiesGranted;
  }
  return [];
}

export default function DesignPluginDetailView({ pluginId }: DesignPluginDetailViewProps) {
  const [plugin, setPlugin] = useState<DesignPluginDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [using, setUsing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const detail = await getPlugin(pluginId);
        if (cancelled) {
          return;
        }
        if (!detail) {
          setError('Plugin not found');
          setPlugin(null);
          return;
        }
        setPlugin(detail);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load plugin');
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
  }, [pluginId]);

  async function handleUse() {
    setUsing(true);
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
      setUsing(false);
    }
  }

  const capabilities = plugin ? capabilityList(plugin) : [];
  const od = (plugin?.manifest?.od ?? {}) as Record<string, unknown>;
  const connectors = (od.connectors ?? {}) as {
    required?: unknown;
    optional?: unknown;
  };
  const requiredConnectors = Array.isArray(connectors.required)
    ? connectors.required.filter((item): item is string => typeof item === 'string')
    : [];
  const optionalConnectors = Array.isArray(connectors.optional)
    ? connectors.optional.filter((item): item is string => typeof item === 'string')
    : [];

  return (
    <div className="h-full overflow-auto bg-[var(--bg)] px-8 py-10" data-testid={`design-plugin-detail-${pluginId}`}>
      <button
        type="button"
        className="mb-6 inline-flex items-center gap-2 text-[13px] text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
        onClick={() => navigateDesign(designPathForView('plugins'))}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Plugins
      </button>

      {loading ? (
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-6 py-12 text-[14px] text-[var(--text-muted)]">
          Loading plugin...
        </div>
      ) : error && !plugin ? (
        <div
          className="rounded-2xl border border-[var(--red-border)] bg-[var(--red-bg)] px-6 py-12 text-[14px] text-[var(--text)]"
          role="alert"
        >
          {error}
        </div>
      ) : plugin ? (
        <>
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">Plugin</p>
          <h1 className="mt-2 font-serif text-[36px] text-[var(--text)]">{plugin.title}</h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleUse()}
              disabled={using}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--text-strong)] px-4 py-2 text-[12px] font-medium text-[var(--bg-elevated)] disabled:opacity-40"
              data-testid="design-plugin-detail-use"
            >
              {using ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Use plugin
            </button>
            <iframe
              title={`${plugin.title} preview`}
              src={`/api/design/plugins/${encodeURIComponent(pluginId)}/preview`}
              sandbox="allow-scripts"
              className="h-48 w-full max-w-xl rounded-xl border border-[var(--border-soft)] bg-[var(--bg-elevated)]"
              data-testid="design-plugin-detail-preview"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-[12px] text-[var(--text-muted)]">
            {plugin.version ? <span>v{plugin.version}</span> : null}
            {plugin.trust ? <span>trust: {plugin.trust}</span> : null}
            {plugin.sourceKind ? <span>source: {plugin.sourceKind}</span> : null}
            {typeof od.taskKind === 'string' ? <span>{od.taskKind}</span> : null}
          </div>

          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[var(--text-muted)]">
            {pluginDescription(plugin)}
          </p>

          {error ? (
            <p className="mt-3 text-[13px] text-[var(--red)]" data-testid="design-plugin-detail-error">
              {error}
            </p>
          ) : null}

          <section className="mt-10 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-sm)]">
            <h2 className="text-[16px] font-semibold text-[var(--text)]">Capabilities</h2>
            {capabilities.length === 0 ? (
              <p className="mt-3 text-[14px] text-[var(--text-muted)]">
                None declared (defaults to <code className="font-mono text-[13px]">prompt:inject</code>).
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {capabilities.map((capability) => (
                  <li key={capability} className="font-mono text-[13px] text-[var(--text)]">
                    {capability}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {requiredConnectors.length > 0 || optionalConnectors.length > 0 ? (
            <section className="mt-6 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-sm)]">
              <h2 className="text-[16px] font-semibold text-[var(--text)]">Connectors</h2>
              {requiredConnectors.length > 0 ? (
                <div className="mt-3">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-soft)]">Required</p>
                  <ul className="mt-2 space-y-1">
                    {requiredConnectors.map((connector) => (
                      <li key={connector} className="font-mono text-[13px] text-[var(--text)]">
                        {connector}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {optionalConnectors.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-soft)]">Optional</p>
                  <ul className="mt-2 space-y-1">
                    {optionalConnectors.map((connector) => (
                      <li key={connector} className="font-mono text-[13px] text-[var(--text)]">
                        {connector}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
