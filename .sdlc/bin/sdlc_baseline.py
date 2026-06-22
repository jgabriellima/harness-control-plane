#!/usr/bin/env python3
"""Baseline lifecycle CLI — init, advance, verify, status (ADR-014).

Consumer projects use `{slug}-sdlc-v{major}.{minor}.0` tags.
Authoring monorepo uses `v0.{N}.0-sdlc` tags when packages/ai-native-sdlc exists.
"""
from __future__ import annotations

import argparse
import fnmatch
import re
import subprocess
import sys
from datetime import date
from typing import Literal

from _sdlc_paths import REPO_ROOT, SDLC_YAML, load_sdlc_yaml, workspace_target_rel

Classification = Literal["structural", "feature", "ambiguous"]

AUTHORING_TAG_RE = re.compile(r"^v0\.(\d+)\.0-sdlc$")
CONSUMER_TAG_RE = re.compile(r"^(.+)-sdlc-v(\d+)\.(\d+)\.0$")

PACKAGE_EXCLUDE_GLOBS = (
    "packages/**/node_modules/**",
    "**/*.tsbuildinfo",
    "packages/**/templates/sdlc/pipeline/.last-plan.json",
)


def _run_git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(REPO_ROOT), *args],
        capture_output=True,
        text=True,
        check=check,
    )


def is_authoring_repo() -> bool:
    return (REPO_ROOT / "packages" / "ai-native-sdlc").is_dir()


def project_slug() -> str:
    data = load_sdlc_yaml()
    project = data.get("project") or {}
    name = ""
    if isinstance(project, dict):
        raw = project.get("name")
        if isinstance(raw, str) and raw.strip():
            name = raw.strip()
    if not name:
        name = REPO_ROOT.name
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.lower()).strip("-")
    return slug or "project"


def load_baseline_block() -> dict[str, object]:
    baseline = load_sdlc_yaml().get("baseline")
    return baseline if isinstance(baseline, dict) else {}


def save_sdlc_yaml(data: dict[str, object]) -> None:
    try:
        import yaml
    except ImportError as exc:
        raise SystemExit("PyYAML required: pip install pyyaml") from exc
    SDLC_YAML.write_text(yaml.dump(data, sort_keys=False, default_flow_style=False), encoding="utf-8")


def tag_exists(tag: str) -> bool:
    if not tag:
        return False
    result = _run_git("rev-parse", tag, check=False)
    return result.returncode == 0


def git_changed_paths(since_tag: str | None) -> list[str]:
    paths: set[str] = set()
    if since_tag and tag_exists(since_tag):
        diff = _run_git("diff", f"{since_tag}..HEAD", "--name-only", check=False)
        if diff.returncode == 0:
            paths.update(p.strip() for p in diff.stdout.splitlines() if p.strip())
    status = _run_git("status", "--porcelain", check=False)
    if status.returncode == 0:
        for line in status.stdout.splitlines():
            if len(line) >= 4:
                paths.add(line[3:].strip())
    return sorted(paths)


def _matches_any(path: str, patterns: tuple[str, ...], target_root: str) -> bool:
    normalized = path.replace("\\", "/")
    for pattern in patterns:
        expanded = pattern.replace("{target_root}", target_root)
        if fnmatch.fnmatch(normalized, expanded):
            return True
    return False


def structural_patterns(target_root: str, authoring: bool) -> tuple[str, ...]:
    base = (
        ".cursor/rules/*.mdc",
        ".cursor/commands/*.md",
        ".cursor/skills/*/SKILL.md",
        ".cursor/agents/*.md",
        ".cursor/hooks.json",
        ".cursor/hooks/*",
        ".cursor/memories/*.md",
        ".github/workflows/*.yaml",
        "scripts/hooks/*",
        "scripts/*.sh",
        ".sdlc/bin/**",
        ".sdlc/context/decisions/ADR-*.md",
        ".sdlc/INDEX.md",
        ".sdlc/sdlc.yaml",
        ".sdlc/templates/**",
        ".sdlc/workflows/*.yaml",
        ".sdlc/integrations/*/*.yaml",
        ".sdlc/doctor/*",
        ".sdlc/pipeline/**",
        ".sdlc/playbooks/**",
        ".sdlc/schemas/**",
        ".sdlc/gates/**",
        "examples/README.md",
        "README.md",
        f"{target_root}/package.json",
    )
    if authoring:
        return base + ("packages/**",)
    return base


def feature_patterns(target_root: str) -> tuple[str, ...]:
    return (
        f"{target_root}/src/**",
        f"{target_root}/e2e/**",
        f"{target_root}/CHANGELOG.md",
        f"{target_root}/astro.config.mjs",
        ".sdlc/specs/**",
        ".sdlc/handoffs/**",
        ".sdlc/evidence/**",
        ".sdlc/runs/**",
        ".sdlc/trace/**",
        ".cursor/memories/operational-context.md",
    )


