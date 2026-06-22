"""
HTML and Canvas artifact generators for /sdlc:token-health.
Encodes load-context taxonomy and print CSS invariants from rev3 audit.
"""
from __future__ import annotations

import html
import os
from datetime import datetime
from typing import Any

SESSION_HOOK = {
    "event": "sessionStart",
    "command": ".cursor/hooks/session-start.sh",
    "config": ".cursor/hooks.json",
}

# Chrome omits sections with page-break-inside:avoid when block exceeds one page.
PRINT_CSS = """\
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --black: #0f0f0f; --gray-2: #333; --gray-3: #555; --gray-4: #888;
      --gray-6: #e4e4e4; --gray-7: #f4f4f4; --border: #d0d0d0;
      --warn-bg: #fffbf0; --warn-bd: #d4a820; --info-bg: #f0f4ff; --info-bd: #4a6cf7;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      --mono: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
    }
    html { font-size: 11pt; }
    body { font-family: var(--font); color: var(--black); background: white; line-height: 1.55; }
    @page { size: A4; margin: 14mm 12mm; }
    .page-wrap { max-width: 186mm; margin: 0 auto; padding: 10mm 0 8mm; }
    h1 { font-size: 22pt; font-weight: 700; line-height: 1.2; margin-bottom: 6pt; }
    h2 { font-size: 15pt; font-weight: 700; margin-bottom: 6pt; line-height: 1.25; }
    p { font-size: 11pt; color: var(--gray-2); }
    .lead { font-size: 11pt; color: var(--gray-2); line-height: 1.6; }
    .muted { color: var(--gray-4); font-size: 10pt; line-height: 1.5; }
    .mono { font-family: var(--mono); font-size: 9.5pt; }
    .section { margin-bottom: 20pt; }
    .wrap { display: flex; flex-wrap: wrap; gap: 6pt; align-items: center; }
    .spacer { height: 10pt; }
    hr.divider { border: none; border-top: 1px solid var(--border); margin: 16pt 0; }
    .pill { display: inline-block; font-size: 9pt; font-weight: 500; padding: 2pt 7pt;
      border-radius: 20pt; border: 1px solid var(--border); background: var(--gray-7); }
    .pill-danger { background: #fff0f0; border-color: #d45050; color: #7a1010; }
    .pill-info { background: var(--info-bg); border-color: var(--info-bd); color: #1a3ab0; }
    .stats-row { display: flex; gap: 12pt; justify-content: space-around; flex-wrap: wrap; }
    .stat { text-align: center; min-width: 80pt; }
    .stat-value { font-size: 22pt; font-weight: 700; line-height: 1; }
    .stat-label { font-size: 9.5pt; color: var(--gray-4); margin-top: 3pt; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5pt; line-height: 1.45; table-layout: fixed; }
    table code.mono { word-break: break-all; }
    thead th { text-align: left; font-weight: 600; font-size: 10pt; color: var(--gray-3);
      border-bottom: 1px solid var(--border); padding: 6pt 10pt; background: var(--gray-7); }
    tbody td { padding: 6pt 10pt; border-bottom: 1px solid var(--gray-6); vertical-align: top; color: var(--gray-2); }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr.warn td { background: #fffcf0; }
    tbody tr.danger td { background: #fff5f5; }
    .callout { border-left: 3pt solid var(--warn-bd); background: var(--warn-bg);
      padding: 10pt 12pt; border-radius: 0 4pt 4pt 0; }
    .callout-info { border-left-color: var(--info-bd); background: var(--info-bg); }
    .callout-title { font-weight: 600; font-size: 11pt; margin-bottom: 4pt; }
    .callout p { font-size: 10.5pt; line-height: 1.55; }
    .step-row { display: flex; gap: 10pt; margin-bottom: 8pt; }
    .step-num { width: 22pt; height: 22pt; border-radius: 50%; background: var(--black); color: white;
      font-size: 10pt; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .step-body .step-handler { font-size: 10.5pt; font-weight: 600; }
    .step-body .step-desc { font-size: 10pt; color: var(--gray-3); margin-top: 3pt; line-height: 1.45; }
    .bar-row { margin-bottom: 6pt; }
    .bar-label { display: flex; justify-content: space-between; font-size: 9.5pt; color: var(--gray-3); margin-bottom: 2pt; }
    .bar-track { height: 8pt; background: var(--gray-7); border-radius: 2pt; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--black); border-radius: 2pt; }
    .doc-meta { font-size: 10pt; color: var(--gray-4); margin-top: 5pt; }
    .avoid-break-small { break-inside: avoid; page-break-inside: avoid; }
    @media print {
      html, body { height: auto !important; overflow: visible !important; background: white !important; }
      .page-wrap { max-width: none; width: 100%; padding: 0; margin: 0;
        overflow: visible !important; height: auto !important; box-shadow: none !important; }
      .section { display: block !important; visibility: visible !important; overflow: visible !important;
        break-inside: auto; page-break-inside: auto; }
      table { break-inside: auto; page-break-inside: auto; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      .callout, .bar-fill, .pill, tbody tr.warn td, tbody tr.danger td {
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .bar-fill { background: var(--black) !important; min-width: 2pt; }
    }
    @media screen {
      body { background: #f0f0f0; }
      .page-wrap { background: white; padding: 14mm 16mm; margin: 20px auto; max-width: 210mm;
        box-shadow: 0 1px 6px rgba(0,0,0,0.12); }
    }
"""


