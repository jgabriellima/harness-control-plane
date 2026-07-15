import { spawn, execFile } from 'node:child_process';
import { platform, homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { C as COMPUTER_USE_PERMISSION_STEPS } from './runtime-computer-use-copy_DmXbiJtE.mjs';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
let activateComputerUse, preparePermissionGrant, ensureDaemonRunning, openMacPermissionSettings, probeComputerUseSetup, startPermissionsGrantDetached, tryCompleteComputerUseSetup;
let __tla = (async ()=>{
    const execFileAsync = promisify(execFile);
    const INSTALL_SCRIPT = "curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh | bash";
    function driverExecEnv() {
        const localBin = join(homedir(), ".local/bin");
        const pathValue = process.env.PATH ?? "";
        const augmented = pathValue.includes(localBin) ? pathValue : `${localBin}:${pathValue}`;
        return {
            ...process.env,
            PATH: augmented
        };
    }
    async function runDriver(args, options = {}) {
        const timeoutMs = options.timeoutMs ?? 6e4;
        try {
            const result = await execFileAsync("cua-driver", args, {
                env: driverExecEnv(),
                timeout: timeoutMs,
                maxBuffer: 4 * 1024 * 1024
            });
            return {
                stdout: String(result.stdout),
                stderr: String(result.stderr),
                code: 0
            };
        } catch (error) {
            if (options.ignoreError && error && typeof error === "object") {
                const execError = error;
                return {
                    stdout: String(execError.stdout ?? ""),
                    stderr: String(execError.stderr ?? ""),
                    code: typeof execError.code === "number" ? execError.code : 1
                };
            }
            throw error;
        }
    }
    async function isDriverOnPath() {
        try {
            await execFileAsync("command", [
                "-v",
                "cua-driver"
            ], {
                env: driverExecEnv(),
                shell: true,
                timeout: 5e3
            });
            return true;
        } catch  {
            return false;
        }
    }
    function extractJsonObject(raw) {
        const trimmed = raw.trim();
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed === "object" && parsed !== null) {
                return parsed;
            }
        } catch  {}
        const match = trimmed.match(/\{[\s\S]*\}/);
        if (!match) {
            return null;
        }
        try {
            const parsed = JSON.parse(match[0]);
            if (typeof parsed === "object" && parsed !== null) {
                return parsed;
            }
        } catch  {
            return null;
        }
        return null;
    }
    function isRecord(value) {
        return typeof value === "object" && value !== null;
    }
    async function readMcpConfig(path) {
        try {
            const raw = await readFile(path, "utf8");
            const parsed = JSON.parse(raw);
            return isRecord(parsed) ? parsed : {};
        } catch (error) {
            if (error.code === "ENOENT") {
                return {};
            }
            throw error;
        }
    }
    async function mergeMcpSnippet(targetPath, snippet) {
        const servers = snippet.mcpServers;
        if (!isRecord(servers)) {
            throw new Error("cua-driver mcp-config did not return mcpServers");
        }
        await mkdir(join(targetPath, ".."), {
            recursive: true
        });
        const existing = await readMcpConfig(targetPath);
        const existingServers = isRecord(existing.mcpServers) ? existing.mcpServers : {};
        const merged = {
            ...existing,
            mcpServers: {
                ...existingServers,
                ...servers
            }
        };
        await writeFile(targetPath, `${JSON.stringify(merged, null, 2)}
`, "utf8");
    }
    async function wireCuaDriverMcp(workspaceRoot) {
        const { stdout } = await runDriver([
            "mcp-config",
            "--client",
            "cursor"
        ], {
            timeoutMs: 15e3
        });
        const snippet = extractJsonObject(stdout);
        if (!snippet) {
            throw new Error("Failed to parse cua-driver mcp-config output");
        }
        const paths = [];
        const projectMcp = join(workspaceRoot, ".cursor", "mcp.json");
        await mergeMcpSnippet(projectMcp, snippet);
        paths.push(projectMcp);
        const userMcp = join(homedir(), ".cursor", "mcp.json");
        if (userMcp !== projectMcp) {
            await mergeMcpSnippet(userMcp, snippet);
            paths.push(userMcp);
        }
        return paths;
    }
    async function installDriver() {
        await execFileAsync("bash", [
            "-lc",
            INSTALL_SCRIPT
        ], {
            env: driverExecEnv(),
            timeout: 18e4,
            maxBuffer: 8 * 1024 * 1024
        });
    }
    async function stopDaemon() {
        await runDriver([
            "stop"
        ], {
            timeoutMs: 1e4,
            ignoreError: true
        });
        if (platform() === "darwin") {
            try {
                await execFileAsync("osascript", [
                    "-e",
                    'tell application "CuaDriver" to quit'
                ], {
                    timeout: 5e3
                });
            } catch  {}
            try {
                await execFileAsync("killall", [
                    "CuaDriver"
                ], {
                    timeout: 5e3
                });
            } catch  {}
            await new Promise((resolve)=>setTimeout(resolve, 400));
        }
    }
    preparePermissionGrant = async function() {
        await stopDaemon();
    };
    async function restartDaemonAfterPermissions() {
        await stopDaemon();
        return ensureDaemonRunning();
    }
    ensureDaemonRunning = async function() {
        if (platform() === "darwin") {
            try {
                await execFileAsync("open", [
                    "-n",
                    "-g",
                    "-a",
                    "CuaDriver",
                    "--args",
                    "serve"
                ], {
                    timeout: 1e4
                });
                await new Promise((resolve)=>setTimeout(resolve, 1500));
                return true;
            } catch  {
                return false;
            }
        }
        try {
            const { code } = await runDriver([
                "status"
            ], {
                timeoutMs: 5e3,
                ignoreError: true
            });
            if (code === 0) {
                return true;
            }
            await runDriver([
                "serve",
                "--no-permissions-gate"
            ], {
                timeoutMs: 3e3,
                ignoreError: true
            });
            return true;
        } catch  {
            return false;
        }
    };
    async function probeDaemonRunning() {
        try {
            const { code } = await runDriver([
                "status"
            ], {
                timeoutMs: 5e3,
                ignoreError: true
            });
            return code === 0;
        } catch  {
            return false;
        }
    }
    function permissionsGrantedFromText(output) {
        const lower = output.toLowerCase();
        if (lower.includes("granted") && !lower.includes("not granted") && !lower.includes("denied")) {
            return true;
        }
        if (lower.includes("✅") || lower.includes("[ok")) {
            return !lower.includes("missing") && !lower.includes("denied");
        }
        return false;
    }
    async function probePermissionsGranted() {
        if (platform() !== "darwin") {
            try {
                const { stdout, code } = await runDriver([
                    "doctor",
                    "--json"
                ], {
                    timeoutMs: 2e4,
                    ignoreError: true
                });
                if (code === 0) {
                    return true;
                }
                const parsed = extractJsonObject(stdout);
                if (parsed && Array.isArray(parsed.probes)) {
                    return parsed.probes.every((probe)=>!isRecord(probe) || probe.status !== "error");
                }
            } catch  {
                return false;
            }
            return false;
        }
        try {
            const { stdout } = await runDriver([
                "permissions",
                "status"
            ], {
                timeoutMs: 15e3,
                ignoreError: true
            });
            return permissionsGrantedFromText(stdout);
        } catch  {
            return false;
        }
    }
    startPermissionsGrantDetached = function() {
        if (platform() !== "darwin") {
            return;
        }
        try {
            const child = spawn("cua-driver", [
                "permissions",
                "grant"
            ], {
                env: driverExecEnv(),
                detached: true,
                stdio: "ignore"
            });
            child.unref();
        } catch  {}
    };
    openMacPermissionSettings = async function() {
        if (platform() !== "darwin") {
            return;
        }
        const panels = [
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility",
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        ];
        for (const panel of panels){
            try {
                await execFileAsync("open", [
                    panel
                ], {
                    timeout: 5e3
                });
            } catch  {}
        }
    };
    probeComputerUseSetup = async function(workspaceRoot) {
        const binding = await resolveHarnessBinding(workspaceRoot ? {
            workspaceRoot
        } : {});
        const root = binding.workspaceRoot;
        const driverInstalled = await isDriverOnPath();
        let mcpConfigured = false;
        const mcpConfigPaths = [];
        for (const candidate of [
            join(root, ".cursor", "mcp.json"),
            join(homedir(), ".cursor", "mcp.json")
        ]){
            try {
                const config = await readMcpConfig(candidate);
                const servers = config.mcpServers;
                if (isRecord(servers) && isRecord(servers["cua-driver"])) {
                    mcpConfigured = true;
                    mcpConfigPaths.push(candidate);
                }
            } catch  {}
        }
        const daemonRunning = driverInstalled ? await probeDaemonRunning() : false;
        const permissionsGranted = driverInstalled ? await probePermissionsGranted() : false;
        const ready = driverInstalled && mcpConfigured && permissionsGranted;
        let phase = "idle";
        let message = null;
        let userAction = null;
        if (!driverInstalled) {
            phase = "idle";
            message = "Driver not installed";
        } else if (!mcpConfigured) {
            phase = "configuring";
            message = "MCP configuration pending";
        } else if (!permissionsGranted) {
            phase = "permissions";
            message = "macOS permissions required";
            userAction = platform() === "darwin" ? COMPUTER_USE_PERMISSION_STEPS : "Complete platform permission prompts for Cua Driver.";
        } else {
            phase = "ready";
            message = "Computer use is ready";
        }
        return {
            phase,
            ready,
            driverInstalled,
            mcpConfigured,
            daemonRunning,
            permissionsGranted,
            platform: platform(),
            message,
            userAction,
            mcpConfigPaths
        };
    };
    activateComputerUse = async function(workspaceRoot) {
        const binding = await resolveHarnessBinding(workspaceRoot ? {
            workspaceRoot
        } : {});
        const root = binding.workspaceRoot;
        try {
            if (!await isDriverOnPath()) {
                await installDriver();
            }
            if (!await isDriverOnPath()) {
                throw new Error("cua-driver install finished but binary is not on PATH. Restart the app and try again.");
            }
            await wireCuaDriverMcp(root);
            if (platform() === "darwin" && !await probePermissionsGranted()) {
                await preparePermissionGrant();
                startPermissionsGrantDetached();
            } else {
                await ensureDaemonRunning();
            }
            const setup = await probeComputerUseSetup(root);
            if (setup.ready) {
                await restartDaemonAfterPermissions();
                const { saveComputerUsePreferences } = await import('./runtime-computer-use-preferences_NdHwuD2F.mjs');
                await saveComputerUsePreferences({
                    hostControlEnabled: true
                }, root);
                return {
                    setup: {
                        ...setup,
                        phase: "ready"
                    },
                    activated: true
                };
            }
            return {
                setup,
                activated: false
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Computer use activation failed";
            const setup = await probeComputerUseSetup(root);
            return {
                setup: {
                    ...setup,
                    phase: "error",
                    ready: false,
                    message,
                    userAction: "Retry activation or open System Settings manually."
                },
                activated: false
            };
        }
    };
    tryCompleteComputerUseSetup = async function(workspaceRoot) {
        const binding = await resolveHarnessBinding(workspaceRoot ? {
            workspaceRoot
        } : {});
        const root = binding.workspaceRoot;
        const { loadComputerUsePreferences, saveComputerUsePreferences } = await import('./runtime-computer-use-preferences_NdHwuD2F.mjs');
        const preferences = await loadComputerUsePreferences(root);
        if (preferences.hostControlEnabled) {
            return {
                restarted: false,
                activated: true
            };
        }
        const setup = await probeComputerUseSetup(root);
        if (!setup.driverInstalled || !setup.mcpConfigured) {
            return {
                restarted: false,
                activated: false
            };
        }
        await restartDaemonAfterPermissions();
        const granted = await probePermissionsGranted();
        if (!granted) {
            return {
                restarted: true,
                activated: false
            };
        }
        await saveComputerUsePreferences({
            hostControlEnabled: true
        }, root);
        return {
            restarted: true,
            activated: true
        };
    };
})();
export { activateComputerUse as a, preparePermissionGrant as b, ensureDaemonRunning as e, openMacPermissionSettings as o, probeComputerUseSetup as p, startPermissionsGrantDetached as s, tryCompleteComputerUseSetup as t, __tla };
