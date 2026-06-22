/** Shared types for integration mutation pipeline (ADR-011 W3). */

export type SlotId =
  | "work_items"
  | "source_control"
  | "ci"
  | "qa"
  | "observability"
  | "deploy"
  | "post_deploy"
  | "incident";

export type IntegrationStatus = "active" | "pending_credentials";

export type MutationAction = "add" | "remove" | "swap" | "batch";

export type ManifestSource =
  | "init"
  | "config-add"
  | "config-swap"
  | "config-remove"
  | "doctor-regen";

export type SecretScope = "local" | "ci" | "both";

export type SecretLayer = "sdlc" | "app" | "ci" | "runtime";

export interface SlotSelections {
  [slot: string]: string;
}

export interface DeliverySurfaces {
  local?: boolean;
  preview?: boolean;
  staging?: boolean;
  production?: boolean;
}

export interface DeliveryConfig {
  default_closure:
    | "local-validated"
    | "preview-validated"
    | "staging-validated"
    | "production-validated";
  surfaces: DeliverySurfaces;
}

export interface IncidentConfig {
  provider_token:
    | "github-issues-human-hitl"
    | "github-issues-cursor-sdk"
    | "github-issues-claude"
    | "pagerduty-webhook";
  agent_runtime: "human-in-loop" | "cursor-sdk" | "claude-code" | "opencode";
  trigger: "github-issue-label" | "observability-webhook" | "workflow-dispatch";
  execution: "ci" | "local-dispatch" | "cloud-agent";
  auto_merge: boolean;
}

export interface InitSelections {
  version: 1;
  confirmed_at: string;
  workspace: {
    target_root: string;
    profile: string;
    mode: "bind" | "compose" | "resume";
  };
  delivery: DeliveryConfig;
  slots: SlotSelections;
  incident?: IncidentConfig | null;
}

export interface IntegrationIndexEntry {
  config: string;
  status: IntegrationStatus;
  serves_slots: SlotId[];
}

export interface ProviderPlan {
  providerId: string;
  serves_slots: SlotId[];
  operation: "add" | "remove" | "update";
}

export interface SecretRequired {
  env_var: string;
  scope: SecretScope;
  required?: boolean;
  description?: string;
  layer?: SecretLayer;
  slot?: SlotId;
}

export interface IntegrationYaml {
  integration: string;
  secrets_required?: SecretRequired[];
  [key: string]: unknown;
}

export interface DiscoveryHit {
  file: string;
  line?: number;
  category: "dsl" | "integration" | "rules" | "commands" | "agents" | "workflows" | "ci" | "app" | "memory" | "other";
  change_required: string;
}

export interface CredentialManifestSecret {
  env_var: string;
  scope: SecretScope;
  layer: SecretLayer;
  integration: string;
  slot: SlotId;
  required: boolean;
  description?: string;
}

export interface CredentialManifest {
  generated_at: string;
  source: ManifestSource;
  secrets: CredentialManifestSecret[];
}

export interface MutationPlan {
  version: 1;
  action: MutationAction;
  source: ManifestSource;
  created_at: string;
  providers: ProviderPlan[];
  materialize: string[];
  remove: string[];
  stack_updates: Record<string, string>;
  non_materialized: string[];
  discovery: Record<string, DiscoveryHit[]>;
  agent_tasks: string[];
  credential_manifest_preview: {
    secrets_count: number;
    integrations: string[];
  };
}

export interface ApplyResult {
  plan: MutationPlan;
  materialized: string[];
  removed: string[];
  skipped: string[];
  manifest_path: string;
  sdlc_yaml_updated: boolean;
}

export interface WorkspaceConfig {
  target_root?: string;
  profile?: string;
}

export interface RuntimeMcpEntry {
  name: string;
  required?: boolean;
  purpose?: string;
  command?: string;
  plugin?: string;
  [key: string]: unknown;
}

export interface SdlcYaml {
  status?: string;
  workspace?: WorkspaceConfig;
  project?: {
    stack?: Record<string, string>;
  };
  integrations?: Record<string, IntegrationIndexEntry>;
  runtime?: {
    mcps?: RuntimeMcpEntry[];
    rules?: string[];
    [key: string]: unknown;
  };
}
