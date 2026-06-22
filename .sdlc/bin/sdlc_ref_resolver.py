#!/usr/bin/env python3
"""Resolve $ references in SDLC workflow condition targets and gate inputs."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PRIOR_REF = re.compile(r"^\$prior\.([a-z0-9-]+)\.output(?:\.(.+))?$")
JSONPATH_SEGMENT = re.compile(r"^([a-zA-Z_][a-zA-Z0-9_]*)$")


@dataclass
class RunContext:
    run_id: str
    intent: str
    manifest: dict[str, Any]
    node_id: str
    execution_mode: str = "stub"
    node_output: dict[str, Any] | None = None
    prior_outputs: dict[str, dict[str, Any]] = field(default_factory=dict)
    prior_artifacts: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    output_dir: Path | None = None


def _jsonpath_slice(data: Any, path: str) -> Any:
    if not path:
        return data
    current = data
    for segment in path.split("."):
        if not JSONPATH_SEGMENT.match(segment):
            raise ValueError(f"unsupported jsonpath segment: {segment!r}")
        if not isinstance(current, dict):
            raise ValueError(f"cannot traverse {segment!r} on non-object")
        current = current.get(segment)
    return current


def resolve_ref(ref: str, ctx: RunContext) -> Any:
    if ref == "$node.output":
        if ctx.node_output is None:
            raise ValueError("$node.output unavailable before function.invoke")
        return ctx.node_output

    if ref.startswith("$node.output."):
        if ctx.node_output is None:
            raise ValueError("$node.output unavailable before function.invoke")
        return _jsonpath_slice(ctx.node_output, ref.removeprefix("$node.output."))

    if ref == "$run.intent":
        return ctx.intent

    if ref == "$run.manifest":
        return ctx.manifest

    if ref.startswith("$run.manifest."):
        return _jsonpath_slice(ctx.manifest, ref.removeprefix("$run.manifest."))

    if ref == "$run.artifacts":
        flat: list[dict[str, Any]] = []
        for arts in ctx.prior_artifacts.values():
            flat.extend(arts)
        return flat

    prior_match = PRIOR_REF.match(ref)
    if prior_match:
        node_id = prior_match.group(1)
        subpath = prior_match.group(2) or ""
        prior = ctx.prior_outputs.get(node_id)
        if prior is None:
            raise ValueError(f"$prior.{node_id}.output not available")
        return _jsonpath_slice(prior, subpath) if subpath else prior

    raise ValueError(f"unsupported reference: {ref!r}")


def resolve_value(value: Any, ctx: RunContext) -> Any:
    if isinstance(value, str) and value.startswith("$"):
        return resolve_ref(value, ctx)
    if isinstance(value, dict):
        return {k: resolve_value(v, ctx) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_value(v, ctx) for v in value]
    return value
