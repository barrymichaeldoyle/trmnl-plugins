// TRMNL's default JavaScript runtime calls transform(input) after each poll.
// input is the AdMob network report (a JSON array, which TRMNL wraps as data)
// or Google's error body, plus trmnl. The result holds only what the views
// need. A thrown error would freeze the previous screen, so every path returns
// a status the views can explain.
const DAY = 86400000;
// Symbols TRMNL's fonts render reliably; other currencies show their ISO code.
const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: 'CN¥', INR: '₹', BRL: 'R$', ZAR: 'R', AUD: 'A$', CAD: 'CA$', NZD: 'NZ$', MXN: 'MX$', HKD: 'HK$', SGD: 'S$', KRW: '₩', ILS: '₪', PHP: '₱', TRY: '₺' };
const WHOLE_UNITS = ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG', 'XAF', 'XOF', 'IDR', 'HUF', 'TWD'];

function transform(input) {
  const source = input && typeof input === 'object' ? input : {};
  const options = source.trmnl?.plugin_settings?.custom_fields_values || {};
  const publisherId = typeof options.publisher_id === 'string' ? options.publisher_id.trim() : '';
  const base = { account: { publisher_id: publisherId, currency: '', time_zone: '' } };
  if (!publisherId) return { ...base, status: 'setup' };

  const elements = reportElements(source);
  const failure = errorOf(source) || (elements || []).map(element => element && element.error).find(Boolean);
  if (failure) {
    const code = Number(failure.code);
    // Google answers a mistyped or unknown publisher ID with 400 "Invalid account information".
    const badAccount = code === 400 && /account/i.test(String(failure.message || ''));
    const status = code === 401 || failure.status === 'UNAUTHENTICATED' ? 'auth'
      : badAccount || [403, 404].includes(code) || ['PERMISSION_DENIED', 'NOT_FOUND'].includes(failure.status) ? 'access' : 'error';
    return { ...base, status };
  }
  if (!elements) return { ...base, status: 'error' };

  const header = (elements.find(element => element && element.header) || {}).header || {};
  // The header repeats the request's localization settings. The request sends
  // none, so if Google leaves the currency out, amounts show without a symbol.
  const currency = String(header.localizationSettings?.currencyCode || '').toUpperCase();
  const timeZone = header.reportingTimeZone || source.trmnl?.user?.time_zone_iana || '';
  const account = { publisher_id: publisherId, currency, time_zone: timeZone };
  // One record per AdMob day: earnings in micros plus the three counts.
  const days = new Map();
  for (const element of elements) {
    const row = element && element.row;
    const date = dayNumber(row?.dimensionValues?.DATE?.value);
    const values = row?.metricValues || {};
    const micros = Number(values.ESTIMATED_EARNINGS?.microsValue);
    if (date === null || !Number.isFinite(micros)) continue;
    const day = days.get(date) || { micros: 0, requests: 0, impressions: 0, clicks: 0 };
    day.micros += micros;
    for (const [key, metric] of [['requests', 'AD_REQUESTS'], ['impressions', 'IMPRESSIONS'], ['clicks', 'CLICKS']]) day[key] += Number(values[metric]?.integerValue) || 0;
    days.set(date, day);
  }
  if (!days.size) return { ...base, account, status: 'no_data' };

  // AdMob dates follow the account's reporting time zone. Without Intl, the
  // TRMNL user's offset is the closest stand-in; a row dated later wins.
  const offset = Number(source.trmnl?.user?.utc_offset) || 0;
  const latest = Math.max(...days.keys());
  const today = Math.max(localDay(timeZone, offset), latest);
  const reportStart = header.dateRange?.startDate ? civilDay(header.dateRange.startDate) : null;
  const sum = (from, to) => {
    const total = { micros: 0, requests: 0, impressions: 0, clicks: 0 };
    for (let day = from; day <= to; day++) for (const key in total) total[key] += (days.get(day) || {})[key] || 0;
    return total;
  };
  const covered = from => reportStart === null || reportStart === undefined || Number.isNaN(reportStart) || from >= reportStart;

  const date = civil(today);
  const monthStart = dayOf(date.year, date.month, 1);
  const previousMonthStart = dayOf(date.year, date.month - 1, 1);
  const olderMonthStart = dayOf(date.year, date.month - 2, 1);
  const elapsed = Math.min(date.day, monthStart - previousMonthStart);
  const lastWeek = today - 8;

  const style = ['amount', 'both'].includes(options.comparison_style) ? options.comparison_style : 'percent';
  const tile = (key, label, totals, compare) => {
    const result = { key, label, amount: formatMoney(totals.micros, currency), amount_compact: compactMoney(totals.micros, currency), amount_short: shortMoney(totals.micros, currency), micros: totals.micros, ...metrics(totals) };
    if (!compare) return { ...result, compare_label: '', compare_amount: '', delta_percent: '', delta_amount: '', direction: 'none', change: '', compare_phrase: '', comparison: '', comparison_short: '' };
    if (!covered(compare.from)) return { ...result, compare_label: compare.label, compare_amount: '', delta_percent: '', delta_amount: '', direction: 'none', change: '', compare_phrase: `No data for ${compare.label}`, comparison: `No data for ${compare.label}`, comparison_short: '' };
    const change = delta(totals.micros, compare.micros, currency);
    const text = style === 'amount' ? change.delta_amount : style === 'both' ? `${change.delta_percent} (${change.delta_amount})` : change.delta_percent;
    return { ...result, compare_label: compare.label, compare_amount: formatMoney(compare.micros, currency), ...change,
      // Wide tiles show the change on its own line and the period beneath it.
      change: text, compare_phrase: `vs ${compare.label}`,
      comparison: `${text} vs ${compare.label}`, comparison_short: style === 'amount' ? change.delta_amount : change.delta_percent };
  };
  const tiles = [
    tile('today', 'Today so far', sum(today, today)),
    tile('yesterday', 'Yesterday', sum(today - 1, today - 1), { label: 'the same day last week', micros: sum(lastWeek, lastWeek).micros, from: lastWeek }),
    tile('month', 'This month so far', sum(monthStart, today), { label: 'the same day last month', micros: sum(previousMonthStart, previousMonthStart + elapsed - 1).micros, from: previousMonthStart }),
    tile('last_month', 'Last month', sum(previousMonthStart, monthStart - 1), { label: 'the month before last', micros: sum(olderMonthStart, previousMonthStart - 1).micros, from: olderMonthStart }),
  ];
  const secondary = tiles.slice(1);
  const widest = (list, key) => Math.max(...list.map(value => textEms(value[key])));
  return {
    ...base, account, status: 'ok', tiles,
    primary: tiles[0], secondary,
    amount_classes: amountClasses(textEms(tiles[0].amount), widest(secondary, 'amount'), widest(secondary, 'amount_compact'), widest(secondary, 'amount_short')),
    today_reported: days.has(today),
    as_of_date: isoDate(today),
    // The report was fetched just before this transform ran.
    updated_at: `Updated ${clockTime(source.trmnl?.user?.time_zone_iana, offset)}`,
  };
}

