import { clip } from '../lib/markdown.js';
import { dailyNotePath } from '../lib/dates.js';

// The checkboxes in today's daily note, grouped under their headings.
export default {
  type: 'daily_tasks',
  name: 'Today’s daily note tasks',
  description: 'Checkboxes from today’s daily note, grouped by heading.',
  defaults: { includeCompleted: true, groupByHeading: true, maxItems: 20 },

  affects: (path, ctx) => path === dailyNotePath(ctx.moment, ctx.today, ctx.dailyNotes),

  async collect(ctx) {
    const { includeCompleted, groupByHeading, maxItems } = ctx.options;
    const path = dailyNotePath(ctx.moment, ctx.today, ctx.dailyNotes);
    const date_label = ctx.moment(ctx.today, 'YYYY-MM-DD').locale('en').format('dddd D MMMM');
    const file = ctx.vault.file(path);
    if (!file) return { status: 'missing', date_label, message: 'Create today’s note in Obsidian and its checkboxes appear here.' };
    const tasks = await ctx.vault.tasks(file);
    const done = tasks.filter(task => task.done).length;
    let shown = tasks.filter(task => includeCompleted || !task.done).map((task, order) => ({ ...task, order }));
    // Past the limit, completed tasks go first, then the last open ones.
    while (shown.length > maxItems) {
      const lastDone = shown.findLastIndex(task => task.done);
      shown.splice(lastDone >= 0 ? lastDone : shown.length - 1, 1);
    }
    const groups = [];
    for (const task of shown) {
      const heading = groupByHeading && task.heading && task.heading.level > 1 ? task.heading.text : '';
      let group = groups.at(-1);
      if (!group || group.heading !== heading) groups.push(group = { heading, tasks: [] });
      group.tasks.push({ text: clip(task.text, 120), done: task.done, ...(task.depth ? { sub: true } : {}) });
    }
    return { status: 'ok', date_label, total: tasks.length, done, open: tasks.length - done, groups, hidden: tasks.filter(task => includeCompleted || !task.done).length - shown.length };
  },

  shrink(data) {
    if (!data.groups?.length) return null;
    const groups = structuredClone(data.groups);
    const tasks = groups.flatMap(group => group.tasks);
    const target = tasks.findLast(task => task.done) ?? tasks.at(-1);
    for (const group of groups) { const index = group.tasks.indexOf(target); if (index >= 0) group.tasks.splice(index, 1); }
    return { ...data, groups: groups.filter(group => group.tasks.length), hidden: data.hidden + 1 };
  },
};
