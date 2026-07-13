'use client';

import React from 'react';
import { defineComponent, createLibrary, type PromptOptions } from '@openuidev/react-lang';
import { z } from 'zod/v4';

import { Markdown } from '@/components/ui/markdown';
import { textLooksLikeMarkdown } from '@/lib/markdown-gfm';
import { JAMBU_OPENUI_SYSTEM_PROMPT } from './system-prompt.generated';

const Stack = defineComponent({
  name: 'Stack',
  description: 'Vertical or horizontal layout container.',
  props: z.object({
    children: z.array(z.any()),
    direction: z.enum(['column', 'row']).optional(),
    gap: z.enum(['xs', 's', 'm', 'l']).optional(),
  }),
  component: ({ props, renderNode }) => (
    <div
      className={`flex ${props.direction === 'row' ? 'flex-row' : 'flex-col'} gap-${
        props.gap === 'xs' ? '1' : props.gap === 'l' ? '6' : props.gap === 'm' ? '4' : '2'
      }`}
    >
      {renderNode(props.children)}
    </div>
  ),
});

const Section = defineComponent({
  name: 'Section',
  description: 'Grouped content with optional title.',
  props: z.object({
    title: z.string().optional(),
    children: z.array(z.any()),
  }),
  component: ({ props, renderNode }) => (
    <section className="space-y-2">
      {props.title ? <h3 className="text-sm font-semibold text-gray-800">{props.title}</h3> : null}
      {renderNode(props.children)}
    </section>
  ),
});

const Card = defineComponent({
  name: 'Card',
  description: 'Bordered content panel.',
  props: z.object({
    children: z.array(z.any()),
    emphasis: z.enum(['low', 'medium', 'high']).optional(),
  }),
  component: ({ props, renderNode }) => {
    const emphasisClass =
      props.emphasis === 'high'
        ? 'border-blue-200 bg-blue-50'
        : props.emphasis === 'low'
          ? 'border-gray-100 bg-gray-50'
          : 'border-gray-200 bg-white';
    return (
      <div className={`rounded-lg border p-4 shadow-sm ${emphasisClass}`}>{renderNode(props.children)}</div>
    );
  },
});

const Heading = defineComponent({
  name: 'Heading',
  description: 'Section heading.',
  props: z.object({
    text: z.string(),
    level: z.enum(['1', '2', '3']).optional(),
  }),
  component: ({ props }) => {
    const level = props.level ?? '2';
    if (level === '1') return <h1 className="text-xl font-semibold text-gray-900">{props.text}</h1>;
    if (level === '3') return <h3 className="text-sm font-semibold text-gray-800">{props.text}</h3>;
    return <h2 className="text-lg font-semibold text-gray-900">{props.text}</h2>;
  },
});

const Text = defineComponent({
  name: 'Text',
  description: 'Body copy paragraph.',
  props: z.object({
    text: z.string(),
    intent: z.enum(['neutral', 'positive', 'warning', 'critical']).optional(),
  }),
  component: ({ props }) => {
    const intentClass =
      props.intent === 'positive'
        ? 'text-emerald-700'
        : props.intent === 'warning'
          ? 'text-amber-700'
          : props.intent === 'critical'
            ? 'text-red-700'
            : 'text-gray-700';

    if (textLooksLikeMarkdown(props.text)) {
      return (
        <div className={`text-sm leading-relaxed ${intentClass}`}>
          <Markdown>{props.text}</Markdown>
        </div>
      );
    }

    return <p className={`text-sm leading-relaxed ${intentClass}`}>{props.text}</p>;
  },
});

const Metric = defineComponent({
  name: 'Metric',
  description: 'Single KPI with label and value.',
  props: z.object({
    label: z.string(),
    value: z.string(),
    trend: z.enum(['up', 'down', 'flat']).optional(),
  }),
  component: ({ props }) => (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-gray-500">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{props.value}</div>
      {props.trend ? (
        <div className="text-xs text-gray-500">Trend: {props.trend}</div>
      ) : null}
    </div>
  ),
});

const Callout = defineComponent({
  name: 'Callout',
  description: 'Highlighted note or alert.',
  props: z.object({
    text: z.string(),
    intent: z.enum(['neutral', 'positive', 'warning', 'critical']).optional(),
  }),
  component: ({ props }) => {
    const styles =
      props.intent === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : props.intent === 'critical'
          ? 'border-red-200 bg-red-50 text-red-900'
          : props.intent === 'positive'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-gray-200 bg-gray-50 text-gray-800';
    return <div className={`rounded-md border px-3 py-2 text-sm ${styles}`}>{props.text}</div>;
  },
});

