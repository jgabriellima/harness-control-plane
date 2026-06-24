'use client';

import React from 'react';

import type { ConversationEventSlice } from '@/lib/conversation-metrics';

interface EventDistributionChartProps {
  slices: ConversationEventSlice[];
  size?: number;
}

function buildPiePaths(
  slices: ConversationEventSlice[],
  size: number,
): Array<{ role: string; d: string; color: string }> {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  if (total === 0) {
    return [];
  }

  const radius = size / 2;
  const center = radius;
  let startAngle = -Math.PI / 2;
  const paths: Array<{ role: string; d: string; color: string }> = [];

  for (const slice of slices) {
    const angle = (slice.count / total) * Math.PI * 2;
    const endAngle = startAngle + angle;

    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    const largeArc = angle > Math.PI ? 1 : 0;
    const d = [
      `M ${center} ${center}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      'Z',
    ].join(' ');

    paths.push({ role: slice.role, d, color: slice.color });
    startAngle = endAngle;
  }

  return paths;
}

export default function EventDistributionChart({
  slices,
  size = 16,
}: EventDistributionChartProps) {
  const paths = buildPiePaths(slices, size);

  if (paths.length === 0) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        aria-hidden
        data-testid="event-distribution-chart-empty"
      >
        <circle cx={size / 2} cy={size / 2} r={size / 2} fill="#e5e7eb" />
      </svg>
    );
  }

  const label = slices.map((slice) => `${slice.role} ${slice.count}`).join(', ');

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label={`Event distribution: ${label}`}
      data-testid="event-distribution-chart"
    >
      {paths.map((path) => (
        <path key={path.role} d={path.d} fill={path.color} />
      ))}
    </svg>
  );
}
