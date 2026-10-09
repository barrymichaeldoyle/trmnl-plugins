import { blocks, clip } from '../lib/markdown.js';
import { basename } from '../lib/vault-index.js';

// One chosen note, as plain lines: headings, prose, "Label: text" pairs,
// list items and checkboxes.
export default {
  type: 'pinned_note',
  name: 'Pinned note',
  description: 'The contents of one note you choose, such as a weekly plan or a list of current priorities.',
  defaults: { path: 'Focus.md', maxChars: 1500 },

  affects: (path, ctx) => path === notePath(ctx.options.path),

  async collect(ctx) {
    const path = notePath(ctx.options.path);
    if (!path) return { status: 'error', message: 'Choose a note to pin in the TRMNL Screens settings.' };
    const file = ctx.vault.file(path);
    if (!file) return { status: 'missing', message: `There is no note at ${clip(path, 120)}.` };
    const parts = blocks(await ctx.vault.text(file));
    const title = parts[0]?.kind === 'h' && parts[0].level === 1 ? parts.shift().text : basename(path);
    const lines = [];
    let room = ctx.options.maxChars;
    for (const part of parts) {
      if (room <= 0) break;
      const line = { kind: part.kind === 'h' ? 'heading' : part.kind, text: clip(part.text, Math.max(20, Math.min(room, 240))) };
      if (part.kind === 'pair') line.label = clip(part.label, 40);
      if (part.kind === 'task') line.done = part.done;
      if (part.depth) line.sub = true;
      lines.push(line);
      room -= line.text.length + (line.label?.length ?? 0);
    }
    return { status: 'ok', title: clip(title, 80), lines, hidden: parts.length - lines.length, modified_label: ctx.moment(file.mtime).locale('en').format('D MMM HH:mm') };
  },

  shrink(data) {
    if (!data.lines?.length) return null;
    return { ...data, lines: data.lines.slice(0, -1), hidden: data.hidden + 1 };
  },
};

export function notePath(value) {
  const path = String(value ?? '').trim().replace(/^\/+/, '');
  if (!path) return '';
  return /\.md$/i.test(path) ? path : `${path}.md`;
}
