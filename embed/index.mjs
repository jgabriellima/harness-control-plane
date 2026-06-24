import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parse as parseYaml } from 'yaml';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const UI_CONFIG_FILENAME = 'ui.config.yaml';

function ensureObject(value, path) {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
}

function ensureHook(name, value) {
  if (value !== undefined && typeof value !== 'function') {
    throw new Error(`Integrator hook ${name} must be a function`);
  }
}

function resolveUiConfigPathHint(hint) {
  if (!hint) {
    return null;
  }
  if (hint instanceof URL) {
    return fileURLToPath(hint);
  }
  return resolve(hint);
}

function discoverUIConfigPath(options = {}) {
  const hintPath = resolveUiConfigPathHint(options.uiConfigPath);
  if (hintPath && existsSync(hintPath)) {
    return resolve(hintPath);
  }

  const explicitRoot = options.projectRoot?.trim() || process.env.CONTROL_PLANE_PROJECT_ROOT?.trim();
  if (explicitRoot) {
    const candidate = resolve(explicitRoot, UI_CONFIG_FILENAME);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const candidates = [];
  const cwd = process.cwd();
  for (let dir = cwd; ; dir = dirname(dir)) {
    candidates.push(resolve(dir, UI_CONFIG_FILENAME));
    candidates.push(resolve(dir, 'app', UI_CONFIG_FILENAME));
    if (dir === dirname(dir)) {
      break;
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveProjectRoot(options = {}) {
  const explicitRoot = options.projectRoot?.trim();
  if (explicitRoot) {
    return resolve(explicitRoot);
  }

  const envRoot = process.env.CONTROL_PLANE_PROJECT_ROOT?.trim();
  if (envRoot) {
    return resolve(envRoot);
  }

  return resolve(process.cwd());
}

function resolveProjectRootFromIntegration(options, uiConfig, configDir) {
  const explicitRoot = options.projectRoot?.trim();
  if (explicitRoot) {
    return resolve(explicitRoot);
  }

  const envRoot = process.env.CONTROL_PLANE_PROJECT_ROOT?.trim();
  if (envRoot) {
    return resolve(envRoot);
  }

  const dslRoot = uiConfig.integrator?.project_root?.trim();
  if (dslRoot) {
    return isAbsolute(dslRoot) ? resolve(dslRoot) : resolve(configDir, dslRoot);
  }

  return resolve(configDir);
}

function assertRuntimeBinding(projectRoot) {
  const bindingPath = resolve(projectRoot, '.cursor', 'runtime-binding.yaml');
  if (!existsSync(bindingPath)) {
    throw new Error(`Missing ${bindingPath}`);
  }

  const doc = parseYaml(readFileSync(bindingPath, 'utf8'));
  if (doc?.apiVersion !== 'proc.jambu/v1' || doc?.kind !== 'RuntimeBinding') {
    throw new Error('runtime-binding.yaml must be proc.jambu/v1 RuntimeBinding');
  }

  const harnessDir = doc?.active_pack?.harness_dir;
  if (typeof harnessDir !== 'string' || harnessDir.trim().length === 0) {
    throw new Error('runtime-binding.yaml active_pack.harness_dir must be defined');
  }

  const harnessRoot = resolve(projectRoot, harnessDir);
  if (!existsSync(harnessRoot)) {
    throw new Error(`Harness directory not found: ${harnessRoot}`);
  }

  return {
    runtimeBindingPath: bindingPath,
    harnessRoot,
  };
}

function loadUIConfigFromPath(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Missing ${configPath}`);
  }

  const doc = parseYaml(readFileSync(configPath, 'utf8'));
  if (doc?.apiVersion !== 'proc.jambu/v1' || doc?.kind !== 'ControlPlaneUI') {
    throw new Error('ui.config.yaml must be proc.jambu/v1 ControlPlaneUI');
  }

  return doc;
}

function loadUIConfig(projectRoot) {
  return loadUIConfigFromPath(resolve(projectRoot, UI_CONFIG_FILENAME));
}

function normalizeHooks(rawHooks) {
  if (rawHooks === undefined) {
    return undefined;
  }

  ensureObject(rawHooks, 'IntegratorHooks');
  const hooks = rawHooks;
  ensureHook('onBeforeDispatchRun', hooks.onBeforeDispatchRun);
  ensureHook('onNavigate', hooks.onNavigate);
  ensureHook('onCredentialAccess', hooks.onCredentialAccess);
  ensureHook('onWorkflowNodeSubmit', hooks.onWorkflowNodeSubmit);
  ensureHook('onUIReady', hooks.onUIReady);
  return hooks;
}

function pickModuleHooks(moduleValue) {
  if (moduleValue === undefined || moduleValue === null) {
    return undefined;
  }
  if (typeof moduleValue === 'object') {
    if (moduleValue.default && typeof moduleValue.default === 'object') {
      return moduleValue.default;
    }
    if (moduleValue.integratorHooks && typeof moduleValue.integratorHooks === 'object') {
      return moduleValue.integratorHooks;
    }
  }
  return moduleValue;
}

async function loadHooksFromModule(projectRoot, hooksModulePath) {
  if (!hooksModulePath) {
    return undefined;
  }

  const resolvedModulePath = isAbsolute(hooksModulePath)
    ? hooksModulePath
    : resolve(projectRoot, hooksModulePath);
  const moduleUrl = pathToFileURL(resolvedModulePath).href;
  const loadedModule = await import(moduleUrl);
  return normalizeHooks(pickModuleHooks(loadedModule));
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    });
    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`Process terminated by signal ${signal}`));
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

export async function createHarnessUI(options = {}) {
  const discoveredConfigPath = discoverUIConfigPath(options);
  let projectRoot;
  let uiConfig;

  if (discoveredConfigPath) {
    const configDir = dirname(discoveredConfigPath);
    uiConfig = loadUIConfigFromPath(discoveredConfigPath);
    projectRoot = resolveProjectRootFromIntegration(options, uiConfig, configDir);
  } else {
    projectRoot = resolveProjectRoot(options);
    uiConfig = loadUIConfig(projectRoot);
  }

  assertRuntimeBinding(projectRoot);

  const explicitHooks = normalizeHooks(options.hooks);
  const configHooks = await loadHooksFromModule(projectRoot, uiConfig.integrator?.hooks_module);
  const hooks = explicitHooks ?? configHooks;

  return {
    projectRoot,
    uiConfig,
    hooks,
    async start(startOptions = {}) {
      const selectedSurface =
        startOptions.surface ?? uiConfig.distribution?.surface ?? 'web';
      const runtimeSurface = selectedSurface === 'embedded' ? 'web' : selectedSurface;
      const passthroughArgs = Array.isArray(startOptions.passthroughArgs)
        ? startOptions.passthroughArgs
        : [];

      if (hooks?.onUIReady) {
        await hooks.onUIReady({
          projectRoot,
          uiConfig,
          surface: selectedSurface,
        });
      }

      const env = {
        ...process.env,
        ...startOptions.env,
        CONTROL_PLANE_PROJECT_ROOT: projectRoot,
      };

      if (runtimeSurface === 'desktop') {
        return runCommand('npm', ['run', 'tauri:dev', ...passthroughArgs], {
          cwd: repoRoot,
          env,
        });
      }

      return runCommand('npm', ['run', 'dev', '--', ...passthroughArgs], {
        cwd: repoRoot,
        env,
      });
    },
  };
}
