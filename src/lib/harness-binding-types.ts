export type HarnessBindingSource = 'runtime-binding';

export interface HarnessCommandNamespace {
  lifecycle: string;
  capabilities?: string;
}

export interface HarnessBinding {
  workspaceRoot: string;
  harnessRoot: string;
  dslPath: string;
  runnerScript: string;
  workflowsDir: string;
  runsDir: string;
  tracesDir: string;
  commandsDir: string;
  commandNamespace: HarnessCommandNamespace;
  cliPrefix: string;
  runtimeEngine: string;
  runtimeAdapterName: string;
  runtimeAdapterPath: string;
  specializationLayer: string;
  source: HarnessBindingSource;
}

export interface RuntimeBindingStamp {
  apiVersion: string;
  kind: string;
  active_pack: {
    id: string | null;
    harness_dir?: string | null;
    dsl_file?: string | null;
    cli_prefix?: string | null;
    command_namespace?: HarnessCommandNamespace;
    kind?: string;
  };
  storage: {
    root: string;
    resolved?: {
      workflow_runs?: string;
      trace?: string;
      handoffs?: string;
      evidence?: string;
    };
  };
  runtime: {
    engine: string;
    specialization_layer: string;
  };
}
