'use client';

import React, { useMemo } from 'react';

import { formatContextTokenCount } from '@/lib/context-usage';
import { buildContextUsageBarSegments } from '@/lib/context-usage-segments';
import type { ContextUsageReport } from '@/lib/context-usage-types';

interface ContextUsageBarProps {
  report: ContextUsageReport | null;
  loading?: boolean;
  compact?: boolean;
  active?: boolean;
  onOpen: () => void;
}

function buildAriaLabel(report: ContextUsageReport): string {
  const segments = report.slices
    .map((slice) => `${slice.label} ${formatContextTokenCount(slice.tokens)}`)
    .join(', ');
  const freeTokens = Math.max(0, report.contextWindowSize - report.totalTokens);

  return [
    `Context ${report.percentFull}% full`,
    `${formatContextTokenCount(report.totalTokens)} of ${formatContextTokenCount(report.contextWindowSize)} used`,
    segments,
    freeTokens > 0 ? `${formatContextTokenCount(freeTokens)} free` : null,
    'Open context usage report',
  ]
    .filter(Boolean)
    .join('. ');
}

export default function ContextUsageBar({
  report,
  loading = false,
  compact = false,
  active = false,
  onOpen,
}: ContextUsageBarProps) {
  const snapshot = useMemo(() => {
    if (!report || report.contextWindowSize <= 0) {
      return null;
    }

    return buildContextUsageBarSegments(
      report.slices,
      report.contextWindowSize,
      report.totalTokens,
    );
  }, [report]);

  if (loading && !report) {
    return (
      <div
        className="flex min-w-0 w-full flex-col gap-0.5"
        data-testid="context-usage-bar-loading"
        aria-hidden
      >
        <div className="h-1.5 w-full animate-pulse rounded-full bg-gray-200" />
        <div className="h-2.5 w-16 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (!report) {
    return (
      <span className="text-gray-400" data-testid="context-usage-bar-empty">
        Context —
      </span>
    );
  }

  const ariaLabel = buildAriaLabel(report);

  return (
    <button
      type="button"
      className={`group flex min-w-0 w-full flex-col gap-0.5 text-left transition-opacity hover:opacity-90 ${
        active ? 'opacity-100' : ''
      }`}
      onClick={onOpen}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={ariaLabel}
      data-testid="context-usage-bar"
    >
      <span className="flex items-center gap-1.5">
        <span className="shrink-0 text-gray-400">Context</span>
        <span
          className={`font-medium text-gray-600 ${compact ? 'text-[10px]' : 'text-[10px]'}`}
          data-testid="context-usage-bar-label"
        >
          {formatContextTokenCount(report.totalTokens)}
          <span className="font-normal text-gray-400">
            {' '}
            / {formatContextTokenCount(report.contextWindowSize)}
          </span>
          <span className="ml-1 text-gray-500">· {report.percentFull}%</span>
        </span>
      </span>

      <span
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200/80 transition-shadow group-hover:ring-gray-300"
        data-testid="context-usage-bar-track"
        aria-hidden
      >
        <span
          className="absolute inset-y-0 left-0 flex overflow-hidden rounded-full"
          style={{ width: `${snapshot?.usedPercent ?? 0}%` }}
        >
          {snapshot?.segments.map((segment) => (
            <span
              key={segment.category}
              className="h-full shrink-0"
              style={{
                width: `${segment.usedPercent}%`,
                backgroundColor: segment.color,
              }}
              title={`${segment.legendLabel}: ${formatContextTokenCount(segment.tokens)}`}
              data-testid={`context-usage-bar-segment-${segment.category}`}
            />
          ))}
        </span>
      </span>
    </button>
  );
}
