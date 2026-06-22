#!/usr/bin/env python3
"""Resolve SDLC slash-command refs to .cursor/commands/*.md files."""
from __future__ import annotations

from pathlib import Path

from _sdlc_paths import REPO_ROOT

# ADR-024 — legacy slash triggers → canonical namespace
COMMAND_ALIASES: dict[str, str] = {
    "/sdlc:e2e": "/sdlc:goal",
    "/spec:create": "/sdlc:spec",
    "/plan": "/sdlc:plan",
    "/feature": "/sdlc:feature",
    "/implement-feature": "/sdlc:implement",
    "/deploy-release": "/sdlc:deploy",
    "/fix-incident": "/sdlc:incident",
    "/hydrate-context": "/sdlc:hydrate",
    "/handoff": "/sdlc:handoff",
    "/reset": "/sdlc:reset",
    "/run-e2e": "/run:e2e",
    "/browser-use": "/run:browser",
    "/browser-user": "/run:browser",
    "/sdlc:cua": "/run:cua",
}


def normalize_command(ref: str) -> str:
    ref = ref.strip()
    if not ref.startswith("/"):
        ref = f"/{ref}"
    return COMMAND_ALIASES.get(ref, ref)


def ref_to_command_path(ref: str) -> Path:
    """Map /sdlc:plan, /sdlc:init, /run:e2e → command markdown path."""
    ref = normalize_command(ref.strip())
    if not ref.startswith("/"):
        return REPO_ROOT / ref

    slug = ref.strip("/").replace(":", "-").replace("/", "-")
    tail = ref.strip("/").split(":")[-1]
    candidates = [
        REPO_ROOT / f".cursor/commands/{slug}.md",
        REPO_ROOT / f".cursor/commands/{tail}.md",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return candidates[0]


def load_command_markdown(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    front: dict[str, str] = {}
    body = text
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            for line in parts[1].strip().splitlines():
                if ":" in line:
                    key, val = line.split(":", 1)
                    front[key.strip()] = val.strip()
            body = parts[2].strip()
    return front, body


def build_agent_prompt(ref: str, objective: str, ctx_summary: dict[str, object]) -> str:
    path = ref_to_command_path(ref)
    if not path.is_file():
        raise FileNotFoundError(f"command file not found for ref {ref!r}: {path}")
    _front, body = load_command_markdown(path)
    return (
        f"# Invoke ref: {ref}\n\n"
        f"## Runtime objective\n{objective.strip()}\n\n"
        f"## Run context\n```json\n{ctx_summary}\n```\n\n"
        f"## Command procedure\n{body}\n"
    )
