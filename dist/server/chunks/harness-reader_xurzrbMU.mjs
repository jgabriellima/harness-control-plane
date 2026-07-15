import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { D as DEFAULT_PRESENTATION_TITLE } from './ui-branding_xMGaxulv.mjs';
import './harness-binding_CgEjapvr.mjs';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { d as resolveActiveWorkspaceRoot } from './workspace-manager_C2YuGzrP.mjs';
let loadBusinessConfig, loadReadinessSnapshot, getProjectDetail, loadScheduleRegistry, loadRecentScheduleEvents, listProjects, getExecutionDetail, listConversations, listExecutions;
let __tla = (async ()=>{
    const READINESS_READ_RETRIES = 3;
    const READINESS_READ_DELAY_MS = 25;
    async function harnessPaths(workspaceRoot) {
        const binding = await resolveWorkspaceHarnessBinding({
            workspaceRoot
        });
        const stateDir = join(binding.harnessRoot, "state");
        return {
            binding,
            dslPath: binding.dslPath,
            readinessPath: join(stateDir, "readiness.yaml"),
            readinessTmpPath: join(stateDir, "readiness.yaml.tmp"),
            scheduleRegistryPath: join(stateDir, "schedule-registry.yaml"),
            scheduleEventsPath: join(stateDir, "schedule-events.jsonl"),
            runsDir: binding.runsDir,
            tracesDir: binding.tracesDir
        };
    }
    function isRecord(value) {
        return typeof value === "object" && value !== null;
    }
    function defaultProjectDisplayName() {
        return process.env.CONTROL_PLANE_PRESENTATION_TITLE?.trim() || DEFAULT_PRESENTATION_TITLE;
    }
    function asString(value, fallback = "") {
        return typeof value === "string" ? value : fallback;
    }
    async function sleep(ms) {
        await new Promise((resolve)=>setTimeout(resolve, ms));
    }
    async function snapshotWriteInProgress(readinessTmpPath) {
        try {
            await access(readinessTmpPath);
            return true;
        } catch (error) {
            if (error.code === "ENOENT") {
                return false;
            }
            throw error;
        }
    }
    function parseBusinessConfig(value) {
        if (!isRecord(value)) {
            throw new Error("Invalid business.yaml root");
        }
        const project = value.project;
        if (!isRecord(project)) {
            throw new Error("Invalid business.yaml project section");
        }
        const executionRaw = value.execution;
        const execution = isRecord(executionRaw) && typeof executionRaw === "object" ? {
            defaultWorkflow: typeof executionRaw.defaultWorkflow === "string" ? executionRaw.defaultWorkflow : typeof executionRaw.default_workflow === "string" ? executionRaw.default_workflow : void 0,
            default_workflow: typeof executionRaw.default_workflow === "string" ? executionRaw.default_workflow : void 0
        } : void 0;
        const baselineRaw = value.baseline;
        const baseline = isRecord(baselineRaw) ? {
            harnessBaselineTag: typeof baselineRaw.harnessBaselineTag === "string" ? baselineRaw.harnessBaselineTag : typeof baselineRaw.harness_baseline_tag === "string" ? baselineRaw.harness_baseline_tag : void 0,
            harness_baseline_tag: typeof baselineRaw.harness_baseline_tag === "string" ? baselineRaw.harness_baseline_tag : void 0
        } : void 0;
        const runtimeRaw = value.runtime;
        const runtime = isRecord(runtimeRaw) ? {
            engine: asString(runtimeRaw.engine, "stub"),
            commands: Array.isArray(runtimeRaw.commands) ? runtimeRaw.commands.filter((item)=>typeof item === "string") : void 0,
            commandsPath: typeof runtimeRaw.commandsPath === "string" ? runtimeRaw.commandsPath : typeof runtimeRaw.commands_path === "string" ? runtimeRaw.commands_path : void 0
        } : void 0;
        return {
            version: asString(value.version, "1.0"),
            status: asString(value.status, "unknown"),
            initialized: typeof value.initialized === "string" ? value.initialized : null,
            project: {
                name: asString(project.name, defaultProjectDisplayName()),
                description: asString(project.description, "")
            },
            execution,
            baseline,
            runtime
        };
    }
    function parseExecutionStatus(value) {
        const status = asString(value, "pending");
        switch(status){
            case "pending":
            case "in_progress":
            case "completed":
            case "blocked":
            case "failed":
            case "paused":
            case "running":
            case "queued":
                return status;
            default:
                return "pending";
        }
    }
    function parseExecutionManifest(value, runId) {
        if (!isRecord(value)) {
            throw new Error(`Invalid execution manifest for ${runId}`);
        }
        const metadata = value.metadata;
        if (!isRecord(metadata)) {
            throw new Error(`Missing execution manifest metadata for ${runId}`);
        }
        const manifestRunId = asString(metadata.run_id, runId);
        if (manifestRunId !== runId) {
            throw new Error(`Execution manifest run_id mismatch for ${runId}`);
        }
        const nodesRaw = value.nodes;
        const nodes = {};
        if (isRecord(nodesRaw)) {
            for (const [nodeId, nodeValue] of Object.entries(nodesRaw)){
                if (!isRecord(nodeValue)) {
                    continue;
                }
                nodes[nodeId] = {
                    id: asString(nodeValue.id, nodeId),
                    status: asString(nodeValue.status, "pending"),
                    startedAt: typeof nodeValue.started_at === "string" ? nodeValue.started_at : typeof nodeValue.startedAt === "string" ? nodeValue.startedAt : null,
                    completedAt: typeof nodeValue.completed_at === "string" ? nodeValue.completed_at : typeof nodeValue.completedAt === "string" ? nodeValue.completedAt : null
                };
            }
        }
        const paths = value.paths;
        const execution = value.execution;
        return {
            apiVersion: asString(value.apiVersion, "business.jambu/v1"),
            kind: asString(value.kind, "WorkflowRunManifest"),
            runId: manifestRunId,
            workflowId: asString(metadata.workflow_id),
            status: parseExecutionStatus(value.status),
            intent: asString(value.intent),
            recordedAt: asString(metadata.recorded_at),
            updatedAt: asString(metadata.updated_at),
            executionMode: isRecord(execution) ? asString(execution.mode, "stub") : "stub",
            nodes,
            paths: {
                outputDir: isRecord(paths) ? asString(paths.output_dir) : "",
                tracePath: isRecord(paths) ? asString(paths.trace_path) : "",
                statePath: isRecord(paths) ? asString(paths.state_path) : ""
            }
        };
    }
    function toExecutionSummary(manifest) {
        return {
            id: manifest.runId,
            workflowId: manifest.workflowId,
            status: manifest.status,
            intent: manifest.intent,
            recordedAt: manifest.recordedAt,
            updatedAt: manifest.updatedAt
        };
    }
    function parseWorkflowTrace(value, runId) {
        if (!isRecord(value)) {
            return null;
        }
        const metadata = value.metadata;
        if (!isRecord(metadata)) {
            return null;
        }
        const traceRunId = asString(metadata.runId, asString(metadata.run_id, runId));
        if (traceRunId !== runId) {
            return null;
        }
        const workflow = value.workflow;
        const state = value.state;
        return {
            apiVersion: asString(value.apiVersion, "business.jambu/v1"),
            kind: asString(value.kind, "WorkflowTrace"),
            metadata: {
                runId: traceRunId,
                workflowId: asString(metadata.workflowId, asString(metadata.workflow_id)),
                recordedAt: asString(metadata.recordedAt, asString(metadata.recorded_at))
            },
            workflow: {
                status: isRecord(workflow) ? asString(workflow.status) : "",
                intent: isRecord(workflow) ? asString(workflow.intent) : ""
            },
            state: isRecord(state) ? state : {}
        };
    }
    function assertReadinessSnapshot(value) {
        if (!isRecord(value)) {
            return null;
        }
        if (!Array.isArray(value.slots)) {
            return null;
        }
        const slots = value.slots.filter(isRecord).map((slot)=>({
                slotId: asString(slot.slotId, asString(slot.slot_id)),
                provider: asString(slot.provider),
                status: asString(slot.status),
                secretsMissing: Array.isArray(slot.secretsMissing) ? slot.secretsMissing.filter((item)=>typeof item === "string") : Array.isArray(slot.secrets_missing) ? slot.secrets_missing.filter((item)=>typeof item === "string") : [],
                ready: slot.ready === true
            }));
        return {
            apiVersion: asString(value.apiVersion, "business.jambu/v1"),
            kind: asString(value.kind, "ReadinessSnapshot"),
            generatedAt: asString(value.generatedAt, asString(value.generated_at)),
            overall: asString(value.overall, "unknown"),
            doctorMode: typeof value.doctorMode === "string" ? value.doctorMode : typeof value.doctor_mode === "string" ? value.doctor_mode : void 0,
            slots
        };
    }
    loadBusinessConfig = async function(workspaceRoot) {
        const paths = await harnessPaths(workspaceRoot);
        const raw = await readFile(paths.dslPath, "utf8");
        return parseBusinessConfig(parse(raw));
    };
    listProjects = async function() {
        const { listWorkspaceProjects } = await import('./workspace-manager_C2YuGzrP.mjs').then((n)=>n.w);
        return listWorkspaceProjects();
    };
    const STUB_PROJECT_MEMBERS = [
        {
            id: "operator",
            name: "Operator",
            role: "owner"
        },
        {
            id: "platform-team",
            name: "Platform Team",
            role: "member"
        }
    ];
    function buildRuntimeProfile(projectId, config) {
        const baselineTag = config.baseline?.harnessBaselineTag ?? config.baseline?.harness_baseline_tag ?? config.version;
        return {
            profile_id: projectId,
            runtime: config.runtime?.engine ?? "stub",
            baseline: baselineTag,
            permissions: [],
            tools: config.runtime?.commands ?? [],
            limits: {}
        };
    }
    getProjectDetail = async function(projectId) {
        const projects = await listProjects();
        const project = projects.find((entry)=>entry.id === projectId);
        if (!project) {
            return null;
        }
        const config = await loadBusinessConfig();
        return {
            ...project,
            members: STUB_PROJECT_MEMBERS,
            runtime_profile: buildRuntimeProfile(projectId, config)
        };
    };
    listConversations = async function() {
        const { listProfileConversations } = await import('./runtime-orchestrator_CdeKZAGP.mjs').then(async (m)=>{
            await m.__tla;
            return m;
        }).then((n)=>n.e);
        return listProfileConversations();
    };
    async function readExecutionManifest(runId, runsDir) {
        if (runId === "ACTIVE") {
            return null;
        }
        const manifestPath = join(runsDir, runId, "manifest.yaml");
        try {
            const raw = await readFile(manifestPath, "utf8");
            return parseExecutionManifest(parse(raw), runId);
        } catch (error) {
            const code = error.code;
            if (code === "ENOENT" || code === "ENOTDIR") {
                return null;
            }
            throw error;
        }
    }
    async function readWorkflowTrace(runId, tracesDir) {
        const tracePath = join(tracesDir, `${runId}.yaml`);
        try {
            const raw = await readFile(tracePath, "utf8");
            return parseWorkflowTrace(parse(raw), runId);
        } catch (error) {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        }
    }
    function shouldIncludeRunDirectory(entry) {
        if (entry.name === "ACTIVE") {
            return false;
        }
        return entry.isDirectory();
    }
    async function listRunDirectoryNames(runsDir) {
        try {
            const entries = await readdir(runsDir, {
                withFileTypes: true
            });
            return entries.filter(shouldIncludeRunDirectory).map((entry)=>entry.name);
        } catch (error) {
            if (error.code === "ENOENT") {
                return [];
            }
            throw error;
        }
    }
    listExecutions = async function(workspaceRoot) {
        const paths = await harnessPaths(workspaceRoot);
        const entries = await listRunDirectoryNames(paths.runsDir);
        const summaries = [];
        for (const entry of entries){
            const manifest = await readExecutionManifest(entry, paths.runsDir);
            if (manifest) {
                summaries.push(toExecutionSummary(manifest));
            }
        }
        return summaries.sort((left, right)=>right.updatedAt.localeCompare(left.updatedAt));
    };
    getExecutionDetail = async function(executionId) {
        const paths = await harnessPaths();
        const manifest = await readExecutionManifest(executionId, paths.runsDir);
        if (!manifest) {
            return null;
        }
        const trace = await readWorkflowTrace(executionId, paths.tracesDir);
        return {
            id: executionId,
            manifest,
            trace
        };
    };
    loadReadinessSnapshot = async function() {
        const paths = await harnessPaths();
        for(let attempt = 0; attempt < READINESS_READ_RETRIES; attempt += 1){
            if (await snapshotWriteInProgress(paths.readinessTmpPath)) {
                await sleep(READINESS_READ_DELAY_MS);
                continue;
            }
            try {
                const raw = await readFile(paths.readinessPath, "utf8");
                return assertReadinessSnapshot(parse(raw));
            } catch (error) {
                if (error.code === "ENOENT") {
                    return null;
                }
                throw error;
            }
        }
        return null;
    };
    function assertScheduleRegistry(value) {
        if (!isRecord(value)) {
            return null;
        }
        const metadata = value.metadata;
        const spec = value.spec;
        if (!isRecord(metadata) || !isRecord(spec)) {
            return null;
        }
        const entriesRaw = spec.entries;
        const entries = [];
        if (Array.isArray(entriesRaw)) {
            for (const item of entriesRaw){
                if (!isRecord(item)) {
                    continue;
                }
                const triggerRaw = item.trigger;
                const trigger = isRecord(triggerRaw) ? {
                    type: asString(triggerRaw.type),
                    schedule: typeof triggerRaw.schedule === "string" ? triggerRaw.schedule : void 0,
                    action: typeof triggerRaw.action === "string" ? triggerRaw.action : void 0,
                    path: typeof triggerRaw.path === "string" ? triggerRaw.path : void 0
                } : {
                    type: "schedule"
                };
                entries.push({
                    id: asString(item.id),
                    workflowId: asString(item.workflowId),
                    dslPath: asString(item.dslPath),
                    trigger,
                    enabled: Boolean(item.enabled),
                    intentTemplate: asString(item.intentTemplate),
                    runtime: asString(item.runtime, "agent"),
                    concurrency: asString(item.concurrency, "forbid"),
                    misfirePolicy: asString(item.misfirePolicy, "coalesce"),
                    nextRunAt: typeof item.nextRunAt === "string" ? item.nextRunAt : null,
                    lastRunAt: typeof item.lastRunAt === "string" ? item.lastRunAt : null,
                    lastRunId: typeof item.lastRunId === "string" ? item.lastRunId : null,
                    lastStatus: typeof item.lastStatus === "string" ? item.lastStatus : null,
                    source: typeof item.source === "string" ? item.source : void 0,
                    title: typeof item.title === "string" ? item.title : void 0,
                    description: typeof item.description === "string" ? item.description : void 0,
                    icon: typeof item.icon === "string" ? item.icon : void 0
                });
            }
        }
        return {
            apiVersion: asString(value.apiVersion, "business.jambu/v1"),
            kind: asString(value.kind, "ScheduleRegistry"),
            metadata: {
                generatedAt: asString(metadata.generatedAt),
                sourceHash: typeof metadata.sourceHash === "string" ? metadata.sourceHash : void 0
            },
            spec: {
                entries
            }
        };
    }
    loadScheduleRegistry = async function(workspaceRoot) {
        const resolvedRoot = await resolveActiveWorkspaceRoot();
        const paths = await harnessPaths(resolvedRoot);
        try {
            const raw = await readFile(paths.scheduleRegistryPath, "utf8");
            return assertScheduleRegistry(parse(raw));
        } catch (error) {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        }
    };
    loadRecentScheduleEvents = async function(limit = 50, workspaceRoot) {
        const resolvedRoot = await resolveActiveWorkspaceRoot();
        const paths = await harnessPaths(resolvedRoot);
        try {
            const raw = await readFile(paths.scheduleEventsPath, "utf8");
            const lines = raw.split("\n").filter((line)=>line.trim().length > 0);
            const tail = lines.slice(-limit);
            const events = [];
            for (const line of tail){
                try {
                    const parsed = JSON.parse(line);
                    if (!isRecord(parsed)) {
                        continue;
                    }
                    events.push({
                        event: asString(parsed.event),
                        ts: typeof parsed.ts === "string" ? parsed.ts : void 0,
                        entryId: typeof parsed.entryId === "string" ? parsed.entryId : void 0,
                        workflowId: typeof parsed.workflowId === "string" ? parsed.workflowId : void 0,
                        runId: typeof parsed.runId === "string" ? parsed.runId : void 0,
                        status: typeof parsed.status === "string" ? parsed.status : void 0,
                        reason: typeof parsed.reason === "string" ? parsed.reason : void 0,
                        source: typeof parsed.source === "string" ? parsed.source : void 0
                    });
                } catch  {
                    continue;
                }
            }
            return events;
        } catch (error) {
            if (error.code === "ENOENT") {
                return [];
            }
            throw error;
        }
    };
})();
export { loadBusinessConfig as a, loadReadinessSnapshot as b, getProjectDetail as c, loadScheduleRegistry as d, loadRecentScheduleEvents as e, listProjects as f, getExecutionDetail as g, listConversations as h, listExecutions as l, __tla };
