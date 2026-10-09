// Git does not keep file times, so a fresh checkout makes every demo note look
// brand new. This sets each note's modified time to the one the fixtures use,
// so the resurface screen sees old notes as old: pnpm --filter @trmnl/obsidian demo:age
import { utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { demoTimes } from './demo.js';
import { demoVaultPath } from './fixtures.js';

for (const [path, { mtime }] of Object.entries(demoTimes)) {
  await utimes(join(demoVaultPath, path), new Date(mtime), new Date(mtime));
}
console.log(`Set modified times on ${Object.keys(demoTimes).length} demo notes.`);
