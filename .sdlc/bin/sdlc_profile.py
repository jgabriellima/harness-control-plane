#!/usr/bin/env python3
"""Ticket-scoped QA evidence mode — interpreter for profile-qa.manifest.yaml (ADR-029)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from _sdlc_paths import SDLC_ROOT, load_sdlc_yaml

MANIFEST_PATH = SDLC_ROOT / "config" / "profile-qa.manifest.yaml"

QA_SURFACE_BROWSER = "browser"
QA_SURFACE_HEADLESS = "headless"


def workspace_profile(sdlc: dict[str, Any] | None = None) -> str:
    """Stack label from sdlc.yaml — descriptive only; does NOT select QA evidence mode."""
    source = load_sdlc_yaml() if sdlc is None else sdlc
    workspace = source.get("workspace") or {}
    profile = workspace.get("profile") if isinstance(workspace, dict) else None
    return str(profile).strip().lower() if isinstance(profile, str) else ""


def _load_work_item_ticket(ticket_id: str) -> dict[str, Any] | None:
    try:
        from local_ticket_state import load_ticket

        doc = load_ticket(ticket_id)
        return doc if isinstance(doc, dict) else None
    except Exception:
        return None


def hydrate_ticket_qa_fields(ticket_id: str, ticket: dict[str, Any]) -> None:
    """Copy qa_surface / validation_checks from work-item store when manifest ticket lacks them."""
    source = _load_work_item_ticket(ticket_id)
    if not source:
        return
    if not ticket.get("qa_surface") and source.get("qa_surface"):
        ticket["qa_surface"] = source["qa_surface"]
    if not ticket.get("validation_checks") and source.get("validation_checks"):
        ticket["validation_checks"] = source["validation_checks"]


def active_ticket_from_manifest(
    manifest: dict[str, Any],
) -> tuple[str, dict[str, Any]] | None:
    tickets = manifest.get("tickets") or {}
    if not isinstance(tickets, dict) or not tickets:
        return None

    active_id = manifest.get("active_ticket_id") or manifest.get("ticket_id")
    if isinstance(active_id, str) and active_id in tickets:
        entry = tickets[active_id]
        if isinstance(entry, dict):
            hydrate_ticket_qa_fields(active_id, entry)
            return active_id, entry

    if len(tickets) == 1:
        ticket_id, entry = next(iter(tickets.items()))
        if isinstance(entry, dict):
            hydrate_ticket_qa_fields(str(ticket_id), entry)
            return str(ticket_id), entry

    waves = manifest.get("waves") or []
    if isinstance(waves, list):
        for wave in waves:
            if not isinstance(wave, dict):
                continue
            if wave.get("status") not in ("in_progress", "pending", None):
                continue
            for ticket_id in wave.get("tickets") or []:
                if not isinstance(ticket_id, str):
                    continue
                entry = tickets.get(ticket_id)
                if isinstance(entry, dict):
                    hydrate_ticket_qa_fields(ticket_id, entry)
                    return ticket_id, entry

    for ticket_id, entry in tickets.items():
        if isinstance(entry, dict) and entry.get("role") not in ("epic", "content-post"):
            hydrate_ticket_qa_fields(str(ticket_id), entry)
            return str(ticket_id), entry
    return None


def load_work_item_ticket(ticket_id: str) -> dict[str, Any] | None:
    """Load ticket document from active work-items provider storage."""
    return _load_work_item_ticket(ticket_id)


def validate_ticket_qa_contract(ticket: dict[str, Any], ticket_id: str = "") -> list[str]:
    """Return validation errors; empty list means ADR-029 ticket QA contract is satisfied."""
    label = ticket_id or str(ticket.get("id") or "ticket")
    errors: list[str] = []

    surface, err = resolve_qa_surface_from_ticket(ticket, ticket_id=label)
    if err:
        errors.append(err)
        return errors

    if surface == QA_SURFACE_HEADLESS:
        checks = _checks_from_ticket(ticket)
        if not checks:
            errors.append(
                f"{label}: headless qa_surface requires non-empty validation_checks "
                "with {name: str, cmd: list[str]} entries",
            )
        return errors

    raw = ticket.get("validation_checks")
    if raw is None:
        return errors
    if not isinstance(raw, list):
        errors.append(f"{label}: validation_checks must be a list when present")
        return errors
    if raw and not _checks_from_ticket(ticket):
        errors.append(
            f"{label}: validation_checks entries must include name (str) and cmd (list[str])",
        )
    return errors


def resolve_qa_surface_from_ticket(
    ticket: dict[str, Any] | None,
    *,
    ticket_id: str = "",
) -> tuple[str | None, str | None]:
    """Return (surface, error). qa_surface MUST be on the ticket."""
    if not ticket:
        label = ticket_id or "ticket"
        return None, f"{label}: missing ticket — qa_surface is declared on the work item at spec-flow"
    qa_surface = ticket.get("qa_surface")
    if not isinstance(qa_surface, str) or not qa_surface.strip():
        label = ticket_id or str(ticket.get("id") or "ticket")
        return (
            None,
            f"{label}: qa_surface missing — set browser|headless on ticket at spec-flow / plane-ticket",
        )
    surface = qa_surface.strip().lower()
    if surface not in known_surfaces():
        label = ticket_id or str(ticket.get("id") or "ticket")
        return None, f"{label}: qa_surface={surface!r} invalid — must be one of {sorted(known_surfaces())}"
    return surface, None


def resolve_qa_surface(
    profile: str | None = None,
    target_root: Path | None = None,
    *,
    manifest: dict[str, Any] | None = None,
    ticket: dict[str, Any] | None = None,
    ticket_id: str = "",
    sdlc: dict[str, Any] | None = None,
) -> str:
    """Resolve surface from ticket. Raises ValueError when ticket contract is incomplete."""
    del profile, target_root, sdlc
    active = ticket
    active_id = ticket_id
    if active is None and manifest is not None:
        found = active_ticket_from_manifest(manifest)
        if found:
            active_id, active = found
    surface, err = resolve_qa_surface_from_ticket(active, ticket_id=active_id)
    if err or not surface:
        raise ValueError(err or "qa_surface unresolved — ticket contract incomplete")
    return surface


@lru_cache(maxsize=1)
def load_profile_qa_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.is_file():
        raise FileNotFoundError(f"missing profile QA manifest: {MANIFEST_PATH}")
    with MANIFEST_PATH.open(encoding="utf-8") as handle:
        doc = yaml.safe_load(handle)
    if not isinstance(doc, dict):
        raise ValueError(f"invalid manifest document: {MANIFEST_PATH}")
    spec = doc.get("spec")
    if not isinstance(spec, dict):
        raise ValueError(f"manifest missing spec: {MANIFEST_PATH}")
    return spec


def known_surfaces() -> frozenset[str]:
    spec = load_profile_qa_manifest()
    surfaces = spec.get("surfaces") or {}
    if not isinstance(surfaces, dict):
        return frozenset()
    return frozenset(str(key) for key in surfaces)


def gate_required_surface(adapter_id: str) -> str | None:
    spec = load_profile_qa_manifest()
    gates = spec.get("gates") or {}
    if not isinstance(gates, dict):
        return None
    entry = gates.get(adapter_id)
    if not isinstance(entry, dict):
        return None
    surface = entry.get("surface")
    return str(surface) if isinstance(surface, str) else None


def gate_defer_message(adapter_id: str, active_surface: str) -> str | None:
    required = gate_required_surface(adapter_id)
    if required is None or required == active_surface:
        return None
    spec = load_profile_qa_manifest()
    gates = spec.get("gates") or {}
    if not isinstance(gates, dict):
        return None
    entry = gates.get(adapter_id)
    if not isinstance(entry, dict):
        return None
    template = entry.get("defer_message")
    if not isinstance(template, str):
        return f"{adapter_id} N/A (ticket qa_surface={active_surface})"
    return template.format(surface=active_surface, adapter=adapter_id)


def gate_deferred_for_surface(adapter_id: str, active_surface: str) -> bool:
    required = gate_required_surface(adapter_id)
    return required is not None and required != active_surface


def _checks_from_ticket(ticket: dict[str, Any]) -> list[tuple[str, list[str]]]:
    raw = ticket.get("validation_checks")
    if not isinstance(raw, list):
        return []
    resolved: list[tuple[str, list[str]]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        cmd = entry.get("cmd")
        if isinstance(name, str) and isinstance(cmd, list) and all(isinstance(part, str) for part in cmd):
            resolved.append((name, list(cmd)))
    return resolved


def local_validation_checks(
    target_root: Path,
    sdlc: dict[str, Any] | None = None,
    *,
    manifest: dict[str, Any] | None = None,
    ticket: dict[str, Any] | None = None,
) -> list[tuple[str, list[str]]]:
    del target_root, sdlc
    surface = resolve_qa_surface(manifest=manifest, ticket=ticket)
    spec = load_profile_qa_manifest()
    surfaces = spec.get("surfaces") or {}
    surface_spec = surfaces.get(surface) if isinstance(surfaces, dict) else None
    if not isinstance(surface_spec, dict):
        return []

    validate_local = surface_spec.get("validate_local") or {}
    if not isinstance(validate_local, dict):
        return []

    if validate_local.get("checks_from") == "ticket.validation_checks":
        active = ticket
        if active is None and manifest is not None:
            found = active_ticket_from_manifest(manifest)
            if found:
                _, active = found
        if not isinstance(active, dict):
            return []
        return _checks_from_ticket(active)

    fixed_checks = validate_local.get("checks")
    if not isinstance(fixed_checks, list):
        return []

    resolved: list[tuple[str, list[str]]] = []
    for entry in fixed_checks:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        cmd = entry.get("cmd")
        if isinstance(name, str) and isinstance(cmd, list) and all(isinstance(part, str) for part in cmd):
            resolved.append((name, list(cmd)))
    return resolved
