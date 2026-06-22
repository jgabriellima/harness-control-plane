# `.sdlc/templates/harness/` — legacy npm sync mirror (ADR-030, ADR-031)

**Canonical kernel source:** [`jambu/harness`](https://github.com/jambuai/harness) — npm package `@jambu/harness`.

This directory is a transitional mirror retained for SDLC product templates. Kernel templates now live in `harness/packages/harness/templates/`. Do not treat this tree as authoritative kernel source.

| File | Role |
|---|---|
| [`harness.yaml`](harness.yaml) | Legacy sync mirror — edit in `jambu/harness` |
| [`kernel-bin.manifest.yaml`](kernel-bin.manifest.yaml) | Legacy sync mirror — edit in `jambu/harness/.harness/bin/` |
| [`workflows/harness-bootstrap-flow.yaml`](workflows/harness-bootstrap-flow.yaml) | Legacy sync mirror |
| [`hooks.manifest.yaml`](hooks.manifest.yaml) | MS-6 hook manifest — `harness bind` projects to `.cursor/hooks.json` (ADR-032) |

Cross-reference: [ADR-033](../../context/decisions/ADR-033-repository-topology-harness-as-paradigm-owner.md) · [`packages/ai-native-sdlc/package.json`](../../../packages/ai-native-sdlc/package.json) (`@jambu/harness` dependency)