def _esc(text: str) -> str:
    return html.escape(str(text), quote=True)


def _fmt_k(n: int) -> str:
    if n >= 1000:
        return f"{n / 1000:.1f}K"
    return str(n)


def _verdict(entries: list[dict], duplications: list[dict]) -> str:
    red = sum(1 for e in entries if e.get("risk_tier") == "RED")
    orange = sum(1 for e in entries if e.get("risk_tier") == "ORANGE")
    high_dup = sum(1 for d in duplications if d["severity"] == "HIGH")
    if red > 0 or high_dup > 0:
        return "CRITICAL"
    if orange > 0:
        return "DEGRADED"
    return "HEALTHY"


def build_audit_bundle(
    entries: list[dict],
    stats: dict,
    duplications: list[dict],
    tokenizer_label: str,
    root: str,
) -> dict[str, Any]:
    instruction = [e for e in entries if e["load_context"] != "runtime_executed"]
    rules_tokens = sum(e["token_count"] for e in entries if e["scope"] == ".cursor/rules")
    memories_tokens = sum(e["token_count"] for e in entries if e["scope"] == ".cursor/memories")
    always_raw = rules_tokens + memories_tokens

    by_scope: dict[str, dict[str, int]] = {}
    for e in instruction:
        scope = e["scope"]
        if scope not in by_scope:
            by_scope[scope] = {"files": 0, "tokens": 0}
        by_scope[scope]["files"] += 1
        by_scope[scope]["tokens"] += e["token_count"]

    scope_rows = sorted(
        [{"scope": s, **v} for s, v in by_scope.items()],
        key=lambda x: -x["tokens"],
    )

    flagged = sorted(
        [e for e in entries if e.get("risk_tier") in ("RED", "ORANGE")],
        key=lambda x: -x["token_count"],
    )

    top_files = sorted(instruction, key=lambda x: -x["token_count"])[:10]

    dup_top = duplications[:6]

    red_n = sum(1 for e in entries if e.get("risk_tier") == "RED")
    orange_n = sum(1 for e in entries if e.get("risk_tier") == "ORANGE")
    thin_n = sum(1 for e in entries if e.get("risk_tier") == "THIN")
    runtime_n = sum(1 for e in entries if e.get("risk_tier") == "N/A")

    mean, stdev = stats["mean"], stats["stdev"]
    red_threshold = int(mean + 1.5 * stdev) if stdev > 0 else int(mean)

    commands_pct = 0
    total_inst = stats["total_corpus"]
    for row in scope_rows:
        if row["scope"] == ".cursor/commands" and total_inst > 0:
            commands_pct = round(100 * row["tokens"] / total_inst)

    date_str = datetime.now().strftime("%Y-%m-%d")

    return {
        "date": date_str,
        "tokenizer": tokenizer_label,
        "verdict": _verdict(entries, duplications),
        "files": stats["file_count"],
        "instruction_tokens": stats["total_corpus"],
        "always_injected_raw": always_raw,
        "rules_tokens": rules_tokens,
        "memories_tokens": memories_tokens,
        "runtime_only_files": runtime_n,
        "mean": int(mean),
        "stdev": int(stdev),
        "p50": stats["p50"],
        "p90": stats["p90"],
        "p95": stats["p95"],
        "red": red_n,
        "orange": orange_n,
        "thin": thin_n,
        "red_threshold": red_threshold,
        "commands_pct": commands_pct,
        "scope_rows": scope_rows,
        "flagged": flagged,
        "top_files": top_files,
        "duplications": dup_top,
        "session_hook": SESSION_HOOK,
        "root": root,
    }


