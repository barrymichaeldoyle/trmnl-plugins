// The demo vault's fixed moment and file times. Git does not keep mtimes, so
// fixtures use these, and pnpm demo:age applies them to the files on disk so
// Obsidian sees the same ages.
export const DEMO_NOW = '2026-10-09T14:00:00Z';
export const DEMO_TIME_ZONE = 'UTC';

const at = (date, time = '12:00') => Date.parse(`${date}T${time}:00Z`);
const daily = ['04', '05', '06', '07', '08', '09'].map(day => [`Daily/2026-10-${day}.md`, { ctime: at(`2026-10-${day}`, '07:30'), mtime: at(`2026-10-${day}`, day === '09' ? '13:40' : '21:15') }]);
export const demoTimes = Object.fromEntries([
  ...daily,
  ['Projects/TRMNL Plugin.md', { ctime: at('2026-10-01'), mtime: at('2026-10-09', '09:10') }],
  ['Projects/Garden Rebuild.md', { ctime: at('2026-09-12'), mtime: at('2026-09-20') }],
  ['Projects/Kitchen Shelf.md', { ctime: at('2026-09-28'), mtime: at('2026-10-08', '18:00') }],
  ['Projects/Reading Year.md', { ctime: at('2026-01-01'), mtime: at('2026-10-02') }],
  ['Notes/Why E-ink Works.md', { ctime: at('2026-08-14'), mtime: at('2026-08-14') }],
  ['Notes/Old Idea - Vault Metrics.md', { ctime: at('2026-06-20'), mtime: at('2026-07-01') }],
  ['Notes/Compost Ratios.md', { ctime: at('2026-05-03'), mtime: at('2026-05-03') }],
  ['Notes/Meeting Notes Template Ideas.md', { ctime: at('2026-03-11'), mtime: at('2026-03-11') }],
  ['Books/Thinking in Systems.md', { ctime: at('2026-09-15'), mtime: at('2026-10-06', '22:00') }],
  ['Books/The Overstory.md', { ctime: at('2026-07-02'), mtime: at('2026-08-30') }],
  ['Focus.md', { ctime: at('2026-10-05', '08:00'), mtime: at('2026-10-07', '08:30') }],
  ['Templates/Daily.md', { ctime: at('2026-09-01'), mtime: at('2026-09-01') }],
  ['Welcome.md', { ctime: at('2026-10-09', '08:00'), mtime: at('2026-10-09', '08:00') }],
]);

// Words written on recent days, as the plugin would have measured them.
// The demo vault's daily notes run from 4 to 9 October; writing before that
// makes a nine-day streak, broken on 30 September.
export const demoWords = { '2026-09-26': 410, '2026-09-27': 180, '2026-09-28': 0, '2026-09-29': 265, '2026-09-30': 0, '2026-10-01': 520, '2026-10-02': 95, '2026-10-03': 330, '2026-10-04': 140, '2026-10-05': 610, '2026-10-06': 275, '2026-10-07': 480, '2026-10-08': 205, '2026-10-09': 312 };

// Writing-stats state ending at the vault's current total.
export function demoWritingState(total, words = demoWords) {
  const days = {};
  let level = total;
  for (const date of Object.keys(words).sort().reverse()) { days[date] = { start: level - words[date], latest: level }; level -= words[date]; }
  return { days };
}

// Dataview stand-in for fixtures: it answers the default query the way
// Dataview does for the demo vault, with Link and Luxon-like values.
export function demoDataview(frontmatter) {
  const date = iso => ({ isLuxonDateTime: true, hour: 0, minute: 0, toISODate: () => iso, toISO: () => `${iso}T00:00:00.000Z` });
  return {
    async query() {
      const rows = Object.entries(frontmatter).filter(([path]) => path.startsWith('Projects/'))
        .sort((a, b) => b[1].started.localeCompare(a[1].started))
        .map(([path, fields]) => [{ path, display: undefined, embed: false, type: 'file' }, fields.status, fields.area, date(fields.started)]);
      return { successful: true, value: { type: 'table', headers: ['File', 'Status', 'Area', 'Started'], values: rows } };
    },
  };
}
