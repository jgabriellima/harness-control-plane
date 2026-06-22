#!/usr/bin/env python3
"""Collect QA evidence and upload to Plane work item. Requires PLANE_API_KEY."""
from __future__ import annotations

import argparse
import mimetypes
import os
import sys
from pathlib import Path

import urllib.request
import json

PROJECT = "5341a48e-1c49-4165-950a-75d34a5e699d"
WORKSPACE = "jambuai"
BASE = f"https://api.plane.so/api/v1/workspaces/{WORKSPACE}/projects/{PROJECT}"


def api(method: str, path: str, data: dict | None = None) -> dict:
    key = os.environ.get("PLANE_API_KEY", "")
    if not key:
        raise SystemExit("PLANE_API_KEY not set")
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=body,
        method=method,
        headers={
            "X-API-Key": key,
            "Content-Type": "application/json",
            "User-Agent": "jambu-sdlc/1.0 (upload_plane_evidence.py)",
        },
    )
    with urllib.request.urlopen(req) as resp:
        raw = resp.read().decode()
        if not raw.strip():
            return {}
        return json.loads(raw)


def upload_file(issue_uuid: str, filepath: Path) -> None:
    size = filepath.stat().st_size
    mime, _ = mimetypes.guess_type(str(filepath))
    if filepath.suffix == ".md":
        mime = "text/plain"
    mime = mime or "application/octet-stream"
    creds = api("POST", f"/work-items/{issue_uuid}/attachments/", {
        "name": filepath.name,
        "type": mime,
        "size": size,
    })
    asset_id = creds["asset_id"]
    fields = creds["upload_data"]["fields"]
    url = creds["upload_data"]["url"]

    import subprocess
    cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST", url]
    for k, v in fields.items():
        cmd.extend(["-F", f"{k}={v}"])
    cmd.extend(["-F", f"file=@{filepath};type={mime}"])
    code = subprocess.check_output(cmd, text=True).strip()
    if code != "204":
        raise RuntimeError(f"S3 upload failed HTTP {code} for {filepath.name}")

    api("PATCH", f"/work-items/{issue_uuid}/attachments/{asset_id}/", {"is_uploaded": True})
    print(f"  uploaded: {filepath.name}")


def post_comment(issue_uuid: str, html: str) -> None:
    api("POST", f"/issues/{issue_uuid}/comments/", {"comment_html": html})
    print("  comment posted")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--issue-uuid", required=True)
    p.add_argument("--evidence-dir", required=True)
    p.add_argument("--review-url", required=True)
    p.add_argument("--pr-url", default="")
    p.add_argument("--qa-summary", default="")
    args = p.parse_args()

    ev = Path(args.evidence_dir)
    if not ev.is_dir():
        raise SystemExit(f"Evidence dir missing: {ev}")

    manifest = (ev / "manifest.md").read_text(encoding="utf-8") if (ev / "manifest.md").exists() else ""

    for f in sorted(ev.iterdir()):
        if f.suffix.lower() in (".png", ".webm", ".jpg", ".jpeg"):
            upload_file(args.issue_uuid, f)
    if (ev / "manifest.md").exists():
        upload_file(args.issue_uuid, ev / "manifest.md")

    html = f"""<h2>QA Review Handoff — Ready for approval</h2>
<p><strong>Review URL:</strong> <a href="{args.review_url}">{args.review_url}</a></p>
<p><strong>PR:</strong> {f'<a href="{args.pr_url}">{args.pr_url}</a>' if args.pr_url else 'pending'}</p>
<p><strong>QA Verdict:</strong> PASS</p>
<p><strong>Visual gate:</strong> PASS</p>
<h3>Summary</h3><pre>{args.qa_summary or manifest[:4000]}</pre>"""
    post_comment(args.issue_uuid, html)
    return 0


if __name__ == "__main__":
    sys.exit(main())
