import { addDays, dailyNotePath } from '../lib/dates.js';

const KEEP_DAYS = 120;
const number = new Intl.NumberFormat('en-US');

// Words written today, the daily streak, and a bar for each recent day. The
// plugin measures the vault's total word count each run; a day's words are how
// far that total rose from the day's first measurement.
export default {
  type: 'writing_stats',
  name: 'Writing stats',
  description: 'Words written today, your streak of writing days and a bar chart of recent days.',
  defaults: { excludeFolders: ['Templates'], historyDays: 14 },

  async collect(ctx) {
    const { excludeFolders, historyDays } = ctx.options;
    const files = ctx.vault.files({ exclude: excludeFolders });
    let total = 0;
    for (const file of files) total += await ctx.vault.words(file);

    const days = ctx.state.days ??= {};
    if (!days[ctx.today]) {
      const previous = Object.keys(days).filter(day => day < ctx.today).sort().at(-1);
      days[ctx.today] = { start: previous ? days[previous].latest : total, latest: total };
    }
    days[ctx.today].latest = total;
    for (const day of Object.keys(days)) if (day < addDays(ctx.today, -KEEP_DAYS)) delete days[day];
    const written = day => days[day] ? Math.max(0, days[day].latest - days[day].start) : 0;

    // A day counts towards the streak if words were written or it has a daily
    // note. Today not counting yet doesn't break a streak that ran to yesterday.
    const paths = new Set(ctx.vault.files().map(file => file.path));
    const active = day => written(day) > 0 || paths.has(dailyNotePath(ctx.moment, day, ctx.dailyNotes));
    let day = active(ctx.today) ? ctx.today : addDays(ctx.today, -1);
    let streak = 0;
    while (active(day) && streak < 3650) { streak++; day = addDays(day, -1); }

    const weekStart = ctx.moment(ctx.today, 'YYYY-MM-DD').subtract(6, 'days').startOf('day').valueOf();
    const history = Array.from({ length: historyDays }, (_, index) => addDays(ctx.today, index - historyDays + 1)).map(date => ({ date, words: written(date) }));
    const most = Math.max(0, ...history.map(entry => entry.words));
    return {
      status: 'ok',
      words_today: written(ctx.today),
      streak_days: streak,
      notes_created_7d: files.filter(file => file.ctime >= weekStart).length,
      total_notes: files.length,
      total_words: total,
      // Figures as the screen shows them, with thousands separators.
      labels: { words_today: number.format(written(ctx.today)), total_words: number.format(total), total_notes: number.format(files.length), history_max: number.format(most) },
      history_max: most,
      // Bars are drawn in eight steps; any writing at all shows at least one.
      history: history.map(({ date, words }) => ({
        label: ctx.moment(date, 'YYYY-MM-DD').locale('en').format('dd').slice(0, 1),
        words,
        level: words && most ? Math.max(1, Math.round(words / most * 8)) : 0,
        ...(date === ctx.today ? { today: true } : {}),
      })),
    };
  },

  shrink(data) {
    if (!(data.history?.length > 7)) return null;
    return { ...data, history: data.history.slice(1) };
  },
};
