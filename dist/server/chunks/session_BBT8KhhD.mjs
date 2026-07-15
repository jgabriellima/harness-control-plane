import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { loadComputerUseStatus, isComputerUseContractEnabled } from './runtime-computer-use-preferences_NdHwuD2F.mjs';
import { l as loadComputerUseSession, s as saveComputerUseSession } from './runtime-computer-use-sessions_B-gZt_T7.mjs';
import { p as parseComputerUseTargetMode } from './runtime-computer-use-types_BWl7pttb.mjs';
import { r as runSandboxPreflight } from './runtime-computer-use-sandbox-preflight_Dtw4JMaM.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const GET = async ({ request, url }) => {
  const conversationId = url.searchParams.get("conversation_id")?.trim();
  if (!conversationId) {
    return jsonError("conversation_id is required", 400);
  }
  try {
    const projectId = url.searchParams.get("project_id")?.trim() || void 0;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const [capability, contractEnabled, session] = await Promise.all([
      loadComputerUseStatus(workspaceRoot),
      isComputerUseContractEnabled(workspaceRoot),
      loadComputerUseSession(conversationId, workspaceRoot)
    ]);
    const sandboxPreflight = contractEnabled ? await runSandboxPreflight({ local: true }) : null;
    return jsonOk({
      conversation_id: conversationId,
      enabled: session.enabled,
      mode: session.mode,
      updated_at: session.updatedAt,
      capability_available: capability.active,
      capability_ready: capability.setup.ready,
      contract_enabled: contractEnabled,
      sandbox_available: contractEnabled,
      sandbox_preflight: sandboxPreflight,
      sandbox_ready: contractEnabled && sandboxPreflight?.ok === true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load computer-use session";
    return jsonError(message, 500);
  }
};
const PATCH = async ({ request }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }
  if (!isRecord(body)) {
    return jsonError("Request body must be a JSON object", 400);
  }
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";
  if (!conversationId) {
    return jsonError("conversation_id is required", 400);
  }
  if (typeof body.enabled !== "boolean") {
    return jsonError("enabled must be a boolean", 400);
  }
  const mode = parseComputerUseTargetMode(body.mode);
  try {
    const projectId = typeof body.project_id === "string" ? body.project_id.trim() : void 0;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    if (body.enabled) {
      const targetMode = mode ?? "host";
      if (targetMode === "host") {
        const capability = await loadComputerUseStatus(workspaceRoot);
        if (!capability.active) {
          return jsonError(
            "My computer requires Computer Use setup in Settings first",
            409
          );
        }
      } else {
        const contractEnabled = await isComputerUseContractEnabled(workspaceRoot);
        if (!contractEnabled) {
          return jsonError(
            "Sandbox mode requires runtime.computer_use in workspace business.yaml",
            409
          );
        }
        const preflight = await runSandboxPreflight({ local: true });
        if (!preflight.ok) {
          return jsonError(preflight.summary ?? "Sandbox pre-flight failed", 503, {
            phase: "preflight",
            detail: JSON.stringify({ checks: preflight.checks, primaryFailureKind: preflight.primaryFailureKind })
          });
        }
      }
    }
    const session = await saveComputerUseSession(
      conversationId,
      body.enabled,
      workspaceRoot,
      body.enabled ? mode ?? "host" : null
    );
    return jsonOk({
      conversation_id: conversationId,
      enabled: session.enabled,
      mode: session.mode,
      updated_at: session.updatedAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save computer-use session";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  PATCH
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
