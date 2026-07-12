import type { ChatMessage } from './runtime-hub-types';
import { formatSubagentDisplayName } from './sdk-context-usage-decode';
import type {
  ContextUsageCategory,
  ContextUsageDetailItem,
  ContextUsageReport,
  ContextUsageSlice,
  InstructionCorpusEntry,
  InstructionCorpusSnapshot,
  RuntimeOverheadEstimate,
  SdkContextUsagePayload,
} from './context-usage-types';

export const DEFAULT_CONTEXT_WINDOW_SIZE = 200_000;

export const CONTEXT_USAGE_COLORS: Record<string, string> = {
  system_prompt: '#9ca3af',
  tool_definitions: '#8b5cf6',
  rules: '#34d399',
  skills: '#f59e0b',
  mcp_tools: '#22d3ee',
  subagent_definitions: '#60a5fa',
  conversation: '#e07a5f',
  prompt_injections: '#a78bfa',
  summarized_conversation: '#fb7185',
};

export const CONTEXT_CATEGORY_DESCRIPTIONS: Partial<Record<ContextUsageSlice['category'], string>> = {
  system_prompt:
    'The system prompt is the set of instructions the runtime provides to an agent at the start of every chat. It defines tone, ground rules, and how tools should be used.',
  tool_definitions:
    'Tool definitions describe everything the agent can do — read files, run commands, search the web, invoke MCP tools. Each definition consumes context window tokens.',
  rules:
    'Rules are always-injected workspace instructions (.cursor/rules, memories) that constrain agent behavior for this project.',
  skills:
    'Skills and commands are on-invocation instruction packs the agent can load when a workflow stage requires them.',
  mcp_tools:
    'MCP and dynamic tools are externally connected capabilities whose schemas are injected into the context window.',
  subagent_definitions:
    'Subagent definitions describe delegated agents (Task tool, specialized reviewers) available to the runtime.',
  conversation:
    'Conversation is the cumulative user and assistant transcript for this session, including tool results materialized in the thread.',
};

const SDK_CATEGORY_MAP: Record<string, ContextUsageSlice['category']> = {
  system_prompt: 'system_prompt',
  tools: 'tool_definitions',
  rules: 'rules',
  skills: 'skills',
  mcp: 'mcp_tools',
  subagents: 'subagent_definitions',
  summarized_conversation: 'conversation',
  conversation: 'conversation',
};

function estimateTokensFromText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function estimateMessageTokens(message: ChatMessage): number {
  let total = estimateTokensFromText(message.content);
  if (message.toolInput) {
    total += estimateTokensFromText(message.toolInput);
  }
  if (message.toolOutput) {
    total += estimateTokensFromText(message.toolOutput);
  }
  if (message.parts) {
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) {
        total += estimateTokensFromText(part.text);
      }
    }
  }
  return total;
}

function topEntriesByScope(
  corpus: InstructionCorpusSnapshot,
  scope: string,
  limit = 8,
): ContextUsageDetailItem[] {
  return corpus.entries
    .filter((entry) => entry.scope === scope)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, limit)
    .map((entry) => corpusEntryToDetailItem(entry));
}

function corpusEntryToDetailItem(
  entry: InstructionCorpusEntry,
  sdkTokens?: number,
): ContextUsageDetailItem {
  const fileName = entry.path.split('/').pop() ?? entry.path;
  const displayName = entry.title?.trim() || fileName.replace(/\.(mdc|md)$/i, '');

  return {
    name: displayName,
    tokens: sdkTokens ?? entry.tokens,
    path: entry.path,
    scope: entry.scope,
    loadContext: entry.loadContext,
    description: entry.description,
    contentPreview: entry.contentPreview,
    tokenSource: sdkTokens === undefined ? 'corpus_estimate' : 'sdk_matched',
  };
}

function isGenericSdkInstructionLabel(label: string): boolean {
  const normalized = label.trim();
  return /^(?:Rule|Skill|Subagent|Memory|Command|Agent) \d+$/i.test(normalized);
}

