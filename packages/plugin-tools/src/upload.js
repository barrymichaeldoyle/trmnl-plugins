import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkPlugin, exportFiles, views } from './plugin.js';

// trmnlp push uploads <dir>/src and writes the server's settings back there, so
// stage a copy in the ignored cache. Uploads keep shared.liquid separate (TRMNL
// prepends it to each view); only the import ZIP inlines it.
export async function uploadPlugin(plugin, id) {
  if (id !== undefined && !/^\d+$/.test(id)) throw new Error('TRMNL_PLUGIN_ID must be a numeric plugin settings ID.');
  await checkPlugin(plugin);
  const exported = exportFiles(plugin);
  const stage = join(plugin.root, '.cache/upload');
  await rm(stage, { recursive: true, force: true });
  await mkdir(join(stage, 'src'), { recursive: true });
  await copyFile(join(plugin.root, '.trmnlp.yml'), join(stage, '.trmnlp.yml'));
  await writeFile(join(stage, 'src/settings.yml'), exported['settings.yml']);
  if (exported['transform.js']) await writeFile(join(stage, 'src/transform.js'), exported['transform.js']);
  for (const name of [...views, 'shared']) await copyFile(join(plugin.root, `src/${name}.liquid`), join(stage, `src/${name}.liquid`));
  const run = args => {
    const result = spawnSync('bundle', ['exec', 'trmnlp', ...args, '--dir', stage], { cwd: plugin.root, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`trmnlp ${args[0]} failed.`);
  };
  run(['lint']);
  // Without an ID, trmnlp creates a new private plugin; with one, it replaces that plugin's files.
  run(id ? ['push', '--id', id, '--force'] : ['push']);
}
