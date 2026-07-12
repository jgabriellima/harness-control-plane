import type { ContextUsageSlice } from '@/lib/context-usage-types';

export interface ContextUsageBarSegment {
  category: string;
  label: string;
  legendLabel: string;
  color: string;
  tokens: number;
  windowPercent: number;
  usedPercent: number;
  description?: string;
  detail?: string;
}

export interface ContextUsageBarSegmentsSnapshot {
  segments: ContextUsageBarSegment[];
  freeTokens: number;
  freePercent: number;
  usedPercent: number;
}

function formatSliceLegendLabel(slice: ContextUsageSlice): string {
  const childCount = slice.children?.length ?? 0;
  const expandableInstructionCategory =
    slice.category === 'rules' ||
    slice.category === 'skills' ||
    slice.category === 'subagent_definitions' ||
    slice.category === 'system_prompt';

  if (
    childCount > 0 &&
    (slice.category === 'tool_definitions' || expandableInstructionCategory)
  ) {
    return `${slice.label} (${childCount})`;
  }

  return slice.label;
}

export function buildContextUsageBarSegments(
  slices: ContextUsageSlice[],
  contextWindowSize: number,
  totalTokens: number,
): ContextUsageBarSegmentsSnapshot {
  const safeWindow = contextWindowSize > 0 ? contextWindowSize : 1;
  const safeUsed = totalTokens > 0 ? totalTokens : 1;

  const segments = slices
    .filter((slice) => slice.tokens > 0)
    .map((slice) => ({
      category: slice.category,
      label: slice.label,
      legendLabel: formatSliceLegendLabel(slice),
      color: slice.color,
      tokens: slice.tokens,
      windowPercent: (slice.tokens / safeWindow) * 100,
      usedPercent: (slice.tokens / safeUsed) * 100,
      description: slice.description,
      detail: slice.detail,
    }));

  const freeTokens = Math.max(0, contextWindowSize - totalTokens);
  const freePercent = (freeTokens / safeWindow) * 100;
  const usedPercent = Math.min(100, (totalTokens / safeWindow) * 100);

  return {
    segments,
    freeTokens,
    freePercent,
    usedPercent,
  };
}
