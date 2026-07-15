import { D as DEFAULT_PRESENTATION_TITLE } from './ui-branding_xMGaxulv.mjs';

const COMPUTER_USE_PERMISSION_SYSTEM_NAME = "CuaDriver";
const COMPUTER_USE_PERMISSION_PRODUCT_NAME = DEFAULT_PRESENTATION_TITLE;
function withProductName(productName, options) {
  const tccReauthNote = options?.tccReauthRequired ? ` After a bundle rebrand or upgrade, macOS Privacy permissions do not transfer automatically — re-approve ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} under Accessibility and Screen Recording even if the previous product already had access.` : "";
  return {
    productName,
    hint: `In System Settings, enable ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} — that is ${productName}'s desktop automation driver (koala icon). Turn it ON under Accessibility and Screen Recording.${tccReauthNote}`,
    dialogHint: `When macOS asks, approve ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} (${productName}'s automation engine).${tccReauthNote}`,
    steps: [
      `Toggle ${COMPUTER_USE_PERMISSION_SYSTEM_NAME} ON (Accessibility and Screen Recording).`,
      `If macOS shows "Quit & Reopen" — click Later. ${productName} restarts the driver automatically.`,
      options?.tccReauthRequired ? "If you upgraded from a previous branded install, macOS may require fresh permission grants for the automation driver." : "Wait a few seconds — setup continues on its own."
    ].join(" "),
    activeMessage: `${productName} desktop control is ready.`,
    cursorSdkWarning: `If macOS shows Cursor SDK in a permission dialog, ignore it — grants belong to CuaDriver (${productName}'s automation engine). Use Settings → Computer Use here in ${productName}.`,
    tccReauthNote
  };
}
const defaultCopy = withProductName(COMPUTER_USE_PERMISSION_PRODUCT_NAME);
defaultCopy.hint;
const COMPUTER_USE_PERMISSION_DIALOG_HINT = defaultCopy.dialogHint;
const COMPUTER_USE_PERMISSION_STEPS = defaultCopy.steps;
const COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE = defaultCopy.activeMessage;
defaultCopy.cursorSdkWarning;
function buildComputerUseCopyForProduct(productName, options) {
  return withProductName(productName, options);
}

export { COMPUTER_USE_PERMISSION_STEPS as C, COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE as a, COMPUTER_USE_PERMISSION_DIALOG_HINT as b, buildComputerUseCopyForProduct as c, COMPUTER_USE_PERMISSION_SYSTEM_NAME as d, COMPUTER_USE_PERMISSION_PRODUCT_NAME as e };
