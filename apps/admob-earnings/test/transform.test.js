import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../src/transform.js', import.meta.url), 'utf8');
const DAY = 86400000;

// Runs the transform the way TRMNL's default runtime does, at a fixed moment.
function run(input, { now, options = {}, offset = 0, intl = true } = {}) {
  const time = Date.parse(now);
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  }
  const trmnl = { user: { utc_offset: offset }, plugin_settings: { custom_fields_values: { publisher_id: 'pub-1', ...options } } };
  return runInNewContext(`${source}\ntransform(input)`, { input: { ...input, trmnl }, Date: FixedDate, Intl: intl ? Intl : undefined }, { timeout: 1000 });
}

// A report as TRMNL delivers it: AdMob's array wrapped as data. earnings maps
// YYYY-MM-DD to whole currency units.
function report(earnings, { currency = 'USD', timeZone = 'UTC', start, end, counts = {} } = {}) {
  const dates = Object.keys(earnings).sort();
  const parts = date => { const [year, month, day] = date.split('-').map(Number); return { year, month, day }; };
  return { data: [
    { header: { dateRange: { startDate: parts(start ?? dates[0] ?? '2026-01-01'), endDate: parts(end ?? dates.at(-1) ?? '2026-01-01') }, localizationSettings: { currencyCode: currency }, ...(timeZone ? { reportingTimeZone: timeZone } : {}) } },
    ...dates.map(date => ({ row: { dimensionValues: { DATE: { value: date.replaceAll('-', '') } }, metricValues: {
      ESTIMATED_EARNINGS: { microsValue: String(Math.round(earnings[date] * 1e6)) },
      ...(counts.requests !== undefined ? { AD_REQUESTS: { integerValue: String(counts.requests) }, IMPRESSIONS: { integerValue: String(counts.impressions) }, CLICKS: { integerValue: String(counts.clicks) } } : {}),
    } } })),
    { footer: { matchingRowCount: String(dates.length) } },
  ] };
}

// Every day from start to end (inclusive) earns the value the function returns.
function daily(start, end, value) {
  const result = {};
  for (let time = Date.parse(start); time <= Date.parse(end); time += DAY) result[new Date(time).toISOString().slice(0, 10)] = value(new Date(time).toISOString().slice(0, 10));
  return result;
}

const tile = (result, key) => result.tiles.find(entry => entry.key === key);

test('computes the primary and three secondary tiles mid-month', () => {
  const earnings = daily('2026-08-01', '2026-10-08', date => (date.startsWith('2026-10') ? 3 : date.startsWith('2026-09') ? 2 : 1));
  earnings['2026-10-07'] = 10;
  earnings['2026-09-30'] = 5;
  const result = run(report(earnings, { start: '2026-07-07' }), { now: '2026-10-08T12:00:00Z' });
  assert.equal(result.status, 'ok');
  assert.equal(result.as_of_date, '2026-10-08');
  assert.equal(JSON.stringify(result.tiles.map(entry => entry.label)), JSON.stringify(['Today so far', 'Yesterday', 'This month so far', 'Last month']));
  assert.equal(result.primary.key, 'today');
  assert.equal(result.secondary.map(entry => entry.key).join(), 'yesterday,month,last_month');
  assert.equal(tile(result, 'today').amount, '$3.00');
  assert.equal(tile(result, 'today').comparison, '');
  // Yesterday (Wed 7 Oct) compares with Wed 30 Sep.
  assert.equal(tile(result, 'yesterday').amount, '$10.00');
  assert.equal(tile(result, 'yesterday').compare_amount, '$5.00');
  assert.equal(tile(result, 'yesterday').comparison, '+100% vs the same day last week');
  // Oct 1-8 (7 × 3 + 10) against Sep 1-8 (8 × 2).
  assert.equal(tile(result, 'month').amount, '$31.00');
  assert.equal(tile(result, 'month').compare_amount, '$16.00');
  assert.equal(tile(result, 'month').comparison, '+93.8% vs the same day last month');
  // September: 29 × 2 + 5; August: 31 × 1.
  assert.equal(tile(result, 'last_month').amount, '$63.00');
  assert.equal(tile(result, 'last_month').compare_amount, '$31.00');
  assert.equal(tile(result, 'last_month').comparison, '+103% vs the month before last');
});

