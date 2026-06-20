import type {
  ConversationRequest,
  ExecutionJob,
  ExecutionRequest,
} from './harness-types';
import { buildExecutionJob } from './execution-dispatch';

export class GatewayError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'GatewayError';
    this.statusCode = statusCode;
  }
}

export interface GatewayAuthContext {
  tenantId: string | null;
  userId: string | null;
  authenticated: boolean;
}

export interface GatewayRouteResult {
  job: ExecutionJob;
  auth: GatewayAuthContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function isConversationRequest(value: unknown): value is ConversationRequest {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.message === 'string';
}

export function parseExecutionRequest(body: unknown): ExecutionRequest {
  if (!isRecord(body)) {
    throw new GatewayError('Request body must be a JSON object', 400);
  }

  if (isConversationRequest(body)) {
    const projectId = asString(body.project_id);
    const message = asString(body.message);
    if (!projectId) {
      throw new GatewayError('project_id is required', 400);
    }
    if (!message) {
      throw new GatewayError('message is required', 400);
    }

    return {
      execution_id: asString(body.conversation_id),
      project_id: projectId,
      objective: message,
      workflow_id: asString(body.workflow_id),
      runtime: asString(body.runtime) ?? asString(body.execution_profile),
      metadata: normalizeMetadata(body.metadata),
    };
  }

  const projectId = asString(body.project_id);
  const objective = asString(body.objective);
  if (!projectId) {
    throw new GatewayError('project_id is required', 400);
  }
  if (!objective) {
    throw new GatewayError('objective is required', 400);
  }

  const runtime = asString(body.runtime);
  if (runtime && runtime.length > 64) {
    throw new GatewayError('runtime must be 64 characters or fewer', 400);
  }

  const objectiveLimit = 8000;
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
    metadata: normalizeMetadata(body.metadata),
  };
}

export function authenticateRequest(request: Request): GatewayAuthContext {
  const tenantId = asString(request.headers.get('x-tenant-id')) ?? null;
  const userId = asString(request.headers.get('x-user-id')) ?? null;

  return {
    tenantId,
    userId,
    authenticated: true,
  };
}

export async function routeExecutionRequest(
  request: Request,
  body: unknown,
): Promise<GatewayRouteResult> {
  const auth = authenticateRequest(request);
  const executionRequest = parseExecutionRequest(body);

  const job = await buildExecutionJob({
    ...executionRequest,
    tenant_id: executionRequest.tenant_id ?? auth.tenantId ?? undefined,
    user_id: executionRequest.user_id ?? auth.userId ?? undefined,
  });

  return { job, auth };
}