def classify_path(path: str, target_root: str, authoring: bool) -> Classification:
    normalized = path.replace("\\", "/")
    for exc in PACKAGE_EXCLUDE_GLOBS:
        if fnmatch.fnmatch(normalized, exc):
            return "feature"

    if _matches_any(normalized, feature_patterns(target_root), target_root):
        return "feature"

    if normalized.endswith("package.json") and target_root in normalized:
        return "ambiguous"

    if _matches_any(normalized, structural_patterns(target_root, authoring), target_root):
        if normalized == ".cursor/memories/operational-context.md":
            return "feature"
        return "structural"

    if normalized.startswith(".sdlc/context/decisions/ADR-"):
        return "ambiguous"

    return "feature"


def classify_changes(paths: list[str]) -> tuple[list[str], list[str], list[str]]:
    target_root = workspace_target_rel()
    authoring = is_authoring_repo()
    structural: list[str] = []
    feature: list[str] = []
    ambiguous: list[str] = []
    for path in paths:
        kind = classify_path(path, target_root, authoring)
        if kind == "structural":
            structural.append(path)
        elif kind == "ambiguous":
            ambiguous.append(path)
        else:
            feature.append(path)
    return structural, feature, ambiguous


def next_sdlc_tag(current: str | None) -> str:
    authoring = is_authoring_repo()
    if authoring or (current and AUTHORING_TAG_RE.match(current)):
        if current and (match := AUTHORING_TAG_RE.match(current)):
            n = int(match.group(1)) + 1
        else:
            n = 1
        return f"v0.{n}.0-sdlc"

    slug = project_slug()
    if current and (match := CONSUMER_TAG_RE.match(current)):
        major, minor = int(match.group(2)), int(match.group(3))
        return f"{slug}-sdlc-v{major}.{minor + 1}.0"
    return f"{slug}-sdlc-v1.0.0"


def next_app_tag(current: str | None) -> str:
    slug = project_slug()
    app_re = re.compile(rf"^{re.escape(slug)}-app-v(\d+)\.(\d+)\.0$")
    if current and (match := app_re.match(current)):
        major, minor = int(match.group(1)), int(match.group(2))
        return f"{slug}-app-v{major}.{minor + 1}.0"
    return f"{slug}-app-v1.0.0"


def update_reset_sh_constants(sdlc_tag: str, app_tag: str | None = None) -> None:
    reset_path = REPO_ROOT / "scripts" / "reset.sh"
    if not reset_path.is_file():
        return
    content = reset_path.read_text(encoding="utf-8")
    content = re.sub(
        r'^APP_BASELINE_TAG=".*"$',
        f'APP_BASELINE_TAG="{app_tag or ""}"',
        content,
        flags=re.MULTILINE,
    )
    content = re.sub(
        r'^SDLC_BASELINE_TAG=".*"$',
        f'SDLC_BASELINE_TAG="{sdlc_tag}"',
        content,
        flags=re.MULTILINE,
    )
    reset_path.write_text(content, encoding="utf-8")


def app_tree_has_content() -> bool:
    target = workspace_target_rel()
    src = REPO_ROOT / target / "src" if target != "." else REPO_ROOT / "src"
    if not src.is_dir():
        return False
    return any(src.iterdir())


def cmd_init(args: argparse.Namespace) -> int:
    data = load_sdlc_yaml()
    baseline = load_baseline_block()
    existing = baseline.get("sdlc_baseline_tag")
    if isinstance(existing, str) and existing and tag_exists(existing):
        print(f"Baseline already initialized: {existing}")
        return 0

    tag = next_sdlc_tag(None)
    app_tag: str | None = None
    if app_tree_has_content():
        app_tag = next_app_tag(None)
        _run_git("tag", "-a", app_tag, "-m", f"App baseline init: {app_tag}")
        print(f"Created app tag: {app_tag}")

    _run_git("tag", "-a", tag, "-m", f"SDLC baseline init: {tag}")
    print(f"Created SDLC tag: {tag}")

    baseline["sdlc_baseline_tag"] = tag
    baseline["last_sdlc_baseline_date"] = date.today().isoformat()
    if app_tag:
        baseline["app_baseline_tag"] = app_tag
    changes = baseline.get("sdlc_baseline_changes")
    if not isinstance(changes, list):
        changes = []
    changes.append(args.reason or "post-init bootstrap")
    baseline["sdlc_baseline_changes"] = changes[-20:]
    data["baseline"] = baseline
    save_sdlc_yaml(data)
    app_val = baseline.get("app_baseline_tag")
    update_reset_sh_constants(tag, app_val if isinstance(app_val, str) else None)
    return 0


