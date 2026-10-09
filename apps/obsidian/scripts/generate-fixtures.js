// Writes fixtures/*.json: the merge_variables each screen pushes for the demo
// vault at DEMO_NOW, plus edge cases built in memory. Run after changing a
// collector or the demo vault: pnpm --filter @trmnl/obsidian fixtures
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { demoFixtures } from './fixtures.js';

const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(join(root, 'fixtures'), { recursive: true });
for (const [name, payload] of Object.entries(await demoFixtures())) {
  await writeFile(join(root, 'fixtures', `${name}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`fixtures/${name}.json  ${Buffer.byteLength(JSON.stringify({ merge_variables: payload }))} bytes`);
}
