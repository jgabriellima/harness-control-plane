const DEFAULT_PRESENTATION_CONFIG = {
  richUi: "adaptive"
};
function isRichUiMode(value) {
  return value === "off" || value === "adaptive" || value === "always";
}
function presentationWireMode(richUi) {
  return richUi === "off" ? "text" : "rich";
}
function presentationPromptVariant(richUi) {
  if (richUi === "off") {
    return "none";
  }
  if (richUi === "always") {
    return "full";
  }
  return "adaptive";
}

export { DEFAULT_PRESENTATION_CONFIG as D, presentationWireMode as a, isRichUiMode as i, presentationPromptVariant as p };
