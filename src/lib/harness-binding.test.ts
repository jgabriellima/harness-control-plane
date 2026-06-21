import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveHarnessBinding } from './harness-binding.ts';
import { resolvePlatformAppRoot } from './repo-root.ts';

const SAMPLE_STAMP = `
apiVersion: proc.jambu/v1
kind: RuntimeBinding
active_pack:
  id: sdlc
  harness_dir: .sdlc/
  dsl_file: sdlc.yaml
  cli_prefix: sdlc
  command_namespace:
    lifecycle: "/sdlc:"
    capabilities: "/run:"
storage:
  root: .sdlc/
  resolved:
    workflow_runs: .sdlc/workflow-runs/
    trace: .sdlc/traces/
runtime:
  engine: cursor
  specialization_layer: .cursor/
`.trim();

describe('harness-binding runtime stamp', () => {
  let tempRoot = '';

  after(async () => {
    if (tempRoot) {
      await import('node:fs/promises').then(({ rm }) =>
        rm(tempRoot, { recursive: true, force: true }),
      );
    }
  });

  it('resolves paths from runtime-binding.yaml', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'binding-stamp-'));
    await mkdir(join(tempRoot, '.cursor'), { recursive: true });
    await mkdir(join(tempRoot, '.sdlc', 'bin'), { recursive: true });
    await writeFile(join(tempRoot, '.cursor', 'runtime-binding.yaml'), SAMPLE_STAMP, 'utf8');

    const binding = await resolveHarnessBinding({ workspaceRoot: tempRoot });
    assert.equal(binding.source, 'runtime-binding');
    assert.equal(binding.cliPrefix, 'sdlc');
    assert.ok(binding.runnerScript.endsWith('sdlc_workflow_run.py'));
    assert.ok(binding.dslPath.endsWith('.sdlc/sdlc.yaml'));
  });

  it('resolves paths when projectRoot is injected', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'binding-project-root-'));
    await mkdir(join(tempRoot, '.cursor'), { recursive: true });
    await mkdir(join(tempRoot, '.sdlc', 'bin'), { recursive: true });
    await writeFile(join(tempRoot, '.cursor', 'runtime-binding.yaml'), SAMPLE_STAMP, 'utf8');

    const binding = await resolveHarnessBinding({ projectRoot: tempRoot });
    assert.equal(binding.source, 'runtime-binding');
    assert.equal(binding.workspaceRoot, tempRoot);
    assert.equal(binding.harnessRoot, join(tempRoot, '.sdlc'));
  });

  it('fails fast when stamp is missing', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'binding-missing-'));
    await assert.rejects(
      () => resolveHarnessBinding({ workspaceRoot: tempRoot }),
      /missing \.cursor\/runtime-binding\.yaml/,
    );
  });

  it('resolves platform app stamp for dev dogfood', async () => {
    let platformRoot: string;
    try {
      platformRoot = resolvePlatformAppRoot();
    } catch {
      return;
    }
    if (!existsSync(join(platformRoot, '.cursor', 'runtime-binding.yaml'))) {
      return;
    }
    const binding = await resolveHarnessBinding({ workspaceRoot: platformRoot });
    assert.equal(binding.source, 'runtime-binding');
    assert.equal(binding.cliPrefix, 'business');
    assert.ok(binding.runnerScript.endsWith('business_workflow_run.py'));
    assert.ok(binding.dslPath.endsWith('business.yaml'));
  });
});
