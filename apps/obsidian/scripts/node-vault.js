import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

// A vault on disk, read the way Obsidian lists it: Markdown files only, with
// dot-folders such as .obsidian and .trash skipped. Times can be overridden so
// fixtures do not depend on when the repository was checked out.
export async function nodeVault(root, { times = {} } = {}) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.md')) {
        const info = await stat(path);
        const key = relative(root, path).split(sep).join('/');
        files.push({ path: key, mtime: times[key]?.mtime ?? info.mtimeMs, ctime: times[key]?.ctime ?? info.birthtimeMs });
      }
    }
  }
  await walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files: () => files, read: path => readFile(join(root, path), 'utf8') };
}
