import { blocks, clip } from '../lib/markdown.js';
import { daysBetween, plural } from '../lib/dates.js';
import { basename, folderOf } from '../lib/vault-index.js';

// One older note, brought back for a day. Notes untouched the longest are the
// likeliest picks.
export default {
  type: 'resurface',
  name: 'Resurfaced note',
  description: 'A note you have not opened in a while, with its opening paragraphs. A new pick each day.',
  defaults: { includeFolders: [], excludeFolders: ['Templates'], skipDailyNotes: true, weighting: 'stale', excerptChars: 400, minWords: 50, rotateHours: 24 },

  async collect(ctx) {
    const { includeFolders, excludeFolders, skipDailyNotes, weighting, excerptChars, minWords, rotateHours } = ctx.options;
    const exclude = [...excludeFolders, ...(skipDailyNotes && ctx.dailyNotes?.folder ? [ctx.dailyNotes.folder] : [])];
    const candidates = [];
    for (const file of ctx.vault.files({ include: includeFolders, exclude })) if (await ctx.vault.words(file) >= minWords) candidates.push(file);
    if (!candidates.length) return { status: 'empty', message: `No notes of ${minWords} words or more to bring back yet.` };

    const now = ctx.now.valueOf();
    let file = candidates.find(candidate => candidate.path === ctx.state.path);
    if (!file || !(now - ctx.state.picked < rotateHours * 3600000)) {
      const age = candidate => Math.max(1, (now - candidate.mtime) / 86400000);
      const weights = candidates.map(candidate => weighting === 'stale' ? age(candidate) : 1);
      let target = ctx.random() * weights.reduce((sum, weight) => sum + weight, 0);
      file = candidates.find((_, index) => (target -= weights[index]) < 0) ?? candidates.at(-1);
      ctx.state.path = file.path;
      ctx.state.picked = now;
    }

    const parts = blocks(await ctx.vault.text(file));
    const title = parts[0]?.kind === 'h' && parts[0].level === 1 ? parts.shift().text : basename(file.path);
    const paragraphs = [];
    let room = excerptChars;
    // Whole paragraphs while they fit. Only the first is ever cut, and a later
    // one only when there is room for a real sentence of it.
    for (const part of parts) {
      if (part.kind === 'h' || part.kind === 'task') continue;
      const text = part.kind === 'pair' ? `${part.label}: ${part.text}` : part.text;
      if (text.length > room && paragraphs.length && room < 160) break;
      paragraphs.push(clip(text, room));
      room -= text.length;
      if (room <= 0) break;
    }
    const modified = ctx.moment(file.mtime).format('YYYY-MM-DD');
    const age_days = Math.max(0, daysBetween(modified, ctx.today));
    return {
      status: 'ok', title: clip(title, 80), folder: folderOf(file.path), paragraphs,
      modified_label: ctx.moment(file.mtime).locale('en').format('D MMM YYYY'),
      age_label: age_days === 0 ? 'Edited today' : age_days === 1 ? 'Edited yesterday' : `Edited ${plural(age_days, 'day')} ago`,
      age_days, word_count: await ctx.vault.words(file),
    };
  },

  shrink(data) {
    if (!(data.paragraphs?.length > 1)) return null;
    return { ...data, paragraphs: data.paragraphs.slice(0, -1) };
  },
};
