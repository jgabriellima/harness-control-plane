#!/usr/bin/env python3
"""Dispatch function.invoke for SDLC composite workflows."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Any

from _sdlc_paths import BIN_DIR, REPO_ROOT, workflow_runtime_limits
from sdlc_command_dispatch import build_agent_prompt, ref_to_command_path
from sdlc_ref_resolver import RunContext
from sdlc_profile import active_ticket_from_manifest  # noqa: E402
from sdlc_workflow_gate import build_node_output
from sdlc_workflow_stub import build_stub_cognitive_output


def _node_id_from_invoke(invoke: dict[str, Any], ctx: RunContext) -> str:
    step = invoke.get("step")
    if step and str(step) != "loop":
        return str(step)
    return ctx.node_id


def _load_agent_prompt(ref: str, objective: str, ctx: RunContext) -> str:
    agent_path = REPO_ROOT / ref if not ref.startswith("/") else None
    if agent_path and agent_path.is_file():
        body = agent_path.read_text(encoding="utf-8")
        return (
            f"# Agent ref: {ref}\n\n"
            f"## Runtime objective\n{objective.strip()}\n\n"
            f"## Run context\nrunId={ctx.run_id} nodeId={ctx.node_id}\n\n"
            f"## Agent protocol\n{body}\n"
        )
    ctx_summary = {
        "runId": ctx.run_id,
        "nodeId": ctx.node_id,
        "intent": ctx.intent,
    }
    return build_agent_prompt(ref, objective, ctx_summary)


def _load_skill_prompt(ref: str, objective: str, ctx: RunContext) -> str:
    skill_path = REPO_ROOT / ref
    if not skill_path.is_file():
        raise FileNotFoundError(f"skill ref not found: {ref!r}")
    body = skill_path.read_text(encoding="utf-8")
    return (
        f"# Skill ref: {ref}\n\n"
        f"## Runtime objective\n{objective.strip()}\n\n"
        f"## Run context\nrunId={ctx.run_id} nodeId={ctx.node_id}\n\n"
        f"## Skill procedure\n{body}\n"
    )


def _resolve_ticket_id(ctx: RunContext) -> str:
    manifest = ctx.manifest
    ticket_id = str(manifest.get("ticket_id") or manifest.get("active_ticket_id") or "")
    if ticket_id:
        return ticket_id
    found = active_ticket_from_manifest(manifest)
    if found:
        return found[0]
    from sdlc_workflow_run_resolve import ensure_feature_flow_child_ticket, is_feature_flow_child_run

    if is_feature_flow_child_run(ctx.run_id):
        healed = ensure_feature_flow_child_ticket(ctx.run_id)
        if healed:
            from sdlc_workflow_manifest import load_manifest

            manifest.clear()
            manifest.update(load_manifest(ctx.run_id))
            return healed[0]
    return ""


def _substitute_subprocess_args(args: list[Any], ctx: RunContext) -> list[str]:
    ticket_id = _resolve_ticket_id(ctx)
    resolved: list[str] = []
    for raw in args:
        text = str(raw).replace("{run_id}", ctx.run_id).replace("{ticket_id}", ticket_id)
        resolved.append(text)
    return resolved


def invoke_function(
    invoke: dict[str, Any],
    ctx: RunContext,
    mode: str,
) -> dict[str, Any]:
    invoke_type = str(invoke.get("type", "command"))
    ref = str(invoke.get("ref", ""))
    node_id = _node_id_from_invoke(invoke, ctx)
    objective = str(invoke.get("objective") or ctx.manifest.get("intent", ""))

    if invoke_type == "playbook":
        raise ValueError(f"playbook invoke forbidden on {node_id!r}")

    if invoke_type in ("command", "agent", "skill"):
        if mode == "stub":
            print(f"STUB_SYNTH node={node_id} type={invoke_type} ref={ref}", file=sys.stderr)
            return build_stub_cognitive_output(node_id, ctx.run_id, ref)

        if invoke_type == "command":
            cmd_path = ref_to_command_path(ref) if ref.startswith("/") else REPO_ROOT / ref
            if not cmd_path.is_file():
                raise FileNotFoundError(f"missing command file for {ref!r}: {cmd_path}")
            prompt = _load_agent_prompt(ref, objective, ctx)
        elif invoke_type == "agent":
            agent_path = REPO_ROOT / ref
            if not agent_path.is_file():
                raise FileNotFoundError(f"missing agent file: {ref!r}")
            prompt = _load_agent_prompt(ref, objective, ctx)
        else:
            prompt = _load_skill_prompt(ref, objective, ctx)

        del prompt  # agent mode requires Cursor dispatch — stub-only until wired
        raise RuntimeError(
            f"agent mode invoke not yet wired for {node_id!r} — use --mode stub or invoke via Cursor command {ref!r}",
        )

    if invoke_type == "subprocess":
        if mode == "stub":
            print(f"STUB_SUBPROCESS node={node_id} ref={ref}", file=sys.stderr)
            return build_stub_cognitive_output(node_id, ctx.run_id, ref)

        cmd = invoke.get("command")
        args = _substitute_subprocess_args(invoke.get("args") or [], ctx)
        if not cmd:
            raise ValueError(f"subprocess invoke missing command: ref={ref!r}")
        timeout_s = workflow_runtime_limits().get("subprocess_timeout_seconds", 300)
        try:
            proc = subprocess.run(
                [str(cmd), *args],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                timeout=timeout_s,
            )
        except subprocess.TimeoutExpired as exc:
            return build_node_output(
                ctx.node_id,
                ctx.run_id,
                f"subprocess timed out after {timeout_s}s: {ref}",
                "script.inline",
                "FAIL",
                str(exc.stderr or exc.stdout or exc),
            )
        if proc.returncode != 0:
            return build_node_output(
                ctx.node_id,
                ctx.run_id,
                proc.stderr or proc.stdout or "subprocess failed",
                "script.inline",
                "FAIL",
                proc.stderr or proc.stdout or "",
            )
        if ctx.output_dir:
            cognitive_path = ctx.output_dir / "cognitive" / f"{ctx.node_id}.json"
            if cognitive_path.is_file():
                import json

                with cognitive_path.open(encoding="utf-8") as handle:
                    doc = json.load(handle)
                if isinstance(doc, dict) and doc.get("nodeId") == ctx.node_id:
                    structured = (
                        doc.get("structured") if isinstance(doc.get("structured"), dict) else {}
                    )
                    # Do not reuse stale FAIL cognitive from a prior retry — subprocess succeeded.
                    if str(structured.get("gateOutcome") or "").upper() != "FAIL":
                        return doc
        return build_node_output(
            ctx.node_id,
            ctx.run_id,
            proc.stdout or "subprocess complete",
            "script.inline",
            "PASS",
            proc.stderr or proc.stdout or "",
        )

    raise ValueError(f"unsupported invoke: type={invoke_type!r} ref={ref!r}")