test('rolls over on the first of the month', () => {
  const earnings = daily('2026-08-01', '2026-10-01', () => 1);
  const result = run(report(earnings, { start: '2026-06-30' }), { now: '2026-10-01T08:00:00Z' });
  // Oct 1 against Sep 1; September (30 days) against August (31 days).
  assert.equal(tile(result, 'month').amount, '$1.00');
  assert.equal(tile(result, 'month').compare_amount, '$1.00');
  assert.equal(tile(result, 'last_month').amount, '$30.00');
  assert.equal(tile(result, 'last_month').compare_amount, '$31.00');
  assert.equal(tile(result, 'yesterday').compare_amount, '$1.00');
});

test('compares the 31st with the whole of a shorter previous month', () => {
  const earnings = daily('2026-01-01', '2026-03-31', () => 1);
  const result = run(report(earnings, { start: '2025-12-28' }), { now: '2026-03-31T12:00:00Z' });
  // March 1-31 compares with all 28 days of February 2026.
  assert.equal(tile(result, 'month').amount, '$31.00');
  assert.equal(tile(result, 'month').compare_amount, '$28.00');
  assert.equal(tile(result, 'last_month').amount, '$28.00');
  assert.equal(tile(result, 'last_month').compare_amount, '$31.00');
});

test('handles a leap-year February and the January rollover across years', () => {
  const leap = run(report(daily('2027-12-01', '2028-02-29', () => 1), { start: '2027-11-28' }), { now: '2028-02-29T12:00:00Z' });
  assert.equal(tile(leap, 'month').amount, '$29.00');
  assert.equal(tile(leap, 'month').compare_amount, '$29.00');
  const january = run(report(daily('2025-11-01', '2026-01-05', () => 2), { start: '2025-10-04' }), { now: '2026-01-05T12:00:00Z' });
  // December (31 days) against November (30 days); Jan 1-5 against Dec 1-5.
  assert.equal(tile(january, 'last_month').amount, '$62.00');
  assert.equal(tile(january, 'last_month').compare_amount, '$60.00');
  assert.equal(tile(january, 'month').compare_amount, '$10.00');
});

test('treats missing days as zero and reports a new account honestly', () => {
  const result = run(report({ '2026-10-06': 4, '2026-10-07': 2 }, { start: '2026-07-07' }), { now: '2026-10-08T12:00:00Z' });
  assert.equal(tile(result, 'today').amount, '$0.00');
  assert.equal(result.today_reported, false);
  assert.equal(tile(result, 'yesterday').delta_percent, 'New');
  assert.equal(tile(result, 'yesterday').direction, 'up');
  assert.equal(tile(result, 'last_month').amount, '$0.00');
  assert.equal(tile(result, 'last_month').direction, 'flat');
});

test('omits comparisons the report does not cover', () => {
  const result = run(report({ '2026-10-07': 2 }, { start: '2026-09-15' }), { now: '2026-10-08T12:00:00Z' });
  assert.equal(tile(result, 'month').direction, 'none');
  assert.equal(tile(result, 'month').comparison, 'No data for the same day last month');
  assert.equal(tile(result, 'yesterday').direction, 'up');
});

test('sums requests, impressions and clicks for every tile', () => {
  const counts = { requests: 1200, impressions: 1000, clicks: 1 };
  const result = run(report(daily('2026-09-01', '2026-10-08', () => 2), { start: '2026-07-07', counts }), { now: '2026-10-08T12:00:00Z' });
  assert.equal(tile(result, 'today').metrics_line, '1,200 requests · 1,000 impressions · 1 click');
  // 8 days of October.
  assert.equal(tile(result, 'month').metrics_line, '9,600 requests · 8,000 impressions · 8 clicks');
  // 30 days of September.
  assert.equal(tile(result, 'last_month').metrics_line_compact, '36K requests · 30K impressions · 30 clicks');
  assert.equal(tile(result, 'last_month').impressions, '30,000');
});