def cmd_advance(args: argparse.Namespace) -> int:
    baseline = load_baseline_block()
    current = baseline.get("sdlc_baseline_tag")
    if not isinstance(current, str) or not current:
        print("ERROR: sdlc_baseline_tag not set — run baseline init first.", file=sys.stderr)
        return 1
    if not tag_exists(current):
        print(f"ERROR: baseline tag missing in git: {current}", file=sys.stderr)
        return 1

    paths = git_changed_paths(current)
    structural, feature, ambiguous = classify_changes(paths)

    if ambiguous:
        print("AMBIGUOUS paths (excluded from auto-commit — classify manually):")
        for p in ambiguous:
            print(f"  ? {p}")

    if not structural:
        print("No structural changes since baseline — idempotent, no new tag.")
        return 0

    print("STRUCTURAL paths to commit:")
    for p in structural:
        print(f"  + {p}")
    if feature:
        print("FEATURE paths (excluded):")
        for p in feature[:20]:
            print(f"  - {p}")
        if len(feature) > 20:
            print(f"  ... and {len(feature) - 20} more")

    new_tag = next_sdlc_tag(current)
    reason = args.reason or f"advance SDLC baseline to {new_tag}"

    if args.dry_run:
        print(f"DRY RUN — would advance {current} → {new_tag}")
        return 0

    # Write tag metadata before commit so the tag marks a coherent baseline snapshot.
    data = load_sdlc_yaml()
    bl = load_baseline_block()
    bl["sdlc_baseline_tag"] = new_tag
    bl["last_sdlc_baseline_date"] = date.today().isoformat()
    changes = bl.get("sdlc_baseline_changes")
    if not isinstance(changes, list):
        changes = []
    changes.append(reason)
    bl["sdlc_baseline_changes"] = changes[-20:]
    data["baseline"] = bl
    save_sdlc_yaml(data)
    app_tag = bl.get("app_baseline_tag")
    update_reset_sh_constants(
        new_tag,
        app_tag if isinstance(app_tag, str) else None,
    )

    structural_set = set(structural)
    structural_set.update({".sdlc/sdlc.yaml", "scripts/reset.sh"})
    for path in sorted(structural_set):
        _run_git("add", "--", path, check=False)

    commit = _run_git(
        "commit",
        "-m",
        f"chore(sdlc): advance SDLC baseline to {new_tag}",
        "-m",
        reason,
        check=False,
    )
    if commit.returncode != 0 and "nothing to commit" not in (commit.stderr or commit.stdout):
        print(commit.stderr or commit.stdout, file=sys.stderr)
        return commit.returncode

    _run_git("tag", "-f", "-a", new_tag, "-m", reason)
    print(f"Created tag: {new_tag}")
    return 0


def cmd_verify(_args: argparse.Namespace) -> int:
    baseline = load_baseline_block()
    tag = baseline.get("sdlc_baseline_tag")
    if not isinstance(tag, str) or not tag:
        print("ERROR: sdlc_baseline_tag is not set", file=sys.stderr)
        return 1
    if not tag_exists(tag):
        print(f"ERROR: git tag not found: {tag}", file=sys.stderr)
        return 1
    print(f"OK: baseline tag {tag} → {_run_git('rev-parse', tag).stdout.strip()}")
    return 0


def cmd_status(_args: argparse.Namespace) -> int:
    baseline = load_baseline_block()
    for key in (
        "sdlc_package_version",
        "sdlc_baseline_tag",
        "app_baseline_tag",
        "last_sdlc_baseline_date",
    ):
        print(f"{key}: {baseline.get(key)!r}")
    tag = baseline.get("sdlc_baseline_tag")
    if isinstance(tag, str) and tag:
        print(f"sdlc_baseline_tag_exists: {tag_exists(tag)}")
    print(f"mode: {'authoring' if is_authoring_repo() else 'consumer'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SDLC baseline lifecycle (ADR-014)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="Create first downstream baseline tag")
    p_init.add_argument("--reason", default="post-init bootstrap")
    p_init.set_defaults(func=cmd_init)

    p_adv = sub.add_parser("advance", help="Commit structural changes and bump baseline tag")
    p_adv.add_argument("--reason", default="")
    p_adv.add_argument("--dry-run", action="store_true")
    p_adv.set_defaults(func=cmd_advance)

    p_verify = sub.add_parser("verify", help="Verify sdlc_baseline_tag exists in git")
    p_verify.set_defaults(func=cmd_verify)

    p_status = sub.add_parser("status", help="Print baseline block")
    p_status.set_defaults(func=cmd_status)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
