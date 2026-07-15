import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const { jambuOpenUILibrary, jambuOpenUIPromptOptions } = await import('../src/openui/library.tsx');
const prompt = jambuOpenUILibrary.prompt(jambuOpenUIPromptOptions);
const outPath = join(root, '../src/openui/system-prompt.generated.ts');
writeFileSync(outPath, `export const JAMBU_OPENUI_SYSTEM_PROMPT = ${JSON.stringify(prompt)} as const;\n`);
console.log(`[openui:generate-prompt] wrote ${prompt.length} chars to ${outPath}`);
