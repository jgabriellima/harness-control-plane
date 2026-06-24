export type ControlPlaneSurface = 'web' | 'desktop' | 'embedded';

export interface UIConfig {
  apiVersion: 'proc.jambu/v1';
  kind: 'ControlPlaneUI';
  metadata?: {
    name?: string;
    product_id?: string;
  };
  presentation?: {
    title?: string;
    theme?: 'system' | 'light' | 'dark';
    locale?: string;
  };
  features?: Record<string, boolean>;
  panels?: {
    default_layout?: string;
    enabled?: string[];
  };
  distribution?: {
    surface?: ControlPlaneSurface;
    desktop?: {
      identifier?: string;
      window_title?: string;
    };
  };
  integrator?: {
    project_root?: string;
    hooks_module?: string;
    policy_profile?: string;
  };
}

export interface DispatchRunContext {
  projectRoot: string;
  payload: Record<string, unknown>;
}

export interface NavigateContext {
  projectRoot: string;
  route: string;
}

export interface CredentialAccessContext {
  projectRoot: string;
  slotId: string;
  scope?: string;
}

export interface WorkflowNodeSubmitContext {
  projectRoot: string;
  runId: string;
  nodeId: string;
  payload: Record<string, unknown>;
}

export interface UIReadyContext {
  projectRoot: string;
  uiConfig: UIConfig;
  surface: ControlPlaneSurface;
}

export interface IntegratorHooks {
  onBeforeDispatchRun?: (context: DispatchRunContext) => boolean | Promise<boolean>;
  onNavigate?: (context: NavigateContext) => void | Promise<void>;
  onCredentialAccess?: (context: CredentialAccessContext) => boolean | Promise<boolean>;
  onWorkflowNodeSubmit?: (context: WorkflowNodeSubmitContext) => void | Promise<void>;
  onUIReady?: (context: UIReadyContext) => void | Promise<void>;
}

export interface StartHarnessUIOptions {
  surface?: ControlPlaneSurface;
  passthroughArgs?: string[];
  env?: Record<string, string>;
}

export interface CreateHarnessUIOptions {
  projectRoot?: string;
  uiConfigPath?: string | URL;
  hooks?: IntegratorHooks;
}

export interface HarnessUIInstance {
  projectRoot: string;
  uiConfig: UIConfig;
  hooks?: IntegratorHooks;
  start: (options?: StartHarnessUIOptions) => Promise<number>;
}

export declare function createHarnessUI(options?: CreateHarnessUIOptions): Promise<HarnessUIInstance>;