function corpusScopesForCategory(
  category: ContextUsageCategory,
): string[] | undefined {
  const scopeByCategory: Partial<Record<ContextUsageCategory, string[]>> = {
    rules: ['.cursor/rules', '.cursor/memories'],
    skills: ['.cursor/skills', '.cursor/commands'],
  };

  return scopeByCategory[category];
}

function matchSdkChildrenToCorpus(
  sdkChildren: Array<{ id?: string; label?: string; tokens: number }>,
  corpusEntries: InstructionCorpusEntry[],
): ContextUsageDetailItem[] {
  const sortedSdk = [...sdkChildren].sort((left, right) => right.tokens - left.tokens);
  const availableCorpus = [...corpusEntries].sort((left, right) => right.tokens - left.tokens);
  const usedCorpusIndexes = new Set<number>();
  const matchedResults: ContextUsageDetailItem[] = [];
  const unmatchedSdk: Array<{ id?: string; label?: string; tokens: number }> = [];

  for (const sdkChild of sortedSdk) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < availableCorpus.length; index += 1) {
      if (usedCorpusIndexes.has(index)) {
        continue;
      }

      const corpusEntry = availableCorpus[index];
      const distance = Math.abs(corpusEntry.tokens - sdkChild.tokens);
      const tolerance = Math.max(64, Math.round(sdkChild.tokens * 0.25));

      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0) {
      usedCorpusIndexes.add(bestIndex);
      const matched = corpusEntryToDetailItem(availableCorpus[bestIndex], sdkChild.tokens);
      matched.sdkTag = sdkChild.id;
      matchedResults.push(matched);
      continue;
    }

    unmatchedSdk.push(sdkChild);
  }

  const unmatchedCorpus = availableCorpus
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !usedCorpusIndexes.has(index))
    .sort((left, right) => right.entry.tokens - left.entry.tokens)
    .map(({ entry }) => entry);

  const salvageCount = Math.min(unmatchedSdk.length, unmatchedCorpus.length);
  const salvagedResults: ContextUsageDetailItem[] = [];

  for (let index = 0; index < salvageCount; index += 1) {
    const sdkChild = unmatchedSdk[index];
    const corpusEntry = unmatchedCorpus[index];
    const salvaged = corpusEntryToDetailItem(corpusEntry, sdkChild.tokens);
    salvaged.sdkTag = sdkChild.id;
    salvagedResults.push(salvaged);
  }

  const unresolvedResults = unmatchedSdk.slice(salvageCount).map((sdkChild) => ({
    name: sdkChild.label?.trim() || 'Injected instruction',
    tokens: sdkChild.tokens,
    sdkTag: sdkChild.id,
    tokenSource: 'sdk' as const,
    loadContext: 'runtime_injected',
    description:
      'This instruction is present in the runtime checkpoint but could not be matched to a workspace file.',
  }));

  return [...matchedResults, ...salvagedResults, ...unresolvedResults].sort(
    (left, right) => right.tokens - left.tokens,
  );
}

function enrichCategoryChildren(
  category: ContextUsageCategory,
  sdkChildren: Array<{ id?: string; label?: string; tokens: number }> | undefined,
  corpus: InstructionCorpusSnapshot,
): ContextUsageDetailItem[] | undefined {
  const scopes = corpusScopesForCategory(category);
  if (!scopes) {
    return undefined;
  }

  const corpusEntries = corpus.entries.filter((entry) => scopes.includes(entry.scope));
  if (corpusEntries.length === 0) {
    return undefined;
  }

  if (!sdkChildren || sdkChildren.length === 0) {
    return corpusEntries
      .sort((left, right) => right.tokens - left.tokens)
      .map((entry) => corpusEntryToDetailItem(entry));
  }

  const labelsNeedEnrichment = sdkChildren.every(
    (child) => isGenericSdkInstructionLabel(child.label ?? '') || !child.label?.includes('/'),
  );

  if (!labelsNeedEnrichment) {
    return sdkChildren.map((child) => ({
      name: child.label ?? child.id ?? 'instruction',
      tokens: child.tokens,
      sdkTag: child.id,
      tokenSource: 'sdk' as const,
    }));
  }

  return matchSdkChildrenToCorpus(sdkChildren, corpusEntries);
}

