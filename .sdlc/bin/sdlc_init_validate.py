#!/usr/bin/env python3
"""Validate /sdlc:init selections artifact (ADR-029 PROJ-3)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

CLOSURE_REQUIRES = {
    "staging-validated": ["deploy"],
    "production-validated": ["deploy", "post_deploy"],
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(data: dict) -> list[str]:
    errors: list[str] = []

    if data.get("version") != 1:
        errors.append("version must be 1")
    if not data.get("confirmed_at"):
        errors.append("confirmed_at is required — user must confirm questionnaire")

    delivery = data.get("delivery") or {}
    closure = delivery.get("default_closure", "local-validated")
    slots = data.get("slots") or {}

    for slot in CLOSURE_REQUIRES.get(closure, []):
        if slots.get(slot, "none") in ("none", "", None):
            errors.append(
                f"delivery.default_closure={closure} requires slots.{slot} != none"
            )

    if slots.get("work_items") in ("none", "", None):
        errors.append("slots.work_items cannot be none (ADR-025)")

    incident_token = slots.get("incident", "none")
    incident_block = data.get("incident")
    if incident_token == "none" and incident_block not in (None, {}):
        errors.append("incident block must be null when slots.incident is none")
    if incident_token != "none" and not incident_block:
        errors.append("incident block required when slots.incident is set")

    if incident_block and incident_token != incident_block.get("provider_token"):
        errors.append("incident.provider_token must match slots.incident")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate init-selections.json")
    parser.add_argument("--file", required=True, help="Path to .init-selections.json")
    args = parser.parse_args()

    path = Path(args.file)
    if not path.is_file():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 1

    data = load_json(path)
    errors = validate(data)
    if errors:
        for err in errors:
            print(f"FAIL: {err}", file=sys.stderr)
        return 1

    print(f"OK: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
