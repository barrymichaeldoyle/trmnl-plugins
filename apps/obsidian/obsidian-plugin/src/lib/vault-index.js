import { parseTasks } from './tasks.js';
import { wordCount } from './markdown.js';

// Screens read the vault through this index. The source is anything with
// files() returning { path, mtime, ctime } for Markdown files and read(path):
// Obsidian's vault in the plugin, the file system in tests and fixtures.
// Parsed tasks and word counts are cached until a file's mtime changes, so a
// tick over a large vault only rereads what was edited.
export class VaultIndex {
  constructor(source) {
    this.source = source;
    this.cache = new Map();
  }

  files({ include = [], exclude = [] } = {}) {
    const within = (path, folders) => folders.some(folder => folder && (path === folder || path.startsWith(`${folder.replace(/\/+$/, '')}/`)));
    return this.source.files().filter(file => (!include.length || within(file.path, include)) && !within(file.path, exclude));
  }

  // A source that can look a path up directly (Obsidian's getFileByPath) is
  // asked; otherwise the list is searched.
  file(path) {
    if (this.source.file) return this.source.file(path);
    return this.source.files().find(file => file.path === path) ?? null;
  }

  async entry(file) {
    const cached = this.cache.get(file.path);
    if (cached && cached.mtime === file.mtime) return cached;
    const text = await this.source.read(file.path);
    const entry = { mtime: file.mtime, text };
    this.cache.set(file.path, entry);
    return entry;
  }

  async text(file) { return (await this.entry(file)).text; }
  async tasks(file) { const entry = await this.entry(file); return entry.tasks ??= parseTasks(entry.text); }
  async words(file) { const entry = await this.entry(file); return entry.words ??= wordCount(entry.text); }

  forget(path) { this.cache.delete(path); }
}

export const basename = path => path.split('/').pop().replace(/\.md$/, '');
export const folderOf = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
