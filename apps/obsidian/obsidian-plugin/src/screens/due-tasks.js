import { clip } from '../lib/markdown.js';
import { daysBetween, dayLabel, plural } from '../lib/dates.js';
import { basename, folderOf } from '../lib/vault-index.js';

// Open tasks across the vault that are overdue, due today or due soon. Due
// dates come from the Tasks plugin (📅 2026-10-09) or a Dataview due:: field.
export default {
  type: 'due_tasks',
  name: 'Due and overdue tasks',
  description: 'Open tasks with a due date, across the whole vault: overdue first, then today, then the days ahead.',
  defaults: { lookaheadDays: 7, includeFolders: [], excludeFolders: ['Templates'], maxItems: 15 },

  async collect(ctx) {
    const { lookaheadDays, includeFolders, excludeFolders, maxItems } = ctx.options;
    const due = [];
    for (const file of ctx.vault.files({ include: includeFolders, exclude: excludeFolders })) {
      for (const task of await ctx.vault.tasks(file)) {
        if (task.done || !task.due) continue;
        const days = daysBetween(ctx.today, task.due);
        if (days <= lookaheadDays) due.push({ ...task, days, file: source(file.path, ctx.dailyNotes) });
      }
    }
    due.sort((a, b) => a.due.localeCompare(b.due) || a.file.localeCompare(b.file) || a.text.localeCompare(b.text));
    const bucket = days => days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming';
    const count = name => due.filter(task => bucket(task.days) === name).length;
    const tasks = due.slice(0, maxItems).map(task => ({
      text: clip(task.text, 100),
      file: clip(task.file, 40),
      bucket: bucket(task.days),
      days: task.days,
      due_label: dayLabel(ctx.moment, task.due, ctx.today),
      when: task.days < 0 ? `${plural(-task.days, 'day')} late` : dayLabel(ctx.moment, task.due, ctx.today),
    }));
    return { status: 'ok', overdue_count: count('overdue'), today_count: count('today'), upcoming_count: count('upcoming'), lookahead_days: lookaheadDays, tasks, hidden: due.length - tasks.length };
  },

  shrink(data) {
    if (!data.tasks?.length) return null;
    return { ...data, tasks: data.tasks.slice(0, -1), hidden: data.hidden + 1 };
  },
};

// A daily note's name is its date, which the due label already shows.
function source(path, dailyNotes) {
  const folder = String(dailyNotes?.folder ?? '').replace(/^\/+|\/+$/g, '');
  const name = basename(path);
  return (folderOf(path) === folder || folderOf(path).startsWith(`${folder}/`)) && /\d/.test(name) && folder !== '' ? 'Daily note' : name;
}
