/** User-facing copy — macOS shows the driver bundle name, not the product title. */

import { DEFAULT_PRESENTATION_TITLE, getPresentationTitle } from './ui-branding';
import type { UIConfig } from './ui-config';

/** Name macOS displays in Privacy & Security (CuaDriver.app bundle). */
export const COMPUTER_USE_PERMISSION_SYSTEM_NAME = 'CuaDriver';

/** Fallback product name when ui.config is unavailable. */
export const COMPUTER_USE_PERMISSION_PRODUCT_NAME = DEFAULT_PRESENTATION_TITLE;

export function resolveComputerUsePermissionProductName(config: UIConfig): string {
  return getPresentationTitle(config, COMPUTER_USE_PERMISSION_PRODUCT_NAME);
}

function withProductName(productName: string, options?: { tccReauthRequired?: boolean }) {
  const tccReauthNote = options?.tccReauthRequired
    ? ` After a bundle rebrand or upgrade, macOS Privacy permissions do not transfer automatically — re-approve ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} under Accessibility and Screen Recording even if the previous product already had access.`
    : '';

  return {
    productName,
    hint: `In System Settings, enable ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} — that is ${productName}'s desktop automation driver (koala icon). Turn it ON under Accessibility and Screen Recording.${tccReauthNote}`,
    dialogHint: `When macOS asks, approve ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} (${productName}'s automation engine).${tccReauthNote}`,
    steps: [
      `Toggle ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} ON (Accessibility and Screen Recording).`,
      `If macOS shows "Quit & Reopen" — click Later. ${productName} restarts the driver automatically.`,
      options?.tccReauthRequired
        ? 'If you upgraded from a previous branded install, macOS may require fresh permission grants for the automation driver.'
        : 'Wait a few seconds — setup continues on its own.',
    ].join(' '),
    activeMessage: `${productName} desktop control is ready.`,
    cursorSdkWarning: `If macOS shows Cursor SDK in a permission dialog, ignore it — grants belong to CuaDriver (${productName}'s automation engine). Use Settings → Computer Use here in ${productName}.`,
    tccReauthNote,
  };
}

const defaultCopy = withProductName(COMPUTER_USE_PERMISSION_PRODUCT_NAME);

export const COMPUTER_USE_PERMISSION_HINT = defaultCopy.hint;

export const COMPUTER_USE_PERMISSION_DIALOG_HINT = defaultCopy.dialogHint;

export const COMPUTER_USE_PERMISSION_STEPS = defaultCopy.steps;

export const COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE = defaultCopy.activeMessage;

/** Why macOS may show Cursor SDK during a broken setup path — not the intended grant target. */
export const COMPUTER_USE_CURSOR_SDK_WARNING = defaultCopy.cursorSdkWarning;

export function buildComputerUseCopyForProduct(
  productName: string,
  options?: { tccReauthRequired?: boolean },
) {
  return withProductName(productName, options);
}

export function resolveComputerUseCopy(
  config: UIConfig,
  options?: { tccReauthRequired?: boolean },
) {
  return withProductName(resolveComputerUsePermissionProductName(config), options);
}
