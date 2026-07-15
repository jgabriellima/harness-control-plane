import * as Sentry from '@sentry/astro';
import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { l as listHarnessCommands } from './harness-commands_DUJV9FFj.mjs';
import { p as parseComputerUseTargetMode } from './runtime-computer-use-types_BWl7pttb.mjs';
import { a as appendDispatchLog } from './runtime-dispatch-log_ek1TMBNw.mjs';
import { c as createRequestId, r as runtimeLogger, e as errorFields, i as isDebugLogLevel } from './runtime-run-failure_BzuNxIfC.mjs';
import { o as orchestrateChatDispatch, R as RuntimeGatewayError, m as mapDispatchError, g as gatewayErrorDetail } from './runtime-orchestrator_CdeKZAGP.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';
import { i as isKnownSlashCommand } from './slash-command_Cs3SxFRj.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function parseChatRequest(body) {
  if (!isRecord(body)) {
    throw new RuntimeGatewayError("Request body must be a JSON object", 400, "chat.request.parse", createRequestId());
  }
  const projectId = asString(body.project_id);
  const message = asString(body.message);
  if (!projectId) {
    throw new RuntimeGatewayError("project_id is required", 400, "chat.request.parse", createRequestId());
  }
  if (!message) {
    throw new RuntimeGatewayError("message is required", 400, "chat.request.parse", createRequestId());
  }
  const modeRaw = asString(body.mode);
  const mode = modeRaw === "deep_research" ? "deep_research" : "default";
  const integrationSlots = Array.isArray(body.integration_slots) ? body.integration_slots.filter((item) => typeof item === "string") : void 0;
  const attachments = Array.isArray(body.attachments) ? body.attachments.filter(isRecord).map((item) => ({
    name: asString(item.name) ?? "attachment",
    path: asString(item.path),
    content_type: asString(item.content_type)
  })) : void 0;
  const computerUseEnabled = body.computer_use_enabled === true;
  const computerUseMode = parseComputerUseTargetMode(body.computer_use_mode);
  return {
    conversation_id: asString(body.conversation_id),
    project_id: projectId,
    message,
    attachments,
    mode,
    integration_slots: integrationSlots,
    agent_id: asString(body.agent_id),
    computer_use_enabled: computerUseEnabled,
    computer_use_mode: computerUseEnabled ? computerUseMode ?? void 0 : void 0,
    metadata: isRecord(body.metadata) ? body.metadata : void 0
  };
}
const POST = async ({ request }) => {
  const requestId = createRequestId("chat");
  const startedAt = Date.now();
  return Sentry.startSpan({ name: "POST /api/chat", op: "http.server" }, async () => {
    runtimeLogger.info("chat.request.received", {
      request_id: requestId,
      phase: "chat.request"
    });
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON", 400, {
        request_id: requestId,
        phase: "chat.request.parse"
      });
    }
    try {
      const chatRequest = parseChatRequest(body);
      runtimeLogger.debug("chat.request.parsed", {
        request_id: requestId,
        phase: "chat.request.parse",
        project_id: chatRequest.project_id,
        conversation_id: chatRequest.conversation_id,
        agent_id: chatRequest.agent_id
      });
      const { workspaceRoot } = await resolveRequestWorkspace(request, chatRequest.project_id);
      runtimeLogger.debug("chat.workspace.resolved", {
        request_id: requestId,
        phase: "chat.workspace.resolve",
        project_id: chatRequest.project_id,
        cwd: workspaceRoot
      });
      void appendDispatchLog(
        {
          event: "chat.workspace.resolved",
          request_id: requestId,
          phase: "chat.workspace.resolve",
          project_id: chatRequest.project_id,
          conversation_id: chatRequest.conversation_id,
          cwd: workspaceRoot
        },
        workspaceRoot
      );
      const commands = await listHarnessCommands(workspaceRoot);
      const knownCommands = commands.map((item) => item.command);
      runtimeLogger.debug("chat.commands.loaded", {
        request_id: requestId,
        phase: "chat.commands.load",
        command_count: knownCommands.length
      });
      if (!isKnownSlashCommand(chatRequest.message, knownCommands)) {
        return jsonError(
          "Unknown slash command. Commands are loaded from the harness on each request.",
          400,
          { request_id: requestId, phase: "chat.commands.validate" }
        );
      }
      const result = await orchestrateChatDispatch(chatRequest, workspaceRoot, requestId);
      runtimeLogger.info("chat.response.ok", {
        request_id: requestId,
        run_id: result.run_id,
        agent_id: result.agent_id,
        duration_ms: Date.now() - startedAt
      });
      void appendDispatchLog(
        {
          event: "chat.response.ok",
          request_id: requestId,
          run_id: result.run_id,
          agent_id: result.agent_id,
          conversation_id: result.conversation_id,
          project_id: chatRequest.project_id,
          duration_ms: Date.now() - startedAt
        },
        workspaceRoot
      );
      return jsonOk({ ...result, request_id: requestId });
    } catch (error) {
      Sentry.captureException(error);
      const mapped = error instanceof RuntimeGatewayError ? error : mapDispatchError(error, requestId);
      runtimeLogger.error("chat.response.error", {
        request_id: requestId,
        phase: mapped.phase,
        duration_ms: Date.now() - startedAt,
        status_code: mapped.statusCode,
        ...errorFields(error)
      });
      void appendDispatchLog({
        event: "chat.response.error",
        request_id: requestId,
        phase: mapped.phase,
        duration_ms: Date.now() - startedAt,
        status_code: mapped.statusCode,
        error_name: mapped.name,
        error_message: mapped.message
      });
      return jsonError(mapped.message, mapped.statusCode, {
        request_id: requestId,
        phase: mapped.phase,
        detail: gatewayErrorDetail(mapped) ?? (isDebugLogLevel() && error instanceof Error ? error.stack?.split("\n").slice(0, 4).join("\n") : void 0)
      });
    }
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
