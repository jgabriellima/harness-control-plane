#!/usr/bin/env python3
"""Preflight subprocess for goal-flow — exits 0 when doctor + CI alignment pass."""
from __future__ import annotations

import sys

from _sdlc_paths import BIN_DIR, REPO_ROOT

sys.path.insert(0, str(BIN_DIR))

from sdlc_ref_resolver import RunContext  # noqa: E402
from sdlc_workflow_gate import check_ci_target_aligned, check_doctor_pass  # noqa: E402


def main() -> int:
    run_id = "preflight"
    if "--run-id" in sys.argv:
        idx = sys.argv.index("--run-id")
        if idx + 1 < len(sys.argv):
            run_id = sys.argv[idx + 1]

    ctx = RunContext(
        run_id=run_id,
        intent="preflight",
        manifest={},
        node_id="preflight",
        execution_mode="agent",
        output_dir=None,
    )

    for check in (check_doctor_pass, check_ci_target_aligned):
        result = check(ctx)
        print(result.message)
        if not result.passed:
            print(f"PREFLIGHT FAIL: {result.gate_id} — {result.message}", file=sys.stderr)
            return 1

    print("PREFLIGHT PASS: doctor-pass + ci-target-aligned")
    return 0


if __name__ == "__main__":
    sys.exit(main())
