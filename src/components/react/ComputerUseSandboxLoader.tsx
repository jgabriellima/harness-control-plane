import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import React from 'react';

import type {
  SandboxLoadPhase,
  SandboxPreflightCheckSummary,
} from '@/lib/runtime-computer-use-panel-types';

interface Step {
  id: SandboxLoadPhase;
  label: string;
  detail: string;
}

const STEPS: Step[] = [
  {
    id: 'preflight',
    label: 'Pre-flight checks',
    detail: 'Docker daemon + CUA runtime',
  },
  {
    id: 'provisioning',
    label: 'Provision sandbox',
    detail: 'Docker + CUA runtime',
  },
  {
    id: 'starting',
    label: 'Boot desktop',
    detail: 'XFCE / isolated environment',
  },
  {
    id: 'vnc_connecting',
    label: 'Connect VNC stream',
    detail: 'noVNC live display',
  },
  {
    id: 'ready',
    label: 'Stream ready',
    detail: 'Interactive sandbox desktop',
  },
];

function phaseIndex(phase: SandboxLoadPhase | null): number {
  if (!phase) {
    return -1;
  }
  return STEPS.findIndex((step) => step.id === phase);
}

interface ComputerUseSandboxLoaderProps {
  phase: SandboxLoadPhase | null;
  message: string | null;
  error: string | null;
  checks?: SandboxPreflightCheckSummary[] | null;
  restarting?: boolean;
  onRetry?: () => void;
}

export default function ComputerUseSandboxLoader({
  phase,
  message,
  error,
  checks = null,
  restarting = false,
  onRetry,
}: ComputerUseSandboxLoaderProps) {
  const activeIndex = phaseIndex(phase);
  const failed = Boolean(error);

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-6 bg-gray-950 px-8 py-10"
      data-testid="computer-use-sandbox-loader"
      data-phase={phase ?? 'unknown'}
      data-failed={failed ? 'true' : 'false'}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {failed ? (
          <AlertCircle className="h-8 w-8 text-red-400" aria-hidden />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-hidden />
        )}
        <p className="text-sm font-medium text-gray-100">
          {failed ? 'Sandbox pre-flight failed' : 'Starting CUA Sandbox'}
        </p>
        <p
          className={`max-w-md text-xs ${failed ? 'text-red-300' : 'text-gray-400'}`}
          role={failed ? 'alert' : 'status'}
        >
          {error ?? message ?? 'Launching isolated desktop and opening VNC stream…'}
        </p>
      </div>

      {checks && checks.length > 0 ? (
        <ul className="w-full max-w-md space-y-2" data-testid="computer-use-sandbox-preflight-checks">
          {checks.map((check) => (
            <li
              key={check.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                check.ok
                  ? 'border-gray-700 bg-gray-900/60'
                  : 'border-red-500/40 bg-red-500/10'
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  check.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}
              >
                {check.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-xs font-medium text-gray-100">{check.label}</span>
                <span className={`block text-[11px] ${check.ok ? 'text-gray-500' : 'text-red-200'}`}>
                  {check.ok ? check.message : `${check.message}${check.remediation ? ` — ${check.remediation}` : ''}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <ol className="w-full max-w-md space-y-3">
        {STEPS.map((step, index) => {
          const done = activeIndex > index || phase === 'ready';
          const active = activeIndex === index && phase !== 'ready' && !failed && !restarting;
          return (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                active
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : done
                    ? 'border-gray-700 bg-gray-900/60'
                    : 'border-gray-800 bg-gray-900/30 opacity-60'
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  done
                    ? 'bg-emerald-600 text-white'
                    : active
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-gray-800 text-gray-500'
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-xs font-medium text-gray-100">{step.label}</span>
                <span className="block text-[11px] text-gray-500">{step.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {failed && onRetry ? (
        <button
          type="button"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-100 hover:bg-red-500/20 disabled:opacity-50"
          data-testid="computer-use-sandbox-retry"
          disabled={restarting}
          onClick={onRetry}
        >
          {restarting ? 'Restarting…' : 'Try again'}
        </button>
      ) : null}
    </div>
  );
}
