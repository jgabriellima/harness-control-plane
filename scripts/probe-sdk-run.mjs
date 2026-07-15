import { Agent } from '@cursor/sdk';

const apiKey = process.env.CURSOR_API_KEY;
if (!apiKey) {
  console.error('CURSOR_API_KEY required');
  process.exit(1);
}

async function test(cwd, label, extra = {}) {
  try {
    const agent = await Agent.create({
      apiKey,
      model: { id: process.env.CURSOR_RUNTIME_MODEL?.trim() || 'composer-2.5' },
      local: { cwd, settingSources: [], ...extra },
    });
    const run = await agent.send('Reply with exactly: OK');
    const types = [];
    let assistantText = '';
    for await (const m of run.stream()) {
      if (m.type === 'assistant') {
        types.push('assistant');
        assistantText += m.message?.content?.[0]?.text ?? '';
      } else if (m.type === 'status') {
        types.push(`status:${m.status}`);
      } else {
        types.push(m.type);
      }
    }
    console.log(JSON.stringify({ label, cwd, status: run.status, result: run.result, types, assistantText }));
    await agent[Symbol.asyncDispose]();
  } catch (e) {
    console.log(JSON.stringify({ label, cwd, error: e instanceof Error ? e.message : String(e) }));
  }
}

await test(
  '/Users/joaogabriellima/Documents/Work/jambu/business-workflow/workspaces/default',
  'workspace-default-empty-settings',
);
await test(
  '/Users/joaogabriellima/Documents/Work/jambu/business-workflow/workspaces/default',
  'workspace-default-project-settings',
  { settingSources: ['project'] },
);
await test('/Users/joaogabriellima/Documents/Work/jambu/business-workflow/app', 'app-root');
