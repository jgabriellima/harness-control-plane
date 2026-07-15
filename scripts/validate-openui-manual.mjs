#!/usr/bin/env node
/**
 * Manual validation: /openui dispatch → hub SSE assistant parts (UI path).
 * Usage: node scripts/validate-openui-manual.mjs [--base http://127.0.0.1:4321]
 */
import { setTimeout as sleep } from 'node:timers/promises';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:4321';

const prompt =
  'Show 2 workspace metrics (Active runs, Failed checks), a bar chart titled Runs by day with labels Mon Tue Wed and values 4 6 3, and a ranked list of the top 3 busiest operations. Use only plausible placeholder values if you lack live data.';

async function dispatchChat() {
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: 'default',
      message: prompt,
      metadata: {},
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`chat dispatch failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function parseSseChunk(buffer) {
  const events = [];
  const blocks = buffer.split('\n\n');
  for (const block of blocks) {
    const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine.slice(6)));
    } catch {
      // ignore partial json
    }
  }
  return events;
}

async function collectHubRunEvents(getRunId, timeoutMs = 180_000) {
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;

  const response = await fetch(`${base}/api/runtime/hub/events`, { signal: controller.signal });
  if (!response.ok || !response.body) {
    throw new Error(`hub stream failed ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const assistantEvents = [];
  let sawParts = false;
  let sawOpenUISource = false;
  let sawRunComplete = false;

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = parseSseChunk(buffer);
    const runId = getRunId();
    for (const event of events) {
      if (!runId || event.run_id !== runId) {
        continue;
      }
      if (event.type === 'assistant') {
        assistantEvents.push(event);
        if (Array.isArray(event.payload?.parts) && event.payload.parts.length > 0) {
          sawParts = true;
        }
        if (typeof event.payload?.openui_source === 'string' && event.payload.openui_source.length > 0) {
          sawOpenUISource = true;
        }
      }
      if (event.type === 'run_complete' || event.type === 'error') {
        sawRunComplete = true;
        controller.abort();
        break;
      }
    }
    if (sawRunComplete) break;
  }

  try {
    controller.abort();
  } catch {
    // no-op
  }

  return { assistantEvents, sawParts, sawOpenUISource, sawRunComplete };
}

async function main() {
  console.log(`[validate-openui] base=${base}`);
  const health = await fetch(`${base}/api/runtime/dispatch-health`);
  console.log(`[validate-openui] dispatch-health=${health.status}`);

  let runId = null;
  const hubCollector = collectHubRunEvents(() => runId);
  await sleep(300);

  const dispatch = await dispatchChat();
  runId = dispatch.run_id;
  console.log(`[validate-openui] run_id=${runId} agent_id=${dispatch.agent_id}`);

  const stream = await hubCollector;
  console.log(`[validate-openui] assistant_events=${stream.assistantEvents.length}`);
  console.log(`[validate-openui] saw_parts=${stream.sawParts}`);
  console.log(`[validate-openui] saw_openui_source=${stream.sawOpenUISource}`);
  console.log(`[validate-openui] saw_run_complete=${stream.sawRunComplete}`);

  const lastAssistant = stream.assistantEvents.at(-1);
  if (lastAssistant?.payload?.parts) {
    console.log('[validate-openui] final_parts:', JSON.stringify(lastAssistant.payload.parts, null, 2));
  }

  const pass = stream.sawParts && stream.sawOpenUISource && stream.sawRunComplete;
  if (!pass) {
    console.error('[validate-openui] FAIL — OpenUI wire path did not produce typed parts');
    process.exit(1);
  }

  console.log('[validate-openui] PASS — SSE adapter emitted OpenUI parts');
}

main().catch((error) => {
  console.error('[validate-openui] ERROR', error);
  process.exit(1);
});
