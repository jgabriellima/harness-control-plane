import { D as DEFAULT_PRESENTATION_TITLE } from './ui-branding_xMGaxulv.mjs';
import { i as isDesktopRuntimeSurface, r as resolveRuntimeSurface, a as isTauriDesktopShell } from './runtime-surface_DYjhsAWH.mjs';

const LEVEL_RANK = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
function readProcessEnv(name) {
  if (typeof process === "undefined") {
    return void 0;
  }
  try {
    const value = process.env[name];
    if (typeof value !== "string") {
      return void 0;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : void 0;
  } catch {
    return void 0;
  }
}
function resolveLogLevel() {
  const raw = readProcessEnv("CONTROL_PLANE_LOG_LEVEL")?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return readProcessEnv("NODE_ENV") === "production" ? "info" : "debug";
}
let activeLevel;
function getActiveLevel() {
  if (activeLevel === void 0) {
    activeLevel = resolveLogLevel();
  }
  return activeLevel;
}
function shouldLog(level) {
  return LEVEL_RANK[level] >= LEVEL_RANK[getActiveLevel()];
}
function createRequestId(prefix = "req") {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${rand}`;
}
function writeLog(level, event, fields = {}) {
  if (!shouldLog(level)) {
    return;
  }
  const payload = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    event,
    ...fields
  };
  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload));
}
const runtimeLogger = {
  debug(event, fields) {
    writeLog("debug", event, fields);
  },
  info(event, fields) {
    writeLog("info", event, fields);
  },
  warn(event, fields) {
    writeLog("warn", event, fields);
  },
  error(event, fields) {
    writeLog("error", event, fields);
  }
};
function errorFields(error) {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
      ...getActiveLevel() === "debug" && error.stack ? { stack: error.stack.split("\n").slice(0, 8).join("\n") } : {}
    };
  }
  return { error_message: String(error) };
}
function isDebugLogLevel() {
  return getActiveLevel() === "debug";
}

const __vite_import_meta_env__ = {"ASSETS_PREFIX": undefined, "BASE_URL": "/", "DEV": false, "MODE": "production", "PROD": true, "SITE": undefined, "SSR": true};
function isOperatorRuntimeContext() {
  if (process.env.CONTROL_PLANE_OPERATOR === "1") {
    return true;
  }
  if (process.env.TAURI_BUNDLE_IDENTIFIER?.trim()) {
    return false;
  }
  return process.env.NODE_ENV !== "production";
}
function resolveServerSdkMessageContext(options) {
  const desktopRuntime = process.env.CONTROL_PLANE_DESKTOP === "1" || Boolean(process.env.TAURI_BUNDLE_IDENTIFIER?.trim());
  const surface = resolveRuntimeSurface({
    distributionSurface: options?.distributionSurface,
    desktopRuntime
  });
  return {
    surface,
    presentationTitle: options?.presentationTitle?.trim() || DEFAULT_PRESENTATION_TITLE,
    operatorContext: options?.operatorContext ?? isOperatorRuntimeContext()
  };
}
let cachedServerContext = null;
function cacheServerSdkMessageContext(ctx) {
  cachedServerContext = ctx;
}
function getCachedServerSdkMessageContext() {
  return cachedServerContext ?? resolveServerSdkMessageContext();
}
function clientSdkMessageContext(options) {
  const tauriDesktop = isTauriDesktopShell();
  const devBuild = typeof import.meta !== "undefined" && Boolean(Object.assign(__vite_import_meta_env__, { NODE: "/opt/homebrew/Cellar/node/23.1.0_1/bin/node", _: "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/.bin/astro", NODE_ENV: "production" })?.DEV);
  return {
    surface: options?.surface ?? (tauriDesktop ? "desktop" : "web"),
    presentationTitle: options?.presentationTitle?.trim() || DEFAULT_PRESENTATION_TITLE,
    operatorContext: options?.operatorContext ?? (tauriDesktop ? false : devBuild)
  };
}
function useShippableCopy(ctx) {
  return !ctx.operatorContext;
}
function sdkHealthBannerTitle(ctx) {
  if (useShippableCopy(ctx)) {
    return "Assistente indisponível";
  }
  return "Runtime Cursor indisponível";
}
function sdkHealthCheckingMessage(ctx) {
  if (useShippableCopy(ctx)) {
    return "Verificando disponibilidade do assistente…";
  }
  return "Verificando conectividade com a API Cursor…";
}
function sdkHealthProbeFailedFallback(ctx) {
  if (useShippableCopy(ctx)) {
    return "Não foi possível verificar a disponibilidade do assistente.";
  }
  return "Não foi possível verificar conectividade com o runtime Cursor";
}
function sdkMissingApiKeyMessage(ctx) {
  if (useShippableCopy(ctx)) {
    if (isDesktopRuntimeSurface(ctx.surface)) {
      return "O assistente ainda não está configurado. Abra Configurações → Runtime e informe a Runtime API Key fornecida pelo administrador.";
    }
    return "O assistente ainda não está configurado. Solicite ao administrador a configuração da Runtime API Key.";
  }
  return "Runtime API Key ausente — configure em app/.env (dev) ou Settings → Runtime (desktop) e reinicie o servidor.";
}
function sdkAuthFailedMessage(ctx) {
  if (useShippableCopy(ctx)) {
    if (isDesktopRuntimeSurface(ctx.surface)) {
      return "A Runtime API Key é inválida ou expirou. Atualize em Configurações → Runtime e reinicie o aplicativo.";
    }
    return "A Runtime API Key é inválida ou expirou. Solicite uma nova chave ao administrador.";
  }
  return "Runtime API Key rejeitada — verifique o valor em app/.env ou Settings → Runtime";
}
function sdkNetworkFailedMessage(ctx) {
  if (useShippableCopy(ctx)) {
    return "Sem conexão com o serviço de IA. Verifique rede, VPN ou proxy antes de enviar mensagens.";
  }
  return "Sem conexão com a API Cursor — verifique rede/VPN/proxy antes de enviar mensagens no chat";
}
function sdkTimeoutMessage(ctx) {
  if (useShippableCopy(ctx)) {
    return "O serviço de IA não respondeu a tempo. Tente novamente em instantes.";
  }
  return "Timeout ao contactar a API Cursor — tente novamente em instantes";
}
function sdkUnknownFailureMessage(ctx, detail) {
  if (useShippableCopy(ctx)) {
    return "Assistente indisponível. Tente novamente em instantes.";
  }
  return `Runtime Cursor indisponível: ${detail}`;
}
function sdkDispatchAuthMessage(ctx) {
  if (useShippableCopy(ctx)) {
    return "Não foi possível autenticar o assistente. Verifique a Runtime API Key em Configurações → Runtime.";
  }
  return "Runtime API Key inválida ou rejeitada — verifique app/.env ou Settings → Runtime e reinicie o dev server";
}
function sdkLocalSessionAuthFailedMessage(ctx) {
  if (useShippableCopy(ctx)) {
    return sdkRuntimeReconnectingMessage(ctx);
  }
  return "Sessão local do runtime expirou — o servidor está restabelecendo a conexão; reenvie a mensagem em instantes";
}
function sdkRuntimeReconnectingMessage(ctx) {
  if (useShippableCopy(ctx)) {
    return "Restabelecendo conexão com o assistente. Aguarde um instante e tente novamente.";
  }
  return "Runtime restabelecendo sessão local — reenvie a mensagem após alguns segundos";
}
function sdkDispatchNetworkMessage(ctx) {
  if (useShippableCopy(ctx)) {
    return 'Sem conexão com o serviço de IA. Use "Verificar novamente" após restabelecer a rede.';
  }
  return 'Sem conexão com a API Cursor — a verificação de sessão deveria ter bloqueado o envio; tente "Verificar novamente" no banner amarelo';
}

const FAILED_RUN_STATUSES = /* @__PURE__ */ new Set(["error", "failed", "expired"]);
function isFailedRunStatus(status) {
  return FAILED_RUN_STATUSES.has(status.trim().toLowerCase());
}
function isRunAuthFailureText(text) {
  if (!text?.trim()) {
    return false;
  }
  const normalized = text.toLowerCase();
  return normalized.includes("authentication error") || normalized.includes("[unauthenticated]") || normalized.includes("invalid api key") || normalized.includes("not authenticated") || normalized.includes("log out and back in");
}
function formatRunFailureMessage(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return "A execução do assistente falhou antes de produzir uma resposta.";
  }
  const ctx = getCachedServerSdkMessageContext();
  if (isRunAuthFailureText(trimmed)) {
    const normalized = trimmed.toLowerCase();
    if (normalized.includes("log out and back in") || normalized.includes("logging out and back in")) {
      return sdkLocalSessionAuthFailedMessage(ctx);
    }
    return sdkDispatchAuthMessage(ctx);
  }
  return trimmed;
}
function mergeRunFailureDetail(rawResult, errorDetail) {
  const resultText = rawResult?.trim();
  if (resultText) {
    return resultText;
  }
  return errorDetail?.trim() || void 0;
}
function classifyRunTerminalOutcome(status, rawResult, errorDetail) {
  const failureDetail = mergeRunFailureDetail(rawResult, errorDetail);
  const cancelled = status.trim().toLowerCase() === "cancelled";
  const authFailed = isRunAuthFailureText(failureDetail);
  const failed = isFailedRunStatus(status) || authFailed;
  const errorMessage = failed ? formatRunFailureMessage(failureDetail) : void 0;
  return {
    status,
    cancelled,
    authFailed,
    failed,
    errorMessage
  };
}

export { sdkDispatchNetworkMessage as a, sdkRuntimeReconnectingMessage as b, createRequestId as c, classifyRunTerminalOutcome as d, errorFields as e, isFailedRunStatus as f, getCachedServerSdkMessageContext as g, resolveServerSdkMessageContext as h, isDebugLogLevel as i, cacheServerSdkMessageContext as j, sdkMissingApiKeyMessage as k, isRunAuthFailureText as l, mergeRunFailureDetail as m, sdkUnknownFailureMessage as n, sdkAuthFailedMessage as o, sdkNetworkFailedMessage as p, sdkTimeoutMessage as q, runtimeLogger as r, sdkDispatchAuthMessage as s, sdkHealthProbeFailedFallback as t, clientSdkMessageContext as u, sdkHealthCheckingMessage as v, sdkHealthBannerTitle as w };