def render_html(bundle: dict[str, Any]) -> str:
    b = bundle
    rules_pct = round(100 * b["rules_tokens"] / b["always_injected_raw"]) if b["always_injected_raw"] else 0
    mem_pct = 100 - rules_pct

    pill_class = "pill-danger" if b["verdict"] == "CRITICAL" else "pill-info"

    scope_trs = []
    for row in b["scope_rows"]:
        cls = "warn" if row["scope"] == ".cursor/commands" else ""
        scope_trs.append(
            f'        <tr class="{cls}"><td><code class="mono">{_esc(row["scope"])}</code></td>'
            f"<td>{row['files']}</td><td>{row['tokens']:,}</td></tr>"
        )

    risk_trs = []
    for e in b["flagged"]:
        cls = "danger" if e["risk_tier"] == "RED" else "warn"
        rel = os.path.relpath(e["path"], b["root"])
        dup = len(e.get("duplication_signals", []))
        risk_trs.append(
            f'        <tr class="{cls}"><td>{_esc(e["risk_tier"])}</td>'
            f'<td><code class="mono">{_esc(rel)}</code></td><td>{e["token_count"]:,}</td>'
            f'<td>{e["z_score"]:+.2f}</td><td>{_esc(e["load_context"])}</td>'
            f"<td>{dup if dup else '—'}</td></tr>"
        )

    dup_trs = "".join(
        f"        <tr><td>{_esc(d['phrase'])}</td><td>{d['occurrences']}</td>"
        f"<td>{_esc(d['severity'])}</td></tr>\n"
        for d in b["duplications"]
    )

    hook = b["session_hook"]
    note = (
        f"Additional context is loaded via <code class=\"mono\">{_esc(hook['command'])}</code>, "
        f"invoked by the <code class=\"mono\">{_esc(hook['event'])}</code> hook in "
        f"<code class=\"mono\">{_esc(hook['config'])}</code> — handoff, SDLC status, and memory excerpts "
        f"as <code class=\"mono\">additional_context</code> JSON (size varies per session). "
        f"Scripts such as <code class=\"mono\">hook_handler.py</code> are executed only; their source is not injected."
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SDLC Token Health — {_esc(b['date'])}</title>
  <style>
{PRINT_CSS}
  </style>
</head>
<body>
<div class="page-wrap">

  <section class="section">
    <div class="wrap avoid-break-small">
      <h1>SDLC Token Health</h1>
      <span class="pill {pill_class}">{_esc(b['verdict'])}</span>
      <span class="pill pill-info">generated</span>
    </div>
    <p class="doc-meta">{_esc(b['date'])} · <code class="mono">{_esc(b['tokenizer'])}</code> · <code class="mono">/sdlc:token-health --html</code></p>
    <p class="lead">Instruction corpus audit. Session LLM context = always_injected rules + memories ({b['always_injected_raw']:,} tokens) plus variable output from the sessionStart hook.</p>
  </section>

  <section class="section">
    <div class="stats-row avoid-break-small">
      <div class="stat"><div class="stat-value">{b['files']}</div><div class="stat-label">Files scanned</div></div>
      <div class="stat"><div class="stat-value">{_fmt_k(b['instruction_tokens'])}</div><div class="stat-label">Instruction corpus</div></div>
      <div class="stat"><div class="stat-value">{b['always_injected_raw']:,}</div><div class="stat-label">Always-injected (raw)</div></div>
      <div class="stat"><div class="stat-value">{b['red']}R / {b['orange']}O</div><div class="stat-label">RED / ORANGE</div></div>
    </div>
  </section>

  <section class="section">
    <div class="callout callout-info">
      <div class="callout-title">Load context taxonomy</div>
      <p><strong>always_injected</strong> — <code class="mono">.cursor/rules/*.mdc</code> + <code class="mono">.cursor/memories/*.md</code> loaded every session.</p>
      <p style="margin-top:6pt;"><strong>Total:</strong> {b['always_injected_raw']:,} tokens (rules {b['rules_tokens']:,} + memories {b['memories_tokens']:,})</p>
      <p class="muted" style="margin-top:8pt;"><strong>Note:</strong> {note}</p>
    </div>
  </section>

  <hr class="divider">

  <section class="section">
    <h2>Always-injected breakdown</h2>
    <div class="bar-row">
      <div class="bar-label"><span>rules ({b['rules_tokens']:,})</span><span>{rules_pct}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:{rules_pct}%"></div></div>
    </div>
    <div class="bar-row">
      <div class="bar-label"><span>memories ({b['memories_tokens']:,})</span><span>{mem_pct}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:{mem_pct}%"></div></div>
    </div>
  </section>

  <section class="section">
    <h2>Tokens by scope (instruction corpus)</h2>
    <p class="muted">mean {b['mean']:,} · stdev {b['stdev']:,} · p95 {b['p95']:,} · commands = {b['commands_pct']}%</p>
    <div class="spacer"></div>
    <table>
      <thead><tr><th>Scope</th><th>Files</th><th>Tokens</th></tr></thead>
      <tbody>
{chr(10).join(scope_trs)}
      </tbody>
    </table>
  </section>

  <section class="section">
    <h2>Risk register</h2>
    <p class="muted">RED: tokens &gt; mean + 1.5σ (~{b['red_threshold']:,}). Hook subprocess sources excluded from risk tiers.</p>
    <div class="spacer"></div>
    <table>
      <thead><tr><th>Tier</th><th>Path</th><th>Tokens</th><th>z</th><th>Load</th><th>Dup</th></tr></thead>
      <tbody>
{chr(10).join(risk_trs)}
      </tbody>
    </table>
  </section>

  <section class="section">
    <h2>Cross-file duplication (top phrases)</h2>
    <table>
      <thead><tr><th>Phrase</th><th>Files</th><th>Severity</th></tr></thead>
      <tbody>
{dup_trs}
      </tbody>
    </table>
  </section>

  <hr class="divider">

  <section class="section">
    <h2>Remediation priority</h2>
    <div class="step-row avoid-break-small">
      <div class="step-num">1</div>
      <div class="step-body">
        <div class="step-handler"><code class="mono">sdlc-token-health.md</code></div>
        <div class="step-desc">Split reference vs execution protocol; compress meta-file if still RED after audit.</div>
      </div>
    </div>
    <div class="step-row avoid-break-small">
      <div class="step-num">2</div>
      <div class="step-body">
        <div class="step-handler"><code class="mono">sdlc-doctor.md</code>, <code class="mono">sdlc-implement.md</code></div>
        <div class="step-desc">Bracket-compress; cross-ref <code class="mono">architecture.mdc</code> and <code class="mono">output-standards.mdc</code>.</div>
      </div>
    </div>
    <div class="step-row avoid-break-small">
      <div class="step-num">3</div>
      <div class="step-body">
        <div class="step-handler"><code class="mono">session-start.sh</code> output</div>
        <div class="step-desc">Audit and cap <code class="mono">additional_context</code> from sessionStart hook — not script source bytes.</div>
      </div>
    </div>
    <p class="muted" style="margin-top:10pt;">Auto-fix: <code class="mono">python3 .sdlc/bin/sdlc_token_health.py --fix</code></p>
  </section>

  <hr class="divider">
  <p class="muted" style="text-align:center;">
    AI-Native SDLC · Token Health Report · {_esc(b['date'])} · generated by sdlc_token_health.py
  </p>

</div>
</body>
</html>
"""


def json_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def render_canvas(bundle: dict[str, Any]) -> str:
    b = bundle
    hook = b["session_hook"]

    scope_lines = []
    for row in b["scope_rows"]:
        short = row["scope"].replace(".cursor/", "").replace(".sdlc/", "sdlc/")
        scope_lines.append(
            f'  {{ scope: "{short}", files: {row["files"]}, tokens: {row["tokens"]} }},'
        )

    flagged_lines = []
    for e in b["flagged"]:
        rel = os.path.relpath(e["path"], b["root"]).replace("\\", "/")
        flagged_lines.append(
            f"""  {{
    path: "{json_escape(rel)}",
    tokens: {e['token_count']},
    z: "{e['z_score']:+.2f}",
    tier: "{e['risk_tier']}" as const,
    load: "{json_escape(e['load_context'])}",
    dupCount: {len(e.get('duplication_signals', []))},
  }},"""
        )

    top_lines = []
    for e in b["top_files"]:
        rel = os.path.relpath(e["path"], b["root"]).replace("\\", "/")
        tier = e.get("risk_tier", "OK")
        if tier in ("N/A", "GREEN"):
            tier = "OK"
        top_lines.append(
            f'  {{ path: "{json_escape(rel)}", tokens: {e["token_count"]}, tier: "{tier}" }},'
        )

    dup_lines = []
    for d in b["duplications"]:
        dup_lines.append(
            f'  {{ phrase: "{json_escape(d["phrase"])}", occurrences: {d["occurrences"]}, severity: "{d["severity"]}" }},'
        )

    verdict_const = b["verdict"]
    if verdict_const not in ("CRITICAL", "DEGRADED", "HEALTHY"):
        verdict_const = "HEALTHY"

    data_block = f'''import {{
  BarChart,
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  UsageBar,
  useHostTheme,
}} from "cursor/canvas";

// Generated by .sdlc/bin/sdlc_token_health.py --canvas on {b["date"]}

const REPORT = {{
  date: "{b["date"]}",
  tokenizer: "{json_escape(b["tokenizer"])}",
  files: {b["files"]},
  instructionTokens: {b["instruction_tokens"]},
  alwaysInjectedRaw: {b["always_injected_raw"]},
  runtimeOnlyFiles: {b["runtime_only_files"]},
  mean: {b["mean"]},
  stdev: {b["stdev"]},
  p50: {b["p50"]},
  p90: {b["p90"]},
  p95: {b["p95"]},
  verdict: "{verdict_const}" as const,
  red: {b["red"]},
  orange: {b["orange"]},
  thin: {b["thin"]},
}};

const SCOPE_BREAKDOWN = [
{chr(10).join(scope_lines)}
];

const ALWAYS_INJECTED_RAW = [
  {{ id: "rules (.cursor/rules/*.mdc)", tokens: {b["rules_tokens"]} }},
  {{ id: "memories (.cursor/memories/*.md)", tokens: {b["memories_tokens"]} }},
];

const SESSION_CONTEXT_HOOK = {{
  event: "{json_escape(hook["event"])}",
  command: "{json_escape(hook["command"])}",
  config: "{json_escape(hook["config"])}",
}};

const FLAGGED = [
{chr(10).join(flagged_lines)}
];

const TOP_FILES = [
{chr(10).join(top_lines)}
];

const DUPLICATION = [
{chr(10).join(dup_lines)}
];

const BAR_SEGMENTS = [
  {{ id: "rules", value: {b["rules_tokens"]}, color: "blue" as const }},
  {{ id: "memories", value: {b["memories_tokens"]}, color: "green" as const }},
];
'''

    component_block = r'''
export default function SDLCTokenHealth() {
  const scopeCategories = SCOPE_BREAKDOWN.map((s) => s.scope);
  const scopeValues = SCOPE_BREAKDOWN.map((s) => s.tokens);
  const topCategories = TOP_FILES.map((f) => f.path.split("/").pop() ?? f.path);
  const topValues = TOP_FILES.map((f) => f.tokens);
  const pillTone =
    REPORT.verdict === "CRITICAL" ? "danger" : REPORT.verdict === "DEGRADED" ? "warning" : "success";

  return (
    <Stack gap={28} style={{ padding: "28px 32px", maxWidth: 1060 }}>
      <Stack gap={6}>
        <Row gap={10} style={{ alignItems: "center", flexWrap: "wrap" }}>
          <H1>SDLC Token Health</H1>
          <Pill label={REPORT.verdict} tone={pillTone} />
          <Pill label="generated" tone="neutral" size="small" />
        </Row>
        <Text tone="secondary">
          Instruction corpus audit — {REPORT.date}. Tokenizer: {REPORT.tokenizer}.
        </Text>
      </Stack>

      <Grid columns={4} gap={14}>
        <Stat value={String(REPORT.files)} label="Files scanned" />
        <Stat value={`${(REPORT.instructionTokens / 1000).toFixed(1)}K`} label="Instruction corpus" />
        <Stat value={REPORT.alwaysInjectedRaw.toLocaleString()} label="Always-injected (raw)" tone="warning" />
        <Stat value={`${REPORT.red}R / ${REPORT.orange}O`} label="RED / ORANGE" tone="danger" />
      </Grid>

      <Callout tone="info" title="Load context taxonomy">
        <Stack gap={8}>
          <Text size="small">
            <Text size="small" weight="medium" style={{ display: "inline" }}>always_injected</Text>
            {" "}— .cursor/rules/*.mdc + .cursor/memories/*.md every session.
          </Text>
          <Text size="small" weight="medium">
            Total: {REPORT.alwaysInjectedRaw.toLocaleString()} tokens
          </Text>
          <Text size="small" tone="secondary">
            Note: additional context via {SESSION_CONTEXT_HOOK.command} ({SESSION_CONTEXT_HOOK.event} in{" "}
            {SESSION_CONTEXT_HOOK.config}). hook_handler.py executes only — not injected.
          </Text>
        </Stack>
      </Callout>

      <Divider />

      <Stack gap={10}>
        <H2>Always-injected breakdown</H2>
        <UsageBar
          total={REPORT.alwaysInjectedRaw}
          topLeftLabel="rules + memories"
          topRightLabel={`${REPORT.alwaysInjectedRaw.toLocaleString()} tokens`}
          segments={BAR_SEGMENTS}
        />
      </Stack>

      <Grid columns={2} gap={20}>
        <Stack gap={8}>
          <H3>Tokens by scope</H3>
          <BarChart
            categories={scopeCategories}
            series={[{ name: "tokens", data: scopeValues }]}
            horizontal
            height={220}
            valueSuffix=" tok"
          />
        </Stack>
        <Stack gap={8}>
          <H3>Top files by tokens</H3>
          <BarChart
            categories={topCategories}
            series={[{ name: "tokens", data: topValues, tone: "danger" }]}
            horizontal
            height={220}
            valueSuffix=" tok"
          />
        </Stack>
      </Grid>

      <Divider />

      <H2>Risk register</H2>
      <Table
        headers={["Tier", "Path", "Tokens", "z", "Load", "Dup"]}
        rows={FLAGGED.map((f) => [
          f.tier,
          f.path,
          String(f.tokens),
          f.z,
          f.load,
          f.dupCount > 0 ? String(f.dupCount) : "—",
        ])}
        rowTone={FLAGGED.map((f) => (f.tier === "RED" ? "warning" : undefined))}
      />

      <H3>Cross-file duplication</H3>
      <Table
        headers={["Phrase", "Files", "Severity"]}
        rows={DUPLICATION.map((d) => [d.phrase, String(d.occurrences), d.severity])}
      />
    </Stack>
  );
}
'''
    return data_block + component_block


def default_canvas_path() -> str:
    home = os.path.expanduser("~")
    return os.path.join(
        home,
        ".cursor",
        "projects",
        "home-administrator-workspaces-jambu-ai-blog",
        "canvases",
        "sdlc-token-health.canvas.tsx",
    )


def write_artifacts(
    bundle: dict[str, Any],
    *,
    html_path: str | None,
    canvas_path: str | None,
) -> list[str]:
    written: list[str] = []
    if html_path:
        os.makedirs(os.path.dirname(html_path) or ".", exist_ok=True)
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(render_html(bundle))
        written.append(html_path)
    if canvas_path:
        os.makedirs(os.path.dirname(canvas_path) or ".", exist_ok=True)
        with open(canvas_path, "w", encoding="utf-8") as f:
            f.write(render_canvas(bundle))
        written.append(canvas_path)
    return written
