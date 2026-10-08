#!/usr/bin/env node
// Writes synthetic AdMob network reports in the documented response shape:
// a header element, one row element per date with earnings, and a footer.
// https://developers.google.com/admob/api/reference/rest/v1/accounts.networkReport/generate
// The figures are invented and deterministic. Replace or extend them with
// recorded responses from scripts/fetch-report.js once OAuth is available.
import { writeFile } from 'node:fs/promises';

const day = 86400000;
const iso = time => new Date(time).toISOString().slice(0, 10);
const parts = date => { const [year, month, dayOfMonth] = date.split('-').map(Number); return { year, month, day: dayOfMonth }; };

// The polling body asks for 93 days, ending one day after the UTC date of the poll.
function report({ polledAt, currency, timeZone, base, through, seed, gaps = [], partial = through }) {
  const end = Date.parse(polledAt.slice(0, 10)) + day;
  const start = Date.parse(polledAt.slice(0, 10)) - 93 * day;
  let state = seed;
  const random = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  const rows = [];
  for (let time = start; time <= Date.parse(through); time += day) {
    const date = iso(time);
    if (gaps.includes(date)) continue;
    const weekday = new Date(time).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 1.18 : 1;
    // The current day is partial while it is still under way.
    const share = date === partial ? 0.42 : 1;
    const micros = Math.round(base * weekend * share * (0.8 + random() * 0.4) * 1e6);
    rows.push({ row: { dimensionValues: { DATE: { value: date.replaceAll('-', '') } }, metricValues: { ESTIMATED_EARNINGS: { microsValue: String(micros) } } } });
  }
  return [
    { header: { dateRange: { startDate: parts(iso(start)), endDate: parts(iso(end)) }, localizationSettings: { currencyCode: currency, languageCode: 'en-US' }, reportingTimeZone: timeZone } },
    ...rows,
    { footer: { matchingRowCount: String(rows.length) } },
  ];
}

const fixtures = {
  // A typical account mid-month, polled in the afternoon UTC (morning in California).
  'report-usd.json': report({ polledAt: '2026-10-08T15:00:00Z', currency: 'USD', timeZone: 'America/Los_Angeles', base: 42.5, through: '2026-10-08', seed: 7 }),
  // Seven-digit yen totals stress the widest values.
  'report-jpy.json': report({ polledAt: '2026-10-08T15:00:00Z', currency: 'JPY', timeZone: 'Asia/Tokyo', base: 1186000, through: '2026-10-09', seed: 11 }),
  // The first day of a month, compared with a 30-day September and a 31-day August.
  'report-eur-month-start.json': report({ polledAt: '2026-10-01T09:00:00Z', currency: 'EUR', timeZone: 'Europe/Berlin', base: 8.4, through: '2026-10-01', seed: 23, gaps: ['2026-09-24'] }),
  // Just after midnight in Johannesburg: yesterday is complete and today has no row yet.
  'report-zar-early.json': report({ polledAt: '2026-10-08T22:30:00Z', currency: 'ZAR', timeZone: 'Africa/Johannesburg', base: 612, through: '2026-10-08', partial: null, seed: 5 }),
};
fixtures['report-empty.json'] = report({ polledAt: '2026-10-08T15:00:00Z', currency: 'USD', timeZone: 'America/Los_Angeles', base: 0, through: '2026-07-01', seed: 1 }).filter(element => !element.row);
fixtures['report-empty.json'].at(-1).footer.matchingRowCount = '0';
// Google's error bodies, as returned for an expired grant and an inaccessible account.
fixtures['error-unauthenticated.json'] = { error: { code: 401, message: 'Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.', status: 'UNAUTHENTICATED' } };
fixtures['error-permission.json'] = { error: { code: 403, message: 'The caller does not have permission', status: 'PERMISSION_DENIED' } };

const directory = new URL('../fixtures/', import.meta.url);
for (const [name, value] of Object.entries(fixtures)) await writeFile(new URL(name, directory), JSON.stringify(value, null, 2) + '\n');
console.log(`Wrote ${Object.keys(fixtures).length} fixtures.`);
