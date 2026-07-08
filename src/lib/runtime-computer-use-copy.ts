/** User-facing copy — macOS shows the driver bundle name, not Jambu. */

/** Name macOS displays in Privacy & Security (CuaDriver.app bundle). */
export const COMPUTER_USE_PERMISSION_SYSTEM_NAME = 'CuaDriver';

/** Product name shown to the operator in Jambu UI. */
export const COMPUTER_USE_PERMISSION_PRODUCT_NAME = 'Jambu';

export const COMPUTER_USE_PERMISSION_HINT =
  `In System Settings, enable ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} — that is ${COMPUTER_USE_PERMISSION_PRODUCT_NAME}'s desktop automation driver (koala icon). Turn it ON under Accessibility and Screen Recording.`;

export const COMPUTER_USE_PERMISSION_DIALOG_HINT =
  `When macOS asks, approve ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} (${COMPUTER_USE_PERMISSION_PRODUCT_NAME}'s automation engine).`;

/** Shown while the operator toggles permissions in System Settings. */
export const COMPUTER_USE_PERMISSION_STEPS = [
  `Toggle ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} ON (Accessibility and Screen Recording).`,
  `If macOS shows "Quit & Reopen" — click Later. ${COMPUTER_USE_PERMISSION_PRODUCT_NAME} restarts the driver automatically.`,
  'Wait a few seconds — setup continues on its own.',
].join(' ');

export const COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE =
  `${COMPUTER_USE_PERMISSION_PRODUCT_NAME} desktop control is ready.`;

/** Why macOS may show Cursor SDK during a broken setup path — not the intended grant target. */
export const COMPUTER_USE_CURSOR_SDK_WARNING =
  'If macOS shows Cursor SDK in a permission dialog, ignore it — grants belong to CuaDriver (Jambu\'s automation engine). Use Settings → Computer Use here in Jambu.';