function sumScopeTokens(corpus: InstructionCorpusSnapshot, scopes: string[]): number {
  return corpus.entries
    .filter((entry) => scopes.includes(entry.scope))
    .reduce((sum, entry) => sum + entry.tokens, 0);
}

export function buildContextUsageReport(input: {
  conversationId: string;
  title: string | null;
  messages: ChatMessage[];
  corpus: InstructionCorpusSnapshot;
  overhead: RuntimeOverheadEstimate;
  contextWindowSize?: number;
  agentId?: string | null;
}): ContextUsageReport {
  const contextWindowSize = input.contextWindowSize ?? DEFAULT_CONTEXT_WINDOW_SIZE;

  const conversationTokens = input.messages
    .filter((message) => message.id !== 'welcome')
    .reduce((sum, message) => sum + estimateMessageTokens(message), 0);

  const rulesTokens = sumScopeTokens(input.corpus, ['.cursor/rules', '.cursor/memories']);
  const skillsTokens = sumScopeTokens(input.corpus, ['.cursor/skills', '.cursor/commands']);

  const slices: ContextUsageSlice[] = [
    {
      category: 'conversation',
      label: 'Conversation',
      tokens: conversationTokens,
      color: CONTEXT_USAGE_COLORS.conversation,
      detail: `${input.messages.filter((m) => m.id !== 'welcome').length} messages`,
    },
    {
      category: 'tool_definitions',
      label: 'Tool definitions',
      tokens: input.overhead.toolDefinitionTokens,
      color: CONTEXT_USAGE_COLORS.tool_definitions,
      detail: `${input.overhead.toolCount} tools`,
    },
    {
      category: 'rules',
      label: 'Rules',
      tokens: rulesTokens,
      color: CONTEXT_USAGE_COLORS.rules,
      children: [
        ...topEntriesByScope(input.corpus, '.cursor/rules'),
        ...topEntriesByScope(input.corpus, '.cursor/memories', 4),
      ],
    },
    {
      category: 'skills',
      label: 'Skills',
      tokens: skillsTokens,
      color: CONTEXT_USAGE_COLORS.skills,
      children: [
        ...topEntriesByScope(input.corpus, '.cursor/skills'),
        ...topEntriesByScope(input.corpus, '.cursor/commands', 4),
      ],
    },
    {
      category: 'mcp_tools',
      label: 'MCP & dynamic tools',
      tokens: input.overhead.mcpToolTokens,
      color: CONTEXT_USAGE_COLORS.mcp_tools,
      detail: `${input.overhead.mcpServerCount} servers`,
    },
    {
      category: 'subagent_definitions',
      label: 'Subagent definitions',
      tokens: input.overhead.subagentDefinitionTokens,
      color: CONTEXT_USAGE_COLORS.subagent_definitions,
      detail: `${input.overhead.subagentCount} agents`,
      children: topEntriesByScope(input.corpus, '.cursor/agents'),
    },
    {
      category: 'system_prompt',
      label: 'System prompt',
      tokens: input.overhead.systemPromptTokens,
      color: CONTEXT_USAGE_COLORS.system_prompt,
    },
  ].filter((slice) => slice.tokens > 0)
    .map((slice) => ({
      ...slice,
      description: CONTEXT_CATEGORY_DESCRIPTIONS[slice.category],
      detail:
        slice.detail ??
        (slice.children && slice.children.length > 0
          ? `${slice.children.length} items`
          : undefined),
    }));

  const totalTokens = slices.reduce((sum, slice) => sum + slice.tokens, 0);
  const percentFull = Math.min(100, Math.round((totalTokens / contextWindowSize) * 100));

  return {
    contextWindowSize,
    totalTokens,
    percentFull,
    slices: slices.sort((a, b) => b.tokens - a.tokens),
    repository: input.corpus.repository,
    conversationId: input.conversationId,
    title: input.title,
    updatedAt: new Date().toISOString(),
    tokenizer: input.corpus.tokenizer,
    source: 'estimate',
    agentId: input.agentId ?? null,
  };
}

