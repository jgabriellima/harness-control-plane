import React, { useEffect, useMemo, useState } from 'react';

import {
  buildExecutionViewModel,
  isActiveExecution,
  type ExecutionViewModel,
} from '../../lib/execution-events';
import type { ExecutionDetail } from '../../lib/harness-types';
import { subscribeExecutionEvents } from '../../lib/sse-client';
import type { WorkflowDetail } from '../../lib/types/workflow';
import { buildNodeGateRuleMap } from '../../lib/workflow-gates';
import ExecutionHeader from './ExecutionHeader';
import ExecutionOverviewPanel from './ExecutionOverviewPanel';
import ExecutionTracingPanel from './ExecutionTracingPanel';
import NodeVisualization from './NodeVisualization';

interface ExecutionViewProps {
  executionId: string;
}

interface ExecutionDetailResponse extends ExecutionDetail {
  error?: string;
}

interface WorkflowResponse extends WorkflowDetail {
  error?: string;
}

type ExecutionTab = 'overview' | 'nodes' | 'tracing';

const TAB_ITEMS: Array<{ id: ExecutionTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'nodes', label: 'Nodes' },
  { id: 'tracing', label: 'Tracing' },
];

function activeTabFromLocation(): ExecutionTab {
  if (typeof window === 'undefined') {
    return 'overview';
  }

  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (tab === 'nodes' || tab === 'tracing' || tab === 'overview') {
    return tab;
  }

  return 'overview';
}

export default function ExecutionView({ executionId }: ExecutionViewProps) {
  const [model, setModel] = useState<ExecutionViewModel | null>(null);
  const [gateRulesByNode, setGateRulesByNode] = useState<Map<string, string[]>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<ExecutionTab>('overview');

  useEffect(() => {
    setActiveTab(activeTabFromLocation());
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeSse: (() => void) | null = null;

    async function loadExecution(): Promise<ExecutionViewModel> {
      const response = await fetch(`/api/executions/${encodeURIComponent(executionId)}`);

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Failed to load execution');
      }

      const payload = (await response.json()) as ExecutionDetailResponse;
      return buildExecutionViewModel(payload);
    }

    async function loadWorkflowGateRules(workflowId: string): Promise<Map<string, string[]>> {
      const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`);
      if (!response.ok) {
        return new Map();
      }

      const payload = (await response.json()) as WorkflowResponse;
      return buildNodeGateRuleMap(payload.nodes ?? []);
    }

    async function refreshExecution(): Promise<void> {
      try {
        const viewModel = await loadExecution();

        if (cancelled) {
          return;
        }

        setModel(viewModel);
        setLoadError(null);
        setLoading(false);
        setTick((value) => value + 1);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load execution';
          setLoadError(message);
          setLoading(false);
        }
      }
    }

    async function init(): Promise<void> {
      try {
        const viewModel = await loadExecution();

        if (cancelled) {
          return;
        }

        setModel(viewModel);
        setLoadError(null);
        setLoading(false);

        const rules = await loadWorkflowGateRules(viewModel.workflowId);
        if (!cancelled) {
          setGateRulesByNode(rules);
        }

        if (isActiveExecution(viewModel.status)) {
          unsubscribeSse = subscribeExecutionEvents(executionId, {
            onEvent: () => {
              void refreshExecution();
            },
            onClose: () => {
              void refreshExecution();
            },
          });
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load execution';
          setLoadError(message);
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      unsubscribeSse?.();
    };
  }, [executionId]);

  const tabContent = useMemo(() => {
    if (!model) {
      return null;
    }

    switch (activeTab) {
      case 'nodes':
        return (
          <NodeVisualization
            workflowId={model.workflowId}
            nodes={model.nodes}
            gateRulesByNode={gateRulesByNode}
          />
        );
      case 'tracing':
        return (
          <ExecutionTracingPanel
            events={model.events}
            startedAt={model.startedAt}
            updatedAt={model.updatedAt}
          />
        );
      case 'overview':
      default:
        return <ExecutionOverviewPanel model={model} />;
    }
  }, [activeTab, gateRulesByNode, model]);

  function selectTab(tab: ExecutionTab): void {
    setActiveTab(tab);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'overview') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', tab);
      }
      window.history.replaceState({}, '', url.toString());
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-16" data-testid="execution-loading">
        <p className="text-sm text-gray-500">Loading execution...</p>
      </div>
    );
  }

  if (loadError || !model) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-16" data-testid="execution-error">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-red-600">{loadError ?? 'Execution not found'}</p>
          <p className="mt-2 font-mono text-xs text-gray-500">{executionId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="execution-view">
      <ExecutionHeader model={model} tick={tick} />

      <nav
        className="border-b border-gray-200 bg-white px-6"
        aria-label="Execution detail tabs"
        data-testid="execution-tabs"
      >
        <ul className="flex gap-1">
          {TAB_ITEMS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-violet-600 text-violet-700'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => selectTab(tab.id)}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">{tabContent}</div>
    </div>
  );
}