test('reports when the figures were fetched, in the TRMNL user\'s time', () => {
  const at = { now: '2026-10-08T06:05:00Z' };
  const data = report({ '2026-10-08': 1 }, { start: '2026-07-07' });
  assert.equal(run(data, { ...at, offset: 7200 }).updated_at, 'Updated 08:05');
  assert.equal(run(data, { ...at, offset: -25200, intl: false }).updated_at, 'Updated 23:05');
});

test('uses the account reporting time zone for today', () => {
  const earnings = daily('2026-08-01', '2026-10-08', () => 1);
  // 03:00 UTC on 8 Oct is still 7 Oct in Los Angeles.
  const losAngeles = run(report(earnings, { timeZone: 'America/Los_Angeles', start: '2026-07-07' }), { now: '2026-10-08T03:00:00Z' });
  assert.equal(losAngeles.as_of_date, '2026-10-08', 'a row dated later than the local date wins');
  const withoutToday = { ...earnings }; delete withoutToday['2026-10-08'];
  assert.equal(run(report(withoutToday, { timeZone: 'America/Los_Angeles', start: '2026-07-07' }), { now: '2026-10-08T03:00:00Z' }).as_of_date, '2026-10-07');
  // 23:30 UTC on 7 Oct is already 8 Oct in Johannesburg, before any row exists.
  const johannesburg = run(report(withoutToday, { timeZone: 'Africa/Johannesburg', start: '2026-07-07' }), { now: '2026-10-07T23:30:00Z' });
  assert.equal(johannesburg.as_of_date, '2026-10-08');
  assert.equal(tile(johannesburg, 'today').amount, '$0.00');
});

test('falls back to the TRMNL offset without Intl or a report time zone', () => {
  const earnings = daily('2026-08-01', '2026-10-07', () => 1);
  const ahead = run(report(earnings, { timeZone: 'Pacific/Auckland', start: '2026-07-07' }), { now: '2026-10-07T23:30:00Z', offset: 46800, intl: false });
  assert.equal(ahead.as_of_date, '2026-10-08');
  const missing = run(report(earnings, { timeZone: '', start: '2026-07-07' }), { now: '2026-10-07T23:30:00Z', offset: 0 });
  assert.equal(missing.as_of_date, '2026-10-07');
});

test('formats currencies with symbols, grouping and whole units', () => {
  const at = { now: '2026-10-08T12:00:00Z' };
  const amount = (currency, value) => tile(run(report({ '2026-10-08': value }, { currency, start: '2026-07-07' }), at), 'today');
  assert.equal(amount('USD', 1234567.891).amount, '$1,234,567.89');
  assert.equal(amount('JPY', 1234567.4).amount, '¥1,234,567');
  assert.equal(amount('EUR', 0.005).amount, '€0.01');
  assert.equal(amount('ZAR', 12.5).amount, 'R12.50');
  assert.equal(amount('CHF', 9).amount, 'CHF 9.00');
  assert.equal(amount('USD', 9999.99).amount_compact, '$9,999.99');
  assert.equal(amount('USD', 12345).amount_compact, '$12.3K');
  assert.equal(amount('USD', 100000).amount_compact, '$100K');
  assert.equal(amount('JPY', 38400000).amount_compact, '¥38.4M');
  assert.equal(amount('INR', 2e9).amount_compact, '₹2B');
});

test('shows plain amounts when the report header has no currency', () => {
  const result = run(report({ '2026-10-08': 1234.5 }, { currency: '', start: '2026-07-07' }), { now: '2026-10-08T12:00:00Z' });
  assert.equal(result.account.currency, '');
  assert.equal(tile(result, 'today').amount, '1,234.50');
});

