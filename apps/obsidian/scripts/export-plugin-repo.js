// Writes dist/obsidian-plugin-repo: the standalone repository Obsidian's
// plugin directory reads (manifest.json, README.md and LICENSE at the root,
// plus the source and a self-contained build). This monorepo stays the source
// of truth; the export is pushed to github.com/barrymichaeldoyle/obsidian-trmnl-screens.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist/obsidian-plugin-repo');
const manifest = JSON.parse(await readFile(join(root, 'obsidian-plugin/manifest.json'), 'utf8'));
const { devDependencies } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

// Replace everything but the repository's own .git and installed packages,
// so the export can be committed and pushed from where it lands.
await mkdir(out, { recursive: true });
for (const name of await readdir(out)) if (!['.git', 'node_modules'].includes(name)) await rm(join(out, name), { recursive: true, force: true });
await mkdir(join(out, 'docs'), { recursive: true });
await cp(join(root, 'obsidian-plugin/src'), join(out, 'src'), { recursive: true });
for (const name of ['manifest.json', 'versions.json', 'README.md', 'LICENSE']) await cp(join(root, 'obsidian-plugin', name), join(out, name));
for (const name of ['daily-tasks', 'due-tasks', 'writing-stats', 'pinned-note', 'resurface']) await cp(join(root, `docs/screenshots/${name}.png`), join(out, `docs/${name}.png`));

await writeFile(join(out, 'package.json'), `${JSON.stringify({
  name: manifest.id, version: manifest.version, private: true, type: 'module', description: manifest.description, license: 'MIT',
  scripts: { build: 'node esbuild.config.mjs', dev: 'node esbuild.config.mjs --watch' },
  devDependencies: { esbuild: devDependencies.esbuild },
}, null, 2)}\n`);
await writeFile(join(out, 'esbuild.config.mjs'), `import { context } from 'esbuild';

const build = await context({
  entryPoints: ['src/main.js'],
  outfile: 'main.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  logLevel: 'info',
});
if (process.argv.includes('--watch')) await build.watch();
else { await build.rebuild(); await build.dispose(); }
`);
await writeFile(join(out, '.gitignore'), 'node_modules/\nmain.js\npackage-lock.json\n');
console.log(`Exported ${manifest.id} ${manifest.version} to ${out.replace(`${root}/`, '')}`);