// Requests, impressions and clicks: exact in wide tiles, abbreviated in narrow ones.
function metrics(totals) {
  const exact = value => grouped(String(Math.round(value)));
  const compact = value => value < 10000 ? exact(value) : compactNumber(Math.round(value));
  const plural = (value, word) => `${word}${value === 1 ? '' : 's'}`;
  return {
    requests: exact(totals.requests), impressions: exact(totals.impressions), clicks: exact(totals.clicks),
    metrics_line: `${exact(totals.requests)} ${plural(totals.requests, 'request')} · ${exact(totals.impressions)} ${plural(totals.impressions, 'impression')} · ${exact(totals.clicks)} ${plural(totals.clicks, 'click')}`,
    // One line per count for tiles that stack them.
    metric_lines: [`${exact(totals.requests)} ${plural(totals.requests, 'request')}`, `${exact(totals.impressions)} ${plural(totals.impressions, 'impression')}`, `${exact(totals.clicks)} ${plural(totals.clicks, 'click')}`],
    metric_lines_compact: [`${compact(totals.requests)} ${plural(totals.requests, 'request')}`, `${compact(totals.impressions)} ${plural(totals.impressions, 'impression')}`, `${compact(totals.clicks)} ${plural(totals.clicks, 'click')}`],
    metrics_line_compact: `${compact(totals.requests)} ${plural(totals.requests, 'request')} · ${compact(totals.impressions)} ${plural(totals.impressions, 'impression')} · ${compact(totals.clicks)} ${plural(totals.clicks, 'click')}`,
  };
}

function clockTime(timeZone, offsetSeconds) {
  const now = Date.now();
  if (timeZone && typeof Intl !== 'undefined') {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now));
    } catch (error) { /* Fall back to the offset. */ }
  }
  const local = new Date(now + offsetSeconds * 1000);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}

