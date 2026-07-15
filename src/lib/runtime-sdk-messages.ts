import { DEFAULT_PRESENTATION_TITLE } from './ui-branding';
import type { SdkHealthErrorCode } from './runtime-sdk-probe';
import {
  isDesktopRuntimeSurface,
  resolveRuntimeSurface,
  type RuntimeSurface,
} from './runtime-surface';
import type { ControlPlaneSurface } from './ui-config';
import { isTauriDesktopShell } from './runtime-surface';

export interface RuntimeSdkMessageContext {
  surface: RuntimeSurface;
  presentationTitle: string;
  /** Engineering / local dev — may show Cursor, .env, and repo paths. */
  operatorContext: boolean;
}

export function isOperatorRuntimeContext(): boolean {
  if (process.env.CONTROL_PLANE_OPERATOR === '1') {
    return true;
  }
  // Shipped Tauri bundles must never surface engineering copy (Cursor, .env paths).
  if (process.env.TAURI_BUNDLE_IDENTIFIER?.trim()) {
    return false;
  }
  return process.env.NODE_ENV !== 'production';
}

export function resolveServerSdkMessageContext(options?: {
  distributionSurface?: ControlPlaneSurface;
  presentationTitle?: string;
  operatorContext?: boolean;
}): RuntimeSdkMessageContext {
  const desktopRuntime =
    process.env.CONTROL_PLANE_DESKTOP === '1' ||
    Boolean(process.env.TAURI_BUNDLE_IDENTIFIER?.trim());
  const surface = resolveRuntimeSurface({
    distributionSurface: options?.distributionSurface,
    desktopRuntime,
  });

  return {
    surface,
    presentationTitle: options?.presentationTitle?.trim() || DEFAULT_PRESENTATION_TITLE,
    operatorContext: options?.operatorContext ?? isOperatorRuntimeContext(),
  };
}

let cachedServerContext: RuntimeSdkMessageContext | null = null;

export function cacheServerSdkMessageContext(ctx: RuntimeSdkMessageContext): void {
  cachedServerContext = ctx;
}

export function getCachedServerSdkMessageContext(): RuntimeSdkMessageContext {
  return cachedServerContext ?? resolveServerSdkMessageContext();
}

export function clientSdkMessageContext(options?: {
  surface?: RuntimeSurface;
  presentationTitle?: string;
  operatorContext?: boolean;
}): RuntimeSdkMessageContext {
  const tauriDesktop = isTauriDesktopShell();
  const devBuild =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

  return {
    surface: options?.surface ?? (tauriDesktop ? 'desktop' : 'web'),
    presentationTitle: options?.presentationTitle?.trim() || DEFAULT_PRESENTATION_TITLE,
    operatorContext: options?.operatorContext ?? (tauriDesktop ? false : devBuild),
  };
}

function useShippableCopy(ctx: RuntimeSdkMessageContext): boolean {
  return !ctx.operatorContext;
}

export function sdkHealthBannerTitle(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    return 'Assistente indisponível';
  }
  return 'Runtime Cursor indisponível';
}

export function sdkHealthCheckingMessage(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    return 'Verificando disponibilidade do assistente…';
  }
  return 'Verificando conectividade com a API Cursor…';
}

export function sdkHealthUnavailableFallback(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    return 'Assistente indisponível — verifique a conexão antes de enviar mensagens.';
  }
  return 'Runtime Cursor indisponível — verifique conectividade antes de enviar mensagens';
}

export function sdkHealthProbeFailedFallback(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    return 'Não foi possível verificar a disponibilidade do assistente.';
  }
  return 'Não foi possível verificar conectividade com o runtime Cursor';
}

export function sdkMissingApiKeyMessage(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    if (isDesktopRuntimeSurface(ctx.surface)) {
      return 'O assistente ainda não está configurado. Abra Configurações → Runtime e informe a Runtime API Key fornecida pelo administrador.';
    }
    return 'O assistente ainda não está configurado. Solicite ao administrador a configuração da Runtime API Key.';
  }
  return 'Runtime API Key ausente — configure em app/.env (dev) ou Settings → Runtime (desktop) e reinicie o servidor.';
}

export function sdkAuthFailedMessage(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    if (isDesktopRuntimeSurface(ctx.surface)) {
      return 'A Runtime API Key é inválida ou expirou. Atualize em Configurações → Runtime e reinicie o aplicativo.';
    }
    return 'A Runtime API Key é inválida ou expirou. Solicite uma nova chave ao administrador.';
  }
  return 'Runtime API Key rejeitada — verifique o valor em app/.env ou Settings → Runtime';
}

export function sdkNetworkFailedMessage(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    return 'Sem conexão com o serviço de IA. Verifique rede, VPN ou proxy antes de enviar mensagens.';
  }
  return 'Sem conexão com a API Cursor — verifique rede/VPN/proxy antes de enviar mensagens no chat';
}

export function sdkTimeoutMessage(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    return 'O serviço de IA não respondeu a tempo. Tente novamente em instantes.';
  }
  return 'Timeout ao contactar a API Cursor — tente novamente em instantes';
}

export function sdkUnknownFailureMessage(ctx: RuntimeSdkMessageContext, detail: string): string {
  if (useShippableCopy(ctx)) {
    return 'Assistente indisponível. Tente novamente em instantes.';
  }
  return `Runtime Cursor indisponível: ${detail}`;
}

export function sdkDispatchAuthMessage(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    return 'Não foi possível autenticar o assistente. Verifique a Runtime API Key em Configurações → Runtime.';
  }
  return 'Runtime API Key inválida ou rejeitada — verifique app/.env ou Settings → Runtime e reinicie o dev server';
}

/** Local Cursor IDE session expired — operator should not need manual logout. */
export function sdkLocalSessionAuthFailedMessage(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    return sdkRuntimeReconnectingMessage(ctx);
  }
  return 'Sessão local do runtime expirou — o servidor está restabelecendo a conexão; reenvie a mensagem em instantes';
}

/** Shown while server-side credential reconcile + reprobe runs. */
export function sdkRuntimeReconnectingMessage(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    return 'Restabelecendo conexão com o assistente. Aguarde um instante e tente novamente.';
  }
  return 'Runtime restabelecendo sessão local — reenvie a mensagem após alguns segundos';
}

export function sdkDispatchNetworkMessage(ctx: RuntimeSdkMessageContext): string {
  if (useShippableCopy(ctx)) {
    return 'Sem conexão com o serviço de IA. Use "Verificar novamente" após restabelecer a rede.';
  }
  return 'Sem conexão com a API Cursor — a verificação de sessão deveria ter bloqueado o envio; tente "Verificar novamente" no banner amarelo';
}

export function mapSdkHealthErrorMessage(
  ctx: RuntimeSdkMessageContext,
  code: SdkHealthErrorCode,
  detail?: string,
): string {
  switch (code) {
    case 'missing_api_key':
      return sdkMissingApiKeyMessage(ctx);
    case 'auth_failed':
      return sdkAuthFailedMessage(ctx);
    case 'network_failed':
      return sdkNetworkFailedMessage(ctx);
    case 'timeout':
      return sdkTimeoutMessage(ctx);
    default:
      return sdkUnknownFailureMessage(ctx, detail ?? 'unknown error');
  }
}