function topSdkChildren(
  corpus: InstructionCorpusSnapshot,
  category: ContextUsageSlice['category'],
  limit = 8,
): ContextUsageSlice['children'] {
  const scopes = corpusScopesForCategory(category);
  if (!scopes) {
    return undefined;
  }

  return scopes
    .flatMap((scope) =>
      corpus.entries
        .filter((entry) => entry.scope === scope)
        .sort((left, right) => right.tokens - left.tokens)
        .slice(0, limit)
        .map((entry) => corpusEntryToDetailItem(entry)),
    )
    .slice(0, limit);
}

function normalizeRuntimeSystemPromptLabel(label: string): string {
  const normalized = label.trim();
  if (/composer|cursor/i.test(normalized) && /base prompt|system prompt/i.test(normalized)) {
    return 'Runtime base prompt';
  }
  return normalized;
}

function sdkChildToDetailItem(
  category: ContextUsageCategory,
  child: {
    id?: string;
    label?: string;
    tokens: number;
    contentPreview?: string;
    description?: string;
    path?: string;
    scope?: string;
    loadContext?: string;
  },
): ContextUsageDetailItem {
  if (category === 'system_prompt') {
    return {
      name: normalizeRuntimeSystemPromptLabel(child.label ?? 'System prompt'),
      tokens: child.tokens,
      sdkTag: child.id,
      tokenSource: 'sdk',
      loadContext: 'always_injected',
      scope: 'runtime://system_prompt',
      path: 'runtime://system-prompt',
      contentPreview: child.contentPreview,
      description:
        child.description ??
        'Base runtime instructions injected at the start of every agent session.',
    };
  }

  if (category === 'subagent_definitions') {
    const subagentType = child.label ?? 'subagent';
    return {
      name: formatSubagentDisplayName(subagentType),
      tokens: child.tokens,
      sdkTag: child.id,
      tokenSource: 'sdk',
      loadContext: 'runtime_injected',
      scope: 'runtime://subagents',
      path: `cursor://subagent/${subagentType}`,
      contentPreview: child.contentPreview,
      description:
        child.description ?? 'Task-tool subagent definition available to the runtime.',
    };
  }

  return {
    name: child.label ?? child.id ?? 'item',
    tokens: child.tokens,
    sdkTag: child.id,
    tokenSource: 'sdk',
    contentPreview: child.contentPreview,
    description: child.description,
    path: child.path,
    scope: child.scope,
    loadContext: child.loadContext,
  };
}

function resolveCategoryChildren(
  category: ContextUsageCategory,
  sdkChildren:
    | Array<{
        id?: string;
        label?: string;
        tokens: number;
        contentPreview?: string;
        description?: string;
        path?: string;
        scope?: string;
        loadContext?: string;
      }>
    | undefined,
  corpus: InstructionCorpusSnapshot,
): ContextUsageDetailItem[] | undefined {
  const runtimeDetailCategories: ContextUsageCategory[] = [
    'system_prompt',
    'subagent_definitions',
  ];
  const enrichableCategories: ContextUsageCategory[] = ['rules', 'skills'];

  if (sdkChildren && sdkChildren.length > 0) {
    if (runtimeDetailCategories.includes(category)) {
      return sdkChildren.map((child) => sdkChildToDetailItem(category, child));
    }

    if (enrichableCategories.includes(category)) {
      const enriched = enrichCategoryChildren(category, sdkChildren, corpus);
      if (enriched && enriched.length > 0) {
        return enriched;
      }
    }

    return sdkChildren.map((child) => sdkChildToDetailItem(category, child));
  }

  return topSdkChildren(corpus, category);
}