// Every amount in a group shares one size: the largest the widest amount fits.
// Room is the text width in CSS px for TRMNL OG landscape, OG portrait, X
// landscape and X portrait, measured in the framework; caps keep rows in height.
const VALUE_SIZES = [['xsmall', 20], ['small', 26], ['base', 38], ['large', 58], ['xlarge', 74], ['xxlarge', 96], ['xxxlarge', 128], ['mega', 170], ['giga', 220]];
const PREFIXES = ['', 'portrait:', 'lg:', 'lg:portrait:'];
const ROOM = {
  primary: {
    full: { width: [770, 455, 1010, 755], cap: [128, 128, 220, 170] },
    half_horizontal: { width: [250, 435, 325, 735], cap: [128, 128, 170, 128] },
    half_vertical: { width: [380, 220, 500, 370], cap: [96, 128, 170, 170] },
    quadrant: { width: [380, 220, 500, 370], cap: [74, 96, 128, 128] },
  },
  secondary: {
    full: { width: [228, 290, 305, 560], cap: [58, 58, 74, 74] },
    half_horizontal: { width: [155, 135, 210, 235], cap: [38, 38, 58, 58] },
    half_vertical: { width: [347, 187, 467, 337], cap: [38, 58, 58, 74] },
    quadrant: { width: [115, 187, 155, 337], cap: [26, 26, 38, 38] },
  },
};
// Width in ems: Inter's tabular digits are 0.645em, separators 0.27em.
function textEms(text) { return Array.from(text).reduce((total, char) => total + (/\d/.test(char) ? 0.645 : /[.,]/.test(char) ? 0.27 : 0.7), 0); }
function amountClasses(primaryEms, secondaryEms, secondaryCompactEms, secondaryShortEms) {
  const pick = (width, ems, cap) => (VALUE_SIZES.filter(([, size]) => size <= cap && ems * size * 1.03 <= width).pop() || VALUE_SIZES[0])[0];
  // ems may differ by orientation: [landscape, portrait].
  const classes = (room, ems) => room.width.map((width, index) => `${PREFIXES[index]}value--${pick(width, [].concat(ems)[index % 2] ?? ems, room.cap[index])}`).join(' ');
  return {
    primary: Object.fromEntries(Object.entries(ROOM.primary).map(([view, room]) => [view, classes(room, primaryEms)])),
    // Half horizontal and the quadrant always use short amounts; half vertical only in portrait.
    secondary: Object.fromEntries(Object.entries(ROOM.secondary).map(([view, room]) => [view, classes(room,
      view === 'full' ? secondaryEms : view === 'half_vertical' ? [secondaryCompactEms, secondaryShortEms] : secondaryShortEms)])),
  };
}

// A single polling URL arrives as { data: [...] }; IDX_0 covers a second URL
// being added later, and a bare array covers runtimes that skip the wrapper.
function reportElements(source) {
  const candidates = [source.data, source.IDX_0?.data, source.IDX_0, source.IDX_1?.data, source];
  const found = candidates.find(candidate => Array.isArray(candidate) && candidate.some(element => element && (element.header || element.row || element.footer || element.error)));
  if (found) return found;
  const indexed = Object.keys(source).filter(key => /^\d+$/.test(key)).sort((a, b) => a - b).map(key => source[key]);
  return indexed.length ? indexed : null;
}

function errorOf(source) {
  for (const candidate of [source, source.data, source.IDX_0, source.IDX_0?.data]) {
    if (candidate && !Array.isArray(candidate) && typeof candidate.error === 'object' && candidate.error) return candidate.error;
  }
  return null;
}

// Days since 1970-01-01, so date arithmetic stays in whole numbers.
function dayOf(year, month, day) { return Math.round(Date.UTC(year, month - 1, day) / DAY); }
function civil(day) { const date = new Date(day * DAY); return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }; }
function civilDay(value) { return value && value.year ? dayOf(Number(value.year), Number(value.month), Number(value.day)) : null; }
function isoDate(day) { return new Date(day * DAY).toISOString().slice(0, 10); }
function dayNumber(value) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(value || ''));
  return match ? dayOf(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

function localDay(timeZone, offsetSeconds) {
  const now = Date.now();
  if (timeZone && typeof Intl !== 'undefined') {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
      const day = dayOf(Number(parts.year), Number(parts.month), Number(parts.day));
      if (Number.isFinite(day)) return day;
    } catch (error) { /* Unknown zone or no time zone data: fall back to the offset. */ }
  }
  return Math.floor((now + offsetSeconds * 1000) / DAY);
}

