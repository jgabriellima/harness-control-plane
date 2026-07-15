export interface RunErrorDiagnosticInput {
  message: string;
  rawMessage?: string | null;
  traceId?: string | null;
  runId?: string | null;
  errorCode?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  agentId?: string | null;
}

export function buildRunErrorDiagnosticText(input: RunErrorDiagnosticInput): string {
  const lines: string[] = [];
  const sourceText = input.rawMessage?.trim() || input.message.trim();
  if (sourceText) {
    lines.push(sourceText, '');
  }

  lines.push(
    'Harness run error diagnostics',
    `trace_id: ${input.traceId ?? 'n/a'}`,
    `run_id: ${input.runId ?? input.traceId ?? 'n/a'}`,
    `error_code: ${input.errorCode ?? 'n/a'}`,
    `project_id: ${input.projectId ?? 'n/a'}`,
    `conversation_id: ${input.conversationId ?? 'n/a'}`,
    `assistant_message_id: ${input.assistantMessageId ?? 'n/a'}`,
    `agent_id: ${input.agentId ?? 'n/a'}`,
  );

  return lines.join('\n');
}