export function buildContextUsageReportFromSdk(input: {
  conversationId: string;
  title: string | null;
  agentId: string;
  corpus: InstructionCorpusSnapshot;
  sdkUsage: SdkContextUsagePayload;
}): ContextUsageReport {
  const flattened = input.sdkUsage.categories;

  const contextWindowSize =
    input.sdkUsage.maxTokens > 0 ? input.sdkUsage.maxTokens : DEFAULT_CONTEXT_WINDOW_SIZE;
  const usedTokens = input.sdkUsage.usedTokens > 0 ? input.sdkUsage.usedTokens : 0;

  const sliceAccumulator = new Map<ContextUsageSlice['category'], ContextUsageSlice>();

  for (const entry of flattened) {
    if (entry.id === 'conversation' && entry.tokens >= usedTokens * 0.95) {
      continue;
    }

    const mappedCategory = SDK_CATEGORY_MAP[entry.id];
    if (!mappedCategory) {
      continue;
    }

    const existing = sliceAccumulator.get(mappedCategory);
    if (existing) {
      existing.tokens += entry.tokens;
      if (
        entry.children &&
        entry.children.length > 0 &&
        (!existing.children || existing.children.length === 0)
      ) {
        existing.children = resolveCategoryChildren(mappedCategory, entry.children, input.corpus);
      }
      continue;
    }

    const childItems =
      resolveCategoryChildren(
        mappedCategory,
        entry.children,
        input.corpus,
      ) ?? undefined;

    sliceAccumulator.set(mappedCategory, {
      category: mappedCategory,
      label: entry.label,
      tokens: entry.tokens,
      color: CONTEXT_USAGE_COLORS[mappedCategory] ?? '#94a3b8',
      description: CONTEXT_CATEGORY_DESCRIPTIONS[mappedCategory],
      detail:
        mappedCategory === 'tool_definitions' && childItems && childItems.length > 0
          ? `${childItems.length} tools`
          : childItems && childItems.length > 0
            ? `${childItems.length} items`
            : undefined,
      children: childItems,
    });
  }

  const categorizedTotal = [...sliceAccumulator.values()].reduce((sum, slice) => sum + slice.tokens, 0);
  const conversationRemainder = Math.max(0, usedTokens - categorizedTotal);

  if (conversationRemainder > 0) {
    const existingConversation = sliceAccumulator.get('conversation');
    if (existingConversation) {
      existingConversation.tokens += conversationRemainder;
    } else {
      sliceAccumulator.set('conversation', {
        category: 'conversation',
        label: 'Conversation',
        tokens: conversationRemainder,
        color: CONTEXT_USAGE_COLORS.conversation,
      });
    }
  }

  const slices = [...sliceAccumulator.values()]
    .filter((slice) => slice.tokens > 0)
    .map((slice) => ({
      ...slice,
      description: slice.description ?? CONTEXT_CATEGORY_DESCRIPTIONS[slice.category],
    }));
  const totalTokens = usedTokens > 0 ? usedTokens : slices.reduce((sum, slice) => sum + slice.tokens, 0);
  const percentFull = Math.min(100, Math.round((totalTokens / contextWindowSize) * 100));

  return {
    contextWindowSize,
    totalTokens,
    percentFull,
    slices: slices.sort((a, b) => b.tokens - a.tokens),
    repository: input.corpus.repository,
    conversationId: input.conversationId,
    title: input.title,
    updatedAt: input.sdkUsage.updatedAt,
    tokenizer: 'cursor-runtime:checkpoint',
    source: 'sdk_checkpoint',
    agentId: input.agentId,
  };
}

export function formatContextTokenCount(tokens: number): string {
  if (tokens <= 0) {
    return '0';
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return String(tokens);
}
