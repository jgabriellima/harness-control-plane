import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2];
const base = process.argv[3] ?? 'http://127.0.0.1:4323';

const routes = [
  ['harness-home', '/'],
  ['home', '/design/projects'],
  ['conversations', '/design/conversations'],
  ['conversation-chat', '/design/conversation/new'],
  ['library', '/design/library'],
  ['executions', '/design/executions'],
  ['scheduled', '/design/scheduled'],
  ['automations', '/design/automations'],
  ['plugins', '/design/plugins'],
  ['design-systems', '/design/design-systems'],
  ['integrations', '/design/integrations'],
  ['studio-orch', '/design/projects/4050fda3-ec70-48e9-a780-2e8aba58936d'],
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

for (const [name, route] of routes) {
  const url = `${base}${route}`;
  console.log(`capture ${name} -> ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

await browser.close();
console.log('done');
