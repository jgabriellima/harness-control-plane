import * as Sentry from '@sentry/astro';
import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { r as resolveProjectWorkspaceRoot } from './workspace-manager_C2YuGzrP.mjs';
import { a as loadBusinessConfig, l as listExecutions } from './harness-reader_xurzrbMU.mjs';

const DEFAULT_RUNTIME = "agent";
function generateExecutionId() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const suffix = Math.random().toString(36).slice(2, 10);
  return `run-exec-${stamp}-${suffix}`;
}
function resolveDefaultWorkflow(config) {
  const execution = config.execution;
  if (!execution) {
    return void 0;
  }
  return execution.defaultWorkflow ?? execution.default_workflow;
}
async function listWorkflowIds(workflowsDir) {
  let entries;
  try {
    entries = await readdir(workflowsDir);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => entry.endsWith(".yaml")).map((entry) => entry.slice(0, -".yaml".length)).sort();
}
async function resolveWorkflowId(requestedWorkflowId, config, workflowsDir) {
  if (requestedWorkflowId) {
    return requestedWorkflowId;
  }
  const configured = resolveDefaultWorkflow(config);
  if (configured) {
    return configured;
  }
  const workflows = await listWorkflowIds(workflowsDir);
  if (workflows.length === 0) {
    throw new Error("No runnable workflow configured. Add a workflow DSL under the harness workflows directory.");
  }
  return workflows[0];
}
async function buildExecutionJob(request) {
  const workspaceRoot = request.project_id ? resolveProjectWorkspaceRoot(request.project_id) : void 0;
  const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
  const config = await loadBusinessConfig(binding.workspaceRoot);
  const workflowId = await resolveWorkflowId(request.workflow_id, config, binding.workflowsDir);
  return {
    execution_id: request.execution_id ?? generateExecutionId(),
    tenant_id: request.tenant_id ?? null,
    project_id: request.project_id,
    user_id: request.user_id ?? null,
    runtime: request.runtime ?? DEFAULT_RUNTIME,
    objective: request.objective,
    workflow_id: workflowId,
    metadata: request.metadata ?? {}
  };
}
async function dispatchExecutionJob(job) {
  return Sentry.startSpan(
    {
      name: "dispatchExecutionJob",
      op: "harness.dispatch",
      attributes: {
        execution_id: job.execution_id,
        workflow_id: job.workflow_id,
        project_id: job.project_id
      }
    },
    async () => {
      const workspaceRoot = job.project_id ? resolveProjectWorkspaceRoot(job.project_id) : void 0;
      const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
      const workflows = await listWorkflowIds(binding.workflowsDir);
      if (!workflows.includes(job.workflow_id)) {
        throw new Error(`Workflow not found: ${job.workflow_id}`);
      }
      const child = spawn(
        "python3",
        [
          binding.runnerScript,
          "run",
          "--workflow",
          job.workflow_id,
          "--intent",
          job.objective,
          "--run-id",
          job.execution_id,
          "--mode",
          job.runtime === "stub" ? "stub" : "agent"
        ],
        {
          cwd: binding.workspaceRoot,
          detached: true,
          stdio: "ignore"
        }
      );
      child.unref();
      child.on("error", (error) => {
        Sentry.captureException(error);
      });
      return {
        execution_id: job.execution_id,
        status: "QUEUED",
        run_id: job.execution_id,
        workflow_id: job.workflow_id
      };
    }
  );
}

class GatewayError extends Error {
  statusCode;
  constructor(message, statusCode) {
    super(message);
    this.name = "GatewayError";
    this.statusCode = statusCode;
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function normalizeMetadata(value) {
  return isRecord(value) ? value : {};
}
function isConversationRequest(value) {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.message === "string";
}
function parseExecutionRequest(body) {
  if (!isRecord(body)) {
    throw new GatewayError("Request body must be a JSON object", 400);
  }
  if (isConversationRequest(body)) {
    const projectId2 = asString(body.project_id);
    const message = asString(body.message);
    if (!projectId2) {
      throw new GatewayError("project_id is required", 400);
    }
    if (!message) {
      throw new GatewayError("message is required", 400);
    }
    return {
      execution_id: asString(body.conversation_id),
      project_id: projectId2,
      objective: message,
      workflow_id: asString(body.workflow_id),
      runtime: asString(body.runtime) ?? asString(body.execution_profile),
      metadata: normalizeMetadata(body.metadata)
    };
  }
  const projectId = asString(body.project_id);
  const objective = asString(body.objective);
  if (!projectId) {
    throw new GatewayError("project_id is required", 400);
  }
  if (!objective) {
    throw new GatewayError("objective is required", 400);
  }
  const runtime = asString(body.runtime);
  if (runtime && runtime.length > 64) {
    throw new GatewayError("runtime must be 64 characters or fewer", 400);
  }
  const objectiveLimit = 8e3;
  if (objective.length > objectiveLimit) {
    throw new GatewayError(`objective must be ${objectiveLimit} characters or fewer`, 400);
  }
  return {
    execution_id: asString(body.execution_id),
    tenant_id: asString(body.tenant_id),
    project_id: projectId,
    user_id: asString(body.user_id),
    runtime,
    objective,
    workflow_id: asString(body.workflow_id),
    metadata: normalizeMetadata(body.metadata)
  };
}
function authenticateRequest(request) {
  const tenantId = asString(request.headers.get("x-tenant-id")) ?? null;
  const userId = asString(request.headers.get("x-user-id")) ?? null;
  return {
    tenantId,
    userId,
    authenticated: true
  };
}
async function routeExecutionRequest(request, body) {
  const auth = authenticateRequest(request);
  const executionRequest = parseExecutionRequest(body);
  const job = await buildExecutionJob({
    ...executionRequest,
    tenant_id: executionRequest.tenant_id ?? auth.tenantId ?? void 0,
    user_id: executionRequest.user_id ?? auth.userId ?? void 0
  });
  return { job, auth };
}

const GET = async () => {
  try {
    const executions = await listExecutions();
    return jsonOk({ executions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load executions";
    return jsonError(message, 500);
  }
};
const POST = async ({ request }) => {
  return Sentry.startSpan({ name: "POST /api/executions", op: "http.server" }, async () => {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON", 400);
    }
    try {
      const { job } = await routeExecutionRequest(request, body);
      const result = await dispatchExecutionJob(job);
      return jsonOk(result);
    } catch (error) {
      Sentry.captureException(error);
      if (error instanceof GatewayError) {
        return jsonError(error.message, error.statusCode);
      }
      if (error instanceof Error) {
        if (error.message.startsWith("Workflow not found")) {
          return jsonError(error.message, 404);
        }
        if (error.message.includes("No runnable workflow")) {
          return jsonError(error.message, 404);
        }
      }
      return jsonError("Failed to dispatch execution", 500);
    }
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
