// Dates are local calendar days in the vault's time zone, carried as
// YYYY-MM-DD strings. moment is Obsidian's bundled copy; labels are English to
// match the recipe's own words.

const DAY = 86400000;
const utc = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };

export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / DAY);

export function addDays(iso, days) {
  return new Date(utc(iso) + days * DAY).toISOString().slice(0, 10);
}

export function dayLabel(moment, iso, today) {
  const days = daysBetween(today, iso);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return moment(iso, 'YYYY-MM-DD').locale('en').format('ddd D MMM');
}

export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// Where the daily note for a day lives, from the Daily Notes or Periodic
// Notes settings. Formats may contain folders, such as YYYY/MM/YYYY-MM-DD.
// Obsidian names notes in its own locale, so this does too.
export function dailyNotePath(moment, iso, { folder = '', format = 'YYYY-MM-DD' } = {}) {
  const name = moment(iso, 'YYYY-MM-DD').format(format || 'YYYY-MM-DD');
  const prefix = String(folder ?? '').trim().replace(/^\/+|\/+$/g, '');
  return `${prefix ? `${prefix}/` : ''}${name}.md`;
}