test('writes comparisons in the chosen style', () => {
  const earnings = { '2026-09-30': 40, '2026-10-07': 50 };
  const line = style => tile(run(report(earnings, { start: '2026-07-07' }), { now: '2026-10-08T12:00:00Z', options: { comparison_style: style } }), 'yesterday');
  assert.equal(line('percent').comparison, '+25.0% vs the same day last week');
  assert.equal(line('amount').comparison, '+$10.00 vs the same day last week');
  assert.equal(line('both').comparison, '+25.0% (+$10.00) vs the same day last week');
  assert.equal(line('amount').comparison_short, '+$10.00');
  assert.equal(line(undefined).comparison_short, '+25.0%');
  const down = tile(run(report({ '2026-09-30': 50, '2026-10-07': 40 }, { start: '2026-07-07' }), { now: '2026-10-08T12:00:00Z' }), 'yesterday');
  assert.equal(down.delta_percent, '-20.0%');
  assert.equal(down.direction, 'down');
});

test('maps API errors and missing input to recovery states', () => {
  const at = { now: '2026-10-08T12:00:00Z' };
  assert.equal(run({ error: { code: 401, status: 'UNAUTHENTICATED' } }, at).status, 'auth');
  assert.equal(run({ error: { code: 403, status: 'PERMISSION_DENIED' } }, at).status, 'access');
  assert.equal(run({ error: { code: 404, status: 'NOT_FOUND' } }, at).status, 'access');
  assert.equal(run({ error: { code: 500, status: 'INTERNAL' } }, at).status, 'error');
  assert.equal(run({ error: { code: 400, status: 'INVALID_ARGUMENT', message: "Invalid account information in request url: 'accounts/pub-1'" } }, at).status, 'access');
  assert.equal(run({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Requested metrics and dimensions are incompatible.' } }, at).status, 'error');
  // Recorded from the live API: there is no "-" wildcard for the caller's account.
  assert.equal(run({ data: [{ error: { code: 400, message: 'Invalid parent name specified in request: accounts/-', status: 'INVALID_ARGUMENT' } }] }, at).status, 'access');
  // Streaming methods can report an error as an element of the array.
  assert.equal(run({ data: [{ error: { code: 401, status: 'UNAUTHENTICATED' } }] }, at).status, 'auth');
  assert.equal(run({}, at).status, 'error');
  assert.equal(run(report({}, { start: '2026-07-07' }), at).status, 'no_data');
  assert.equal(run(report({ '2026-10-08': 1 }), { ...at, options: { publisher_id: '' } }).status, 'setup');
});

test('accepts the report under IDX_0 or as a bare array', () => {
  const at = { now: '2026-10-08T12:00:00Z' };
  const { data } = report({ '2026-10-08': 7 }, { start: '2026-07-07' });
  assert.equal(tile(run({ IDX_0: { data } }, at), 'today').amount, '$7.00');
  assert.equal(tile(run({ ...data }, at), 'today').amount, '$7.00');
});

test('sizes the primary and secondary amounts from their widest values', () => {
  const at = { now: '2026-10-08T12:00:00Z' };
  const small = run(report({ '2026-10-08': 3 }, { start: '2026-07-07' }), at).amount_classes;
  const large = run(report({ '2026-10-08': 3, '2026-09-08': 36342382 }, { currency: 'JPY', start: '2026-07-07' }), at).amount_classes;
  for (const group of ['primary', 'secondary']) for (const view of ['full', 'half_horizontal', 'half_vertical', 'quadrant']) {
    assert.match(small[group][view], /^value--\w+ portrait:value--\w+ lg:value--\w+ lg:portrait:value--\w+$/);
  }
  // A short today figure is fat; a seven-digit last month shrinks only the secondary tiles.
  assert.equal(small.primary.full.split(' ')[0], 'value--mega');
  assert.equal(small.primary.full.split(' ')[2], 'lg:value--giga');
  assert.equal(large.primary.full, run(report({ '2026-10-08': 3 }, { currency: 'JPY', start: '2026-07-07' }), at).amount_classes.primary.full);
  assert.notEqual(small.secondary.full, large.secondary.full);
  assert.equal(small.secondary.full.split(' ')[0], 'value--large');
});