function decimalsFor(currency) { return WHOLE_UNITS.includes(currency) ? 0 : 2; }
function prefixFor(currency) { return SYMBOLS[currency] || (currency ? `${currency} ` : ''); }
function grouped(digits) { return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function formatMoney(micros, currency) {
  const decimals = decimalsFor(currency);
  const units = roundDiv(Math.abs(micros), 10 ** (6 - decimals));
  const whole = String(Math.floor(units / 10 ** decimals));
  const fraction = decimals ? `.${String(units % 10 ** decimals).padStart(decimals, '0')}` : '';
  return `${micros < 0 && units ? '-' : ''}${prefixFor(currency)}${grouped(whole)}${fraction}`;
}

// Narrow views abbreviate large amounts: $12.3K, ¥38.4M. Smaller ones stay exact.
// Three significant figures, rounded to nearest; a value that rounds up to 1,000
// moves to the next unit, so 999,960 is 1M rather than 1000K.
// `scale` is the size of one unit in `value`: 1e6 for micros, 1 for counts.
function compactNumber(value, scale = 1) {
  const units = [[1e3, 'K'], [1e6, 'M'], [1e9, 'B']];
  for (const [index, [divisor, suffix]] of units.entries()) {
    const last = index === units.length - 1;
    const scaled = value / (divisor * scale);
    if (scaled >= 1000 && !last) continue;
    const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    const digits = roundDiv(value, divisor * scale / 10 ** decimals);
    if (decimals === 0 && digits >= 1000 && !last) continue;
    const text = decimals ? `${Math.floor(digits / 10 ** decimals)}.${String(digits % 10 ** decimals).padStart(decimals, '0')}` : String(digits);
    return `${text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text}${suffix}`;
  }
}

// Exact floor of a / b for non-negative integers, correcting any floating-point slip.
function floorDiv(a, b) {
  let quotient = Math.floor(a / b);
  if (quotient * b > a) quotient -= 1;
  else if ((quotient + 1) * b <= a) quotient += 1;
  return quotient;
}

// a / b rounded to the nearest integer, halves up, for non-negative integers.
function roundDiv(a, b) { return floorDiv(2 * a + b, 2 * b); }

// The narrowest tiles: cents below 100, whole units below 1,000, then K and M.
function shortMoney(micros, currency) {
  const value = Math.abs(shownMicros(micros, currency)) / 1e6;
  if (value < 100 || decimalsFor(currency) === 0) return compactMoney(micros, currency, 1000);
  const whole = roundDiv(Math.abs(micros), 1e6);
  if (whole < 1000) return formatMoney(whole * 1e6 * Math.sign(micros), currency).replace(/\.0+$/, '');
  return `${micros < 0 ? '-' : ''}${prefixFor(currency)}${compactNumber(Math.abs(micros), 1e6)}`;
}

// Micros rounded to the smallest unit formatMoney shows.
function shownMicros(micros, currency) {
  const step = 10 ** (6 - decimalsFor(currency));
  return Math.sign(micros) * roundDiv(Math.abs(micros), step) * step;
}

function compactMoney(micros, currency, from = 10000) {
  const value = Math.abs(shownMicros(micros, currency)) / 1e6;
  if (value < from) return formatMoney(micros, currency);
  return `${micros < 0 ? '-' : ''}${prefixFor(currency)}${compactNumber(Math.abs(micros), 1e6)}`;
}

function delta(amount, compare, currency) {
  const difference = amount - compare;
  // The amount change subtracts the two amounts as displayed, so it always matches them.
  const shown = shownMicros(amount, currency) - shownMicros(compare, currency);
  const sign = shown > 0 ? '+' : shown < 0 ? '-' : '';
  const deltaAmount = `${sign}${formatMoney(Math.abs(shown), currency)}`;
  if (compare === 0) return { delta_percent: amount === 0 ? '0%' : 'New', delta_amount: deltaAmount, direction: amount === 0 ? 'flat' : 'up' };
  // Whole percent, halves away from zero, in integer arithmetic so 0.5% is exactly 1%.
  const base = Math.abs(compare);
  const rounded = floorDiv(Math.abs(difference) * 200 + base, base * 2);
  if (rounded === 0) return { delta_percent: '0%', delta_amount: deltaAmount, direction: 'flat' };
  return { delta_percent: `${sign}${rounded}%`, delta_amount: deltaAmount, direction: difference > 0 ? 'up' : 'down' };
}