const Table = defineComponent({
  name: 'Table',
  description: 'Tabular data with column headers and row values.',
  props: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    density: z.enum(['compact', 'comfortable']).optional(),
  }),
  component: ({ props }) => {
    const cellPadding = props.density === 'compact' ? 'px-2 py-1' : 'px-3 py-2';
    return (
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              {props.columns.map((column) => (
                <th key={column} className={cellPadding}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.slice(0, 50).map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="border-t border-gray-100">
                {row.map((cell, cellIndex) => (
                  <td key={`cell-${rowIndex}-${cellIndex}`} className={cellPadding}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
});

const RankedList = defineComponent({
  name: 'RankedList',
  description: 'Ordered list with rank, title, and optional value.',
  props: z.object({
    items: z.array(
      z.object({
        rank: z.number(),
        title: z.string(),
        value: z.string().optional(),
      }),
    ),
  }),
  component: ({ props }) => (
    <ol className="space-y-2">
      {props.items.slice(0, 20).map((item) => (
        <li
          key={`${item.rank}-${item.title}`}
          className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
              {item.rank}
            </span>
            <span className="text-sm text-gray-900">{item.title}</span>
          </div>
          {item.value ? <span className="text-sm font-medium text-gray-700">{item.value}</span> : null}
        </li>
      ))}
    </ol>
  ),
});

const BarChart = defineComponent({
  name: 'BarChart',
  description: 'Simple bar chart for categorical comparisons.',
  props: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
    title: z.string().optional(),
  }),
  component: ({ props }) => {
    const pairs = props.labels
      .slice(0, 24)
      .map((label, index) => ({ label, value: props.values[index] ?? 0 }));
    const max = Math.max(...pairs.map((pair) => pair.value), 1);

    return (
      <div className="space-y-2">
        {props.title ? <div className="text-sm font-medium text-gray-800">{props.title}</div> : null}
        <div className="space-y-2">
          {pairs.map((pair) => (
            <div key={pair.label} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate text-gray-600">{pair.label}</span>
              <div className="h-2 rounded bg-gray-100">
                <div
                  className="h-2 rounded bg-blue-500"
                  style={{ width: `${Math.round((pair.value / max) * 100)}%` }}
                />
              </div>
              <span className="font-medium text-gray-800">{pair.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  },
});

export const jambuOpenUILibrary = createLibrary({
  root: 'Stack',
  componentGroups: [
    {
      name: 'Layout',
      components: ['Stack', 'Section', 'Card'],
      notes: ['Use Stack as root. Prefer column direction unless comparing metrics side-by-side.'],
    },
    {
      name: 'Typography',
      components: ['Heading', 'Text', 'Callout'],
    },
    {
      name: 'Data display',
      components: ['Metric', 'Table', 'RankedList'],
      notes: ['Never fabricate data. Use only values present in the user request or tool results.'],
    },
    {
      name: 'Visualization',
      components: ['BarChart'],
      notes: ['labels and values arrays must be equal length. Max 24 points.'],
    },
  ],
  components: [Stack, Section, Card, Heading, Text, Metric, Callout, Table, RankedList, BarChart],
});

export const jambuOpenUIPromptOptions: PromptOptions = {
  preamble:
    'You are the Jambu runtime assistant. When response mode is OpenUI, emit prose plus a fenced OpenUI Lang block.',
  additionalRules: [
    'Wrap OpenUI Lang in a ```openui-lang fence. Keep explanatory prose outside the fence.',
    'Use only components from the library. Never emit HTML, JSX, CSS, or invented components.',
    'Prefer plain text for short answers. Use OpenUI for metrics, tables, charts, and ranked lists.',
    'Represent loading, empty, and error states with Callout and Text — never invent placeholder data.',
    'BarChart labels and values must match length and reflect provided data only.',
  ],
  examples: [
    'Here is the workspace summary.\n\n```openui-lang\nroot = Stack([heading, metrics, chart, ranks], "column", "m")\nheading = Heading("Workspace activity", "2")\nmetrics = Stack([m1, m2], "row", "s")\nm1 = Metric("Active runs", "3", "up")\nm2 = Metric("Failed checks", "1", "flat")\nchart = BarChart(["Mon", "Tue", "Wed"], [4, 6, 3], "Runs by day")\nranks = RankedList([{rank: 1, title: "chat.fanout", value: "12"}, {rank: 2, title: "build", value: "7"}])\n```',
  ],
  inlineMode: true,
  toolCalls: false,
  bindings: false,
};

export function getOpenUISystemPrompt(): string {
  return JAMBU_OPENUI_SYSTEM_PROMPT;
}

export function measureOpenUIPromptOverhead(): { characters: number; estimatedTokens: number } {
  const prompt = JAMBU_OPENUI_SYSTEM_PROMPT;
  return {
    characters: prompt.length,
    estimatedTokens: Math.ceil(prompt.length / 4),
  };
}
