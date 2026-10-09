import { clip, inlineText } from '../lib/markdown.js';
import { basename } from '../lib/vault-index.js';

// A Dataview TABLE or LIST query, run through Dataview's own API.
export default {
  type: 'dataview_query',
  name: 'Dataview query',
  description: 'The rows of a Dataview TABLE or LIST query. Needs the Dataview plugin.',
  defaults: { title: 'Active projects', query: 'TABLE status, area FROM "Projects" WHERE status = "active" SORT file.name ASC', maxRows: 12, maxCellChars: 40 },

  async collect(ctx) {
    const { title, query, maxRows, maxCellChars } = ctx.options;
    const fail = message => ({ status: 'error', title, message });
    if (!ctx.dataview) return fail('Install and enable the Dataview plugin to use this screen.');
    if (!String(query ?? '').trim()) return fail('Add a Dataview query in the TRMNL Screens settings.');
    const result = await ctx.dataview.query(query);
    if (!result?.successful) return fail(`Dataview could not run the query: ${clip(inlineText(String(result?.error ?? 'unknown error')), 160)}`);
    const { type, headers = [], values = [] } = result.value;
    if (type !== 'table' && type !== 'list') return fail('Use a TABLE or LIST query. TASK and CALENDAR queries are not supported.');
    const cell = value => clip(display(ctx.moment, value), maxCellChars);
    let rows = values.slice(0, maxRows).map(row => type === 'table' ? row.map(cell) : [cell(row)]);
    let names = type === 'table' ? headers.map(header => clip(inlineText(header), maxCellChars)) : [];
    // A column with nothing to show in any row only takes width from the rest.
    if (type === 'table' && rows.length) {
      const keep = names.map((_, column) => column === 0 || rows.some(row => row[column]));
      names = names.filter((_, column) => keep[column]);
      rows = rows.map(row => row.filter((_, column) => keep[column]));
    }
    return { status: 'ok', title, kind: type, headers: names, rows, row_count: values.length, hidden: values.length - rows.length };
  },

  shrink(data) {
    if (!data.rows?.length) return null;
    return { ...data, rows: data.rows.slice(0, -1), hidden: data.hidden + 1 };
  },
};

// Dataview values are links, Luxon dates and durations, arrays, objects and
// plain values; each becomes the text Dataview itself would show.
export function display(moment, value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(item => display(moment, item)).filter(Boolean).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return inlineText(value);
  if (value.isLuxonDateTime || typeof value.toISODate === 'function') {
    const iso = value.toISODate();
    const hasTime = value.hour || value.minute;
    return moment(value.toISO?.() ?? iso).locale('en').format(hasTime ? 'D MMM YYYY HH:mm' : 'D MMM YYYY');
  }
  if (value.isLuxonDuration || typeof value.toHuman === 'function') return value.toHuman({ unitDisplay: 'short' });
  if (typeof value.path === 'string' && 'embed' in value) return inlineText(value.display || basename(value.path));
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${display(moment, item)}`).join(', ');
  return inlineText(String(value));
}
