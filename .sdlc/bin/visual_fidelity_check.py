#!/usr/bin/env python3
"""
Visual fidelity gate — compare reference PNGs against current implementation screenshots.

Exit 0 when overall_pass; exit 1 otherwise.
Playbook: pb.webdesign.visual-fidelity-gate (ADR-010)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageChops
except ImportError as exc:
    print("ERROR: Pillow required — pip install Pillow", file=sys.stderr)
    raise SystemExit(2) from exc

PIXEL_DIFF_PASS = 5.0
PIXEL_DIFF_WARN = 15.0
TOKEN_MATCH_PASS = 90.0
COMBINED_SCORE_PASS = 85.0

VIEWPORT_PAIRS = (
    ("reference-desktop-1280.png", "current-desktop-1280.png", "desktop-1280"),
    ("reference-tablet-768.png", "current-tablet-768.png", "tablet-768"),
    ("reference-mobile-375.png", "current-mobile-375.png", "mobile-375"),
)


@dataclass
class ViewportResult:
    name: str
    reference: str
    current: str
    diff_pct: float | None
    diff_image: str | None
    status: str
    reason: str = ""


@dataclass
class TokenResult:
    token_id: str
    property_name: str
    expected: str
    actual: str
    match: bool
    selector: str


@dataclass
class FidelityReport:
    timestamp: str
    viewports: list[ViewportResult] = field(default_factory=list)
    tokens: list[TokenResult] = field(default_factory=list)
    structural: list[dict[str, Any]] = field(default_factory=list)
    pixel_score: float = 0.0
    token_score: float = 0.0
    structural_score: float = 0.0
    combined_score: float = 0.0
    overall_pass: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "viewports": [v.__dict__ for v in self.viewports],
            "tokens": [t.__dict__ for t in self.tokens],
            "structural": self.structural,
            "pixel_score": self.pixel_score,
            "token_score": self.token_score,
            "structural_score": self.structural_score,
            "combined_score": self.combined_score,
            "overall_pass": self.overall_pass,
        }


def parse_token_table(contract_path: Path) -> list[dict[str, str]]:
    if not contract_path.is_file():
        return []
    text = contract_path.read_text(encoding="utf-8")
    rows: list[dict[str, str]] = []
    in_table = False
    for line in text.splitlines():
        if "## Token table" in line or "| Token ID |" in line:
            in_table = True
            continue
        if in_table and line.startswith("## "):
            break
        if not in_table or not line.startswith("|"):
            continue
        if "Token ID" in line or re.match(r"^\|[-| ]+\|$", line):
            continue
        parts = [p.strip() for p in line.strip("|").split("|")]
        if len(parts) >= 4:
            rows.append(
                {
                    "token_id": parts[0],
                    "property": parts[1],
                    "expected": parts[2],
                    "selector": parts[3],
                }
            )
    return rows


def parse_structural_checklist(contract_path: Path) -> list[str]:
    if not contract_path.is_file():
        return []
    text = contract_path.read_text(encoding="utf-8")
    items: list[str] = []
    in_section = False
    for line in text.splitlines():
        if "## Structural checklist" in line:
            in_section = True
            continue
        if in_section and line.startswith("## "):
            break
        if in_section:
            m = re.match(r"^- \[ \] (.+)$", line.strip())
            if m:
                items.append(m.group(1))
    return items


def pixel_diff_pct(ref_path: Path, cur_path: Path, diff_path: Path) -> float:
    ref = Image.open(ref_path).convert("RGB")
    cur = Image.open(cur_path).convert("RGB")
    if ref.size != cur.size:
        cur = cur.resize(ref.size, Image.Resampling.LANCZOS)
    diff = ImageChops.difference(ref, cur)
    diff_path.parent.mkdir(parents=True, exist_ok=True)
    diff.save(diff_path)
    if hasattr(diff, "get_flattened_data"):
        pixels = list(diff.get_flattened_data())
    else:
        pixels = list(diff.getdata())
    total = len(pixels)
    if total == 0:
        return 100.0
    differing = sum(1 for r, g, b in pixels if r > 10 or g > 10 or b > 10)
    return (differing / total) * 100.0


def classify_diff(pct: float) -> str:
    if pct <= PIXEL_DIFF_PASS:
        return "PASS"
    if pct <= PIXEL_DIFF_WARN:
        return "WARN"
    return "FAIL"


def audit_tokens_via_playwright(url: str, tokens: list[dict[str, str]]) -> list[TokenResult]:
    if not tokens or not url:
        return []
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return [
            TokenResult(
                token_id=t["token_id"],
                property_name=t["property"],
                expected=t["expected"],
                actual="SKIPPED: playwright not installed",
                match=False,
                selector=t["selector"],
            )
            for t in tokens
        ]

    results: list[TokenResult] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(url, wait_until="networkidle", timeout=30_000)
        for t in tokens:
            prop = t["property"].lower().replace("_", "-")
            selector = t["selector"]
            try:
                actual = page.eval_on_selector(
                    selector,
                    f"(el) => getComputedStyle(el).getPropertyValue('{prop}') || "
                    f"getComputedStyle(el).{prop.replace('-', '')}",
                )
                if actual is None:
                    actual = "MISSING"
            except Exception:
                actual = "MISSING"
            expected_norm = t["expected"].strip().lower().replace(" ", "")
            actual_norm = str(actual).strip().lower().replace(" ", "")
            match = expected_norm == actual_norm or expected_norm in actual_norm
            results.append(
                TokenResult(
                    token_id=t["token_id"],
                    property_name=t["property"],
                    expected=t["expected"],
                    actual=str(actual),
                    match=match,
                    selector=selector,
                )
            )
        browser.close()
    return results


def audit_structural_via_playwright(url: str, items: list[str]) -> list[dict[str, Any]]:
    if not items or not url:
        return []
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return [{"item": i, "pass": False, "reason": "playwright missing"} for i in items]

    checks: list[dict[str, Any]] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(url, wait_until="networkidle", timeout=30_000)
        for item in items:
            low = item.lower()
            passed = False
            reason = ""
            if "sidebar" in low:
                passed = page.locator('[data-testid="sidebar"]').count() > 0
                reason = "data-testid=sidebar present" if passed else "sidebar not found"
            elif "header" in low:
                passed = page.locator('[data-testid="site-header"], header').count() > 0
                reason = "header present" if passed else "header not found"
            else:
                passed = True
                reason = "manual review required"
            checks.append({"item": item, "pass": passed, "reason": reason})
        browser.close()
    return checks


def compute_scores(
    viewports: list[ViewportResult],
    tokens: list[TokenResult],
    structural: list[dict[str, Any]],
) -> tuple[float, float, float, float]:
    measured = [v for v in viewports if v.diff_pct is not None]
    if measured:
        avg_diff = sum(v.diff_pct if v.diff_pct is not None else 100.0 for v in measured) / len(
            measured
        )
        pixel_score = max(0.0, 100.0 - avg_diff)
    else:
        pixel_score = 0.0

    token_score = (sum(1 for t in tokens if t.match) / len(tokens)) * 100.0 if tokens else 100.0
    structural_score = (
        (sum(1 for s in structural if s.get("pass")) / len(structural)) * 100.0
        if structural
        else 100.0
    )
    combined = pixel_score * 0.5 + token_score * 0.3 + structural_score * 0.2
    return pixel_score, token_score, structural_score, combined


def write_markdown_report(report: FidelityReport, output_path: Path) -> None:
    lines = [
        f"# Visual Fidelity Report — {report.timestamp}",
        "",
        f"## Overall: {'PASS' if report.overall_pass else 'FAIL'}",
        f"- Combined score: **{report.combined_score:.1f}%** (threshold >= {COMBINED_SCORE_PASS}%)",
        "",
        "## Viewport comparison",
        "| Viewport | Diff % | Status |",
        "|---|---|---|",
    ]
    for v in report.viewports:
        diff_str = f"{v.diff_pct:.2f}%" if v.diff_pct is not None else "-"
        lines.append(f"| {v.name} | {diff_str} | {v.status} |")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run(args: argparse.Namespace) -> int:
    ref_dir = Path(args.reference).resolve()
    cur_dir = Path(args.current).resolve()
    contract = Path(args.contract).resolve() if args.contract else None

    report = FidelityReport(timestamp=datetime.now(timezone.utc).isoformat())

    for ref_name, cur_name, vp_name in VIEWPORT_PAIRS:
        ref_path = ref_dir / ref_name
        cur_path = cur_dir / cur_name
        if not ref_path.is_file():
            report.viewports.append(
                ViewportResult(
                    name=vp_name,
                    reference=str(ref_path),
                    current=str(cur_path),
                    diff_pct=None,
                    diff_image=None,
                    status="SKIP",
                    reason="reference missing",
                )
            )
            continue
        if not cur_path.is_file():
            report.viewports.append(
                ViewportResult(
                    name=vp_name,
                    reference=str(ref_path),
                    current=str(cur_path),
                    diff_pct=100.0,
                    diff_image=None,
                    status="FAIL",
                    reason="current screenshot missing",
                )
            )
            continue
        diff_path = cur_dir / f"diff-{vp_name}.png"
        pct = pixel_diff_pct(ref_path, cur_path, diff_path)
        report.viewports.append(
            ViewportResult(
                name=vp_name,
                reference=str(ref_path),
                current=str(cur_path),
                diff_pct=pct,
                diff_image=str(diff_path),
                status=classify_diff(pct),
            )
        )

    token_rows = parse_token_table(contract) if contract else []
    report.tokens = audit_tokens_via_playwright(args.url or "", token_rows)
    structural_items = parse_structural_checklist(contract) if contract else []
    report.structural = audit_structural_via_playwright(args.url or "", structural_items)

    ps, ts, ss, combined = compute_scores(report.viewports, report.tokens, report.structural)
    report.pixel_score = ps
    report.token_score = ts
    report.structural_score = ss
    report.combined_score = combined

    measured_fail = any(v.status == "FAIL" for v in report.viewports if v.status != "SKIP")
    token_fail = bool(report.tokens) and report.token_score < TOKEN_MATCH_PASS
    structural_fail = bool(report.structural) and report.structural_score < 100.0

    report.overall_pass = (
        combined >= COMBINED_SCORE_PASS
        and not measured_fail
        and not token_fail
        and not structural_fail
    )

    if args.output:
        write_markdown_report(report, Path(args.output))
    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")

    print(f"visual_fidelity_score={report.combined_score:.1f}% overall_pass={report.overall_pass}")
    return 0 if report.overall_pass else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Visual fidelity gate (pb.webdesign.visual-fidelity-gate)")
    parser.add_argument("--reference", required=True)
    parser.add_argument("--current", required=True)
    parser.add_argument("--contract")
    parser.add_argument("--url")
    parser.add_argument("--output")
    parser.add_argument("--json")
    raise SystemExit(run(parser.parse_args()))


if __name__ == "__main__":
    main()
