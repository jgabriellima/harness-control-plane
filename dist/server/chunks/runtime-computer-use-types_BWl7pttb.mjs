function computerUseTargetModeLabel(mode) {
  return mode === "host" ? "My computer" : "Sandbox";
}
function parseComputerUseTargetMode(value) {
  if (value === "host" || value === "sandbox") {
    return value;
  }
  return null;
}
const CUA_TOOL_PREFIXES = ["cua_", "cua-", "driver_"];
const CUA_TOOL_NAMES = /* @__PURE__ */ new Set([
  "screenshot",
  "click",
  "type",
  "type_text",
  "scroll",
  "list_windows",
  "list_apps",
  "launch_app",
  "get_window_state",
  "get_desktop_state",
  "move_mouse",
  "move_cursor",
  "drag",
  "hotkey",
  "press_key",
  "zoom",
  "double_click",
  "right_click"
]);
function isCuaToolName(tool) {
  const normalized = tool.trim().toLowerCase();
  if (CUA_TOOL_NAMES.has(normalized)) {
    return true;
  }
  return CUA_TOOL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
function defaultComputerUsePreferences() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    hostControlEnabled: false,
    allowForegroundCursor: false,
    consentedAt: null,
    updatedAt: now
  };
}
function buildComputerUsePromptInjection(input) {
  if (!input.sessionEnabled) {
    return "[computer_use: off for this chat — enable My computer or Sandbox in composer options]";
  }
  if (input.targetMode === "sandbox") {
    const lines = [
      "[computer_use: session_enabled target=sandbox]",
      input.previewActive ? `[computer_use_preview: active target=sandbox stream=vnc controlMode=${input.previewControlMode ?? "agent"}]` : "[computer_use_preview: inactive target=sandbox stream=vnc — panel embeds live noVNC when sandbox starts]"
    ];
    if (input.sandboxReady && input.sandboxName) {
      const attrs = [
        `sandbox_name=${input.sandboxName}`,
        input.sandboxApiPort !== void 0 ? `api_port=${input.sandboxApiPort}` : null,
        input.sandboxVncPort !== void 0 ? `vnc_port=${input.sandboxVncPort}` : null
      ].filter(Boolean).join(" ");
      lines.push(`[computer_use_sandbox: ready] ${attrs}`);
      lines.push(
        "sandbox_tools=sandbox_open_url,sandbox_screenshot,sandbox_shell (injected custom tools — use ONLY these)"
      );
      if (input.sandboxOpenUrlRecipe) {
        lines.push(`open_url_recipe=${input.sandboxOpenUrlRecipe}`);
      }
    } else {
      lines.push("[computer_use_sandbox: not_ready] — sandbox is starting; check the preview panel for status");
    }
    lines.push(
      "Sandbox mode is ACTIVE for this chat turn. You are NOT on the operator Mac.",
      "MANDATORY: execute ALL web and shell work via sandbox_open_url, sandbox_screenshot, sandbox_shell — one project sandbox shared by every chat in this project.",
      'To browse a site: (1) sandbox_open_url { url }, (2) sandbox_shell { command: "curl -sL ..." } or sandbox_screenshot for visual verification.',
      "FORBIDDEN in sandbox mode: WebSearch, WebFetch, host Shell, host curl/wget, cua-driver, custom-user-tools, launch_app, get_desktop_state, docker ps, script discovery, guessing sandbox names.",
      "Do NOT substitute web search or host HTTP for sandbox browser actions — the operator preview panel must reflect real sandbox activity.",
      "Do not write manifest files or probe runtime-sessions from within a chat turn.",
      "The operator preview panel shows the project sandbox noVNC stream — never confuse it with the host desktop."
    );
    return lines.join("\n");
  }
  if (!input.capabilityAvailable) {
    return "[computer_use: My computer selected but capability not activated — complete setup in Settings first]";
  }
  if (input.healthError) {
    return `[computer_use: My computer enabled but unavailable — ${input.healthError}. Ask the operator to open Settings → Computer Use and retry activation.]`;
  }
  const modes = ["host_background"];
  if (input.allowForegroundCursor) {
    modes.push("host_foreground");
  }
  return [
    `[computer_use: session_enabled target=host modes=${modes.join(",")} consent_at=${input.consentedAt ?? "unknown"}]`,
    input.previewActive ? `[computer_use_preview: active target=host controlMode=${input.previewControlMode ?? "agent"} — operator may Take control in the artifact preview panel]` : "[computer_use_preview: inactive target=host — panel opens automatically when you call desktop tools]",
    "Use the custom-user-tools MCP server (Jambu computer-use bridge). Call tools by exact name: list_apps, list_windows, get_window_state, get_desktop_state, click, type_text, scroll, launch_app, health_report, etc.",
    "Never invoke cua-driver via Shell — sandbox blocks the daemon socket. Never ask for macOS permissions again; CuaDriver is already consented in Settings.",
    "When preview controlMode is user, wait for the operator to return control before desktop actions."
  ].join("\n");
}

export { buildComputerUsePromptInjection as b, computerUseTargetModeLabel as c, defaultComputerUsePreferences as d, isCuaToolName as i, parseComputerUseTargetMode as p };
