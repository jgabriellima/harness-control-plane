/**
 * doctor_contract interpreter (ADR-013 extension).
 * Provider-specific doctor checks live in integration YAML — framework only implements check types.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type DoctorMode = "structural" | "operational";

export interface DoctorEmitters {
  pass: (check: string, message?: string) => void;
  warn: (check: string, message: string, remediation?: string) => void;
  fail: (check: string, message: string, remediation?: string) => void;
}

export interface DoctorContractContext {
  group: string;
  providerId: string;
  configRel: string;
  integration: Record<string, unknown>;
  doctorMode: DoctorMode;
  projectStatus: string;
  integrationStatus: string;
  repoRoot: string;
  checkPrefix: string;
  emit: DoctorEmitters;
  resolveSkill: (skill: string) => { path: string; layout: "flat" | "directory" } | null;
}

interface DoctorCheck {
  id: string;
  type: string;
  modes?: string[];
  yaml_path?: string;
  min_keys?: number;
  path?: string;
  skill?: string;
  when_integration_has?: string;
  required_when_project?: string;
  remediation?: string;
  env_var_from?: string;
  env_var_default?: string;
  url?: string;
  header_api_key?: string;
  expect_status?: string;
  on_missing_env?: "warn" | "fail" | "pass";
  skip_message?: string;
}

const SUPPORTED_CHECK_TYPES = new Set([
  "yaml_scalar_required",
  "yaml_object_min_keys",
  "file_required",
  "skill_required",
  "http_status",
]);

export function getYamlPath(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function expandBraceTemplate(
  template: string,
  integration: Record<string, unknown>
): string {
  return template.replace(/\{([a-z0-9_.]+)\}/gi, (_, path: string) => {
    const value = getYamlPath(integration, path);
    return value === undefined || value === null ? "" : String(value);
  });
}

function checkAppliesToMode(check: DoctorCheck, doctorMode: DoctorMode): boolean {
  const modes = check.modes;
  if (!modes || modes.length === 0) return true;
  return modes.includes(doctorMode) || modes.includes("both");
}

function whenIntegrationHas(check: DoctorCheck, integration: Record<string, unknown>): boolean {
  const key = check.when_integration_has;
  if (!key) return true;
  return getYamlPath(integration, key) !== undefined;
}

function requiredForProject(check: DoctorCheck, projectStatus: string): boolean {
  const when = check.required_when_project;
  if (!when || when === "always") return true;
  if (when === "operational") return projectStatus === "operational";
  if (when === "uninitialized") return projectStatus === "uninitialized";
  return true;
}

function runYamlScalarRequired(ctx: DoctorContractContext, check: DoctorCheck): void {
  const path = check.yaml_path ?? "";
  const value = getYamlPath(ctx.integration, path);
  const label = `${ctx.checkPrefix}${check.id}`;
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    ctx.emit.pass(label);
  } else {
    ctx.emit.fail(
      label,
      `${path} not set in ${ctx.configRel}`,
      check.remediation ?? `Set ${path} in ${ctx.configRel}`
    );
  }
}

function runYamlObjectMinKeys(ctx: DoctorContractContext, check: DoctorCheck): void {
  const path = check.yaml_path ?? "";
  const value = getYamlPath(ctx.integration, path);
  const label = `${ctx.checkPrefix}${check.id}`;
  const minKeys = check.min_keys ?? 1;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const count = Object.keys(value as Record<string, unknown>).length;
    if (count >= minKeys) {
      ctx.emit.pass(label);
    } else {
      ctx.emit.fail(
        label,
        `${path} has ${count} keys (need >= ${minKeys}) in ${ctx.configRel}`,
        check.remediation ?? `Populate ${path} in ${ctx.configRel}`
      );
    }
  } else {
    ctx.emit.fail(label, `${path} missing or not an object in ${ctx.configRel}`, check.remediation);
  }
}

function runFileRequired(ctx: DoctorContractContext, check: DoctorCheck): void {
  const rel = check.path ?? "";
  const full = join(ctx.repoRoot, rel);
  const label = `${ctx.checkPrefix}${check.id}`;
  if (existsSync(full)) {
    ctx.emit.pass(label);
  } else {
    ctx.emit.fail(label, `Missing: ${rel}`, check.remediation ?? `Create ${rel}`);
  }
}

function runSkillRequired(ctx: DoctorContractContext, check: DoctorCheck): void {
  const skill = check.skill ?? "";
  const label = `${ctx.checkPrefix}${check.id}`;
  const resolved = ctx.resolveSkill(skill);
  const remediation = `Create .cursor/skills/${skill}/SKILL.md`;

  if (resolved) {
    if (resolved.layout === "flat") {
      ctx.emit.warn(
        label,
        `Deprecated flat skill path: ${resolved.path}`,
        `Migrate to .cursor/skills/${skill}/SKILL.md`
      );
    } else {
      ctx.emit.pass(label);
    }
  } else {
    ctx.emit.fail(label, `Missing skill: ${skill}`, remediation);
  }
}

function runHttpStatus(ctx: DoctorContractContext, check: DoctorCheck): void {
  const label = `${ctx.checkPrefix}${check.id}`;

  if (ctx.doctorMode !== "operational") {
    ctx.emit.pass(label, check.skip_message ?? "structural mode — live check deferred");
    return;
  }

  const envPath = check.env_var_from ?? "";
  const envVar =
    (envPath ? String(getYamlPath(ctx.integration, envPath) ?? "") : "") ||
    check.env_var_default ||
    "API_KEY";
  const apiKey = process.env[envVar] ?? "";
  const onMissing = check.on_missing_env ?? "warn";

  if (!apiKey) {
    const msg = `${envVar} not set`;
    const remediation = `export ${envVar}=...`;
    if (ctx.integrationStatus === "pending_credentials" || onMissing === "warn") {
      ctx.emit.warn(label, `${msg} — integration pending_credentials`, remediation);
    } else if (onMissing === "pass") {
      ctx.emit.pass(label, msg);
    } else {
      ctx.emit.fail(label, msg, remediation);
    }
    return;
  }

  const urlTemplate = check.url ?? "";
  const url = expandBraceTemplate(urlTemplate, ctx.integration);
  if (!url || url.includes("undefined") || url.includes("//workspaces//")) {
    ctx.emit.fail(label, `Invalid URL from template ${urlTemplate}`, "Fix connection fields in integration YAML");
    return;
  }

  const headerName = check.header_api_key ?? "Authorization";
  const expectStatus = check.expect_status ?? "200";

  try {
    const result = execSync(
      `curl -s -o /dev/null -w "%{http_code}" -H "${headerName}: ${apiKey}" "${url}"`,
      { timeout: 8000, encoding: "utf-8" }
    ).trim();
    if (result === expectStatus) {
      ctx.emit.pass(label);
    } else {
      ctx.emit.warn(label, `HTTP ${result} (expected ${expectStatus}) — check ${envVar}`, `export ${envVar}=...`);
    }
  } catch {
    ctx.emit.warn(label, "HTTP probe timed out or network unavailable");
  }
}

export function validateDoctorContractShape(
  contract: unknown,
  providerId: string
): string[] {
  const errors: string[] = [];
  if (!contract || typeof contract !== "object") {
    return ["doctor_contract section missing"];
  }
  const c = contract as Record<string, unknown>;
  if (c.version !== "1.0") {
    errors.push(`doctor_contract.version must be '1.0' (got ${String(c.version)})`);
  }
  const checks = c.checks;
  if (!Array.isArray(checks) || checks.length === 0) {
    errors.push("doctor_contract.checks must be a non-empty array");
    return errors;
  }
  for (const raw of checks) {
    if (!raw || typeof raw !== "object") continue;
    const check = raw as DoctorCheck;
    if (!check.id || !check.type) {
      errors.push("each doctor_contract check requires id and type");
      continue;
    }
    if (!SUPPORTED_CHECK_TYPES.has(check.type)) {
      errors.push(`${providerId}: unsupported doctor check type '${check.type}'`);
    }
  }
  return errors;
}

export function runDoctorContract(ctx: DoctorContractContext): boolean {
  const contract = ctx.integration.doctor_contract;
  if (!contract || typeof contract !== "object") {
    return false;
  }

  const checks = (contract as { checks?: DoctorCheck[] }).checks ?? [];
  for (const check of checks) {
    if (!checkAppliesToMode(check, ctx.doctorMode)) continue;
    if (!whenIntegrationHas(check, ctx.integration)) continue;
    if (!requiredForProject(check, ctx.projectStatus)) {
      ctx.emit.pass(`${ctx.checkPrefix}${check.id}`, "not required for current project status");
      continue;
    }

    switch (check.type) {
      case "yaml_scalar_required":
        runYamlScalarRequired(ctx, check);
        break;
      case "yaml_object_min_keys":
        runYamlObjectMinKeys(ctx, check);
        break;
      case "file_required":
        runFileRequired(ctx, check);
        break;
      case "skill_required":
        runSkillRequired(ctx, check);
        break;
      case "http_status":
        runHttpStatus(ctx, check);
        break;
      default:
        ctx.emit.warn(
          `${ctx.checkPrefix}${check.id}`,
          `Unsupported doctor check type: ${check.type}`,
          "Extend doctor-contract.ts or fix integration YAML"
        );
    }
  }
  return true;
}

/** Structural validation of doctor_contract (authoring / validate-contract). */
export function validateDoctorContractFile(
  integration: Record<string, unknown>,
  providerId: string
): string[] {
  return validateDoctorContractShape(integration.doctor_contract, providerId);
}
