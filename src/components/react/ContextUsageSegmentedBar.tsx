'use client';

import React, { useMemo } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatContextTokenCount } from '@/lib/context-usage';
import { buildContextUsageBarSegments } from '@/lib/context-usage-segments';
import type { ContextUsageSlice, ContextUsageSource } from '@/lib/context-usage-types';

interface ContextUsageSegmentedBarProps {
  slices: ContextUsageSlice[];
  contextWindowSize: number;
  totalTokens: number;
  percentFull: number;
  source?: ContextUsageSource;
  showLegend?: boolean;
}

function formatPercent(value: number): string {
  if (value >= 10) {
    return `${Math.round(value)}%`;
  }
  if (value >= 1) {
    return `${value.toFixed(1)}%`;
  }
  return `${value.toFixed(2)}%`;
}

function SegmentTooltipContent({
  legendLabel,
  tokens,
  windowPercent,
  usedPercent,
  description,
  detail,
  approximate,
}: {
  legendLabel: string;
  tokens: number;
  windowPercent: number;
  usedPercent: number;
  description?: string;
  detail?: string;
  approximate?: boolean;
}): React.ReactElement {
  return (
    <div className="max-w-xs space-y-1">
      <p className="font-medium text-white">{legendLabel}</p>
      <p className="text-gray-300">
        {approximate ? '~' : ''}
        {formatContextTokenCount(tokens)} tokens
      </p>
      <p className="text-gray-400">
        {formatPercent(windowPercent)} of window · {formatPercent(usedPercent)} of used
      </p>
      {detail ? <p className="text-gray-400">{detail}</p> : null}
      {description ? <p className="text-gray-400">{description}</p> : null}
    </div>
  );
}

export default function ContextUsageSegmentedBar({
  slices,
  contextWindowSize,
  totalTokens,
  percentFull,
  source = 'sdk_checkpoint',
  showLegend = true,
}: ContextUsageSegmentedBarProps) {
  const snapshot = useMemo(
    () => buildContextUsageBarSegments(slices, contextWindowSize, totalTokens),
    [contextWindowSize, slices, totalTokens],
  );

  const approximate = source !== 'sdk_checkpoint';

  if (snapshot.segments.length === 0 && totalTokens === 0) {
    return (
      <div
        className="w-full rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400"
        data-testid="context-usage-segmented-bar-empty"
      >
        No context data
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="w-full space-y-3" data-testid="context-usage-segmented-bar">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <p className="font-medium text-gray-900">
            <span data-testid="context-usage-segmented-bar-percent">{percentFull}%</span>
            <span className="font-normal text-gray-500"> full</span>
          </p>
          <p className="text-gray-500" data-testid="context-usage-segmented-bar-summary">
            {approximate ? '~' : ''}
            {formatContextTokenCount(totalTokens)}
            <span className="text-gray-400"> / </span>
            {formatContextTokenCount(contextWindowSize)}
          </p>
        </div>

        <div
          className="h-4 w-full overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200/80"
          data-testid="context-usage-segmented-bar-track"
          role="img"
          aria-label={`Context window ${percentFull}% full`}
        >
          <div
            className="flex h-full min-w-0 overflow-hidden rounded-full"
            style={{ width: `${snapshot.usedPercent}%` }}
          >
            {snapshot.segments.map((segment) => (
              <Tooltip key={segment.category}>
                <TooltipTrigger asChild>
                  <span
                    className="h-full min-w-[2px] shrink-0 cursor-default transition-opacity hover:opacity-90"
                    style={{
                      width: `${segment.usedPercent}%`,
                      backgroundColor: segment.color,
                    }}
                    data-testid={`context-usage-segmented-bar-segment-${segment.category}`}
                    aria-label={`${segment.legendLabel}: ${formatContextTokenCount(segment.tokens)}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <SegmentTooltipContent
                    legendLabel={segment.legendLabel}
                    tokens={segment.tokens}
                    windowPercent={segment.windowPercent}
                    usedPercent={segment.usedPercent}
                    description={segment.description}
                    detail={segment.detail}
                    approximate={approximate}
                  />
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {showLegend ? (
          <ul
            className="grid w-full grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2"
            data-testid="context-usage-segmented-bar-legend"
          >
            {snapshot.segments.map((segment) => (
              <li
                key={segment.category}
                className="flex min-w-0 items-center gap-2 text-xs text-gray-600"
                data-testid={`context-usage-segmented-bar-legend-${segment.category}`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate" title={segment.legendLabel}>
                  {segment.legendLabel}
                </span>
                <span className="shrink-0 tabular-nums text-gray-500">
                  {approximate ? '~' : ''}
                  {formatContextTokenCount(segment.tokens)}
                </span>
                <span className="shrink-0 tabular-nums text-gray-400">
                  {formatPercent(segment.windowPercent)}
                </span>
              </li>
            ))}
            {snapshot.freeTokens > 0 ? (
              <li
                className="flex min-w-0 items-center gap-2 text-xs text-gray-600"
                data-testid="context-usage-segmented-bar-legend-free"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-gray-200" aria-hidden />
                <span className="min-w-0 flex-1 truncate">Free</span>
                <span className="shrink-0 tabular-nums text-gray-500">
                  {formatContextTokenCount(snapshot.freeTokens)}
                </span>
                <span className="shrink-0 tabular-nums text-gray-400">
                  {formatPercent(snapshot.freePercent)}
                </span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
