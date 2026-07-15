import type { ComposioMcpServerBinding } from './composio-mcp-bridge';

/**
 * Baseline integration access contract — injected on every chat dispatch so the
 * agent knows how harness slots are reached before any slot is selected.
 */
export function buildIntegrationBaselineContract(): string {
  return [
    'Harness integration access model:',
    '1. Primary path — Composio MCP: when the operator connected a slot in Settings (Connected badge), this run may inject composio-* MCP servers. Use GetMcpTools and CallMcpTool on those servers for live Jira, Confluence, GitHub, and related toolkit actions. OAuth in Settings is the trust boundary; do not ask the operator to approve MCP calls via Cursor IDE or Composer — that UI does not exist in this headless embed.',
    '2. Secondary paths (valid, not deprecated): integration manifests under .business/integrations/{provider}/ declare channel.type (api, cli, mcp, manual). When MCP is unavailable, the slot is not Composio-backed, or the task fits the manifest handler better, use REST env tokens (e.g. CONFLUENCE_API_TOKEN), CLI (e.g. gh), or playbooks (pb.integrations.*) per the provider YAML.',
    '3. Readiness: trust live OAuth/keychain state and GET /api/runtime/readiness — not business.yaml status: pending alone. Composio Connected overrides manual secret gates for that slot.',
    '4. Scope: the operator selects active integration slots in the chat composer; Composio MCP injects only for selected slots that are Connected.',
  ].join(' ');
}

export function buildIntegrationSlotContext(
  slots: string[],
  composioBindings: Record<string, ComposioMcpServerBinding> | undefined,
): string {
  const lines = [
    buildIntegrationBaselineContract(),
    `Active integration slots for this message: ${slots.join(', ')}.`,
  ];

  if (composioBindings && Object.keys(composioBindings).length > 0) {
    const serverKeys = Object.keys(composioBindings).join(', ');
    lines.push(
      `Composio MCP is wired for this run (servers: ${serverKeys}). Prefer MCP tools on these servers for the selected connected slots. Fall back to manifest channel handlers only when MCP cannot satisfy the request.`,
    );
  } else if (slots.length > 0) {
    lines.push(
      'No Composio MCP session for this run — selected slot(s) are not Connected via OAuth or COMPOSIO_API_KEY is missing. Use secondary paths from integration manifests or prompt the operator to Connect in Settings.',
    );
  }

  return lines.join(' ');
}
