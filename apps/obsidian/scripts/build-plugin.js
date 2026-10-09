// Bundles the Obsidian plugin into dist/obsidian-plugin/ (main.js and
// manifest.json, the two files Obsidian loads). --vault also installs it into
// the demo vault; --watch rebuilds on change.
import { context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const watch = process.argv.includes('--watch');
const outputs = [join(root, 'dist/obsidian-plugin')];
if (process.argv.includes('--vault')) outputs.push(join(root, 'demo-vault/.obsidian/plugins/trmnl-screens'));

const install = {
  name: 'install',
  setup(build) {
    build.onEnd(async result => {
      if (result.errors.length) return;
      for (const directory of outputs.slice(1)) {
        await mkdir(directory, { recursive: true });
        await copyFile(join(outputs[0], 'main.js'), join(directory, 'main.js'));
      }
      for (const directory of outputs) await copyFile(join(root, 'obsidian-plugin/manifest.json'), join(directory, 'manifest.json'));
      console.log(`Obsidian plugin built: ${outputs.map(directory => directory.replace(`${root}/`, '')).join(', ')}`);
    });
  },
};

await mkdir(outputs[0], { recursive: true });
const build = await context({
  entryPoints: [join(root, 'obsidian-plugin/src/main.js')],
  outfile: join(outputs[0], 'main.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  logLevel: 'warning',
  plugins: [install],
});
if (watch) await build.watch();
else { await build.rebuild(); await build.dispose(); }
