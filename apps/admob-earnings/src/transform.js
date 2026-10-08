// TRMNL's default JavaScript runtime calls transform(input) after each poll.
// input is the AdMob network report (a JSON array, which TRMNL wraps as data)
// or Google's error body, plus trmnl. The result holds only what the views
// need. A thrown error would freeze the previous screen, so every path returns
// a status the views can explain.
const DAY = 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
  const earnings = new Map();
  for (const element of elements) {
    const row = element && element.row;
    const date = dayNumber(row?.dimensionValues?.DATE?.value);
    const micros = Number(row?.metricValues?.ESTIMATED_EARNINGS?.microsValue);
    if (date !== null && Number.isFinite(micros)) earnings.set(date, (earnings.get(date) || 0) + micros);
  }
  if (!earnings.size) return { ...base, account, status: 'no_data' };

  // AdMob dates follow the account's reporting time zone. Without Intl, the
  // TRMNL user's offset is the closest stand-in; a row dated later wins.
  const latest = Math.max(...earnings.keys());
  const today = Math.max(localDay(timeZone, Number(source.trmnl?.user?.utc_offset) || 0), latest);
  const reportStart = header.dateRange?.startDate ? civilDay(header.dateRange.startDate) : null;
  const sum = (from, to) => { let total = 0; for (let day = from; day <= to; day++) total += earnings.get(day) || 0; return total; };
  const covered = from => reportStart === null || reportStart === undefined || Number.isNaN(reportStart) || from >= reportStart;
  const money = micros => formatMoney(micros, currency);

  const date = civil(today);
  const monthStart = dayOf(date.year, date.month, 1);
  const previousMonthStart = dayOf(date.year, date.month - 1, 1);
  const olderMonthStart = dayOf(date.year, date.month - 2, 1);
  const elapsed = Math.min(date.day, monthStart - previousMonthStart);
  const previous = civil(previousMonthStart);
  const older = civil(olderMonthStart);
  const lastWeek = today - 8;

  const tile = (key, label, period, amount, compare) => {
    const result = { key, label, period, amount: money(amount), amount_compact: compactMoney(amount, currency), micros: amount };
    if (!compare) return { ...result, compare_label: '', compare_amount: '', delta_percent: '', delta_amount: '', direction: 'none' };
    const { label: compareLabel, micros, from } = compare;
    if (!covered(from)) return { ...result, compare_label: compareLabel, compare_amount: '', delta_percent: '', delta_amount: '', direction: 'none' };
    return { ...result, compare_label: compareLabel, compare_amount: money(micros), ...delta(amount, micros, currency) };
  };
  const style = ['amount', 'both'].includes(options.comparison_style) ? options.comparison_style : 'percent';
  const tiles = [
    tile('today', 'Today', `${WEEKDAYS[weekday(today)]} ${date.day} ${MONTHS[date.month - 1].slice(0, 3)}`, sum(today, today)),
    tile('yesterday', 'Yesterday', `${WEEKDAYS[weekday(today - 1)]} ${civil(today - 1).day} ${MONTHS[civil(today - 1).month - 1].slice(0, 3)}`, sum(today - 1, today - 1),
      { label: `last ${WEEKDAYS[weekday(lastWeek)]}`, micros: sum(lastWeek, lastWeek), from: lastWeek }),
    tile('month', 'This month', `${MONTHS[date.month - 1].slice(0, 3)} 1${date.day > 1 ? `-${date.day}` : ''}`, sum(monthStart, today),
      { label: `${MONTHS[previous.month - 1].slice(0, 3)} 1${elapsed > 1 ? `-${elapsed}` : ''}`, micros: sum(previousMonthStart, previousMonthStart + elapsed - 1), from: previousMonthStart }),
    tile('last_month', 'Last month', MONTHS[previous.month - 1], sum(previousMonthStart, monthStart - 1),
      { label: MONTHS[older.month - 1], micros: sum(olderMonthStart, previousMonthStart - 1), from: olderMonthStart }),
  ].map(value => ({ ...value, ...comparison(value, style, earnings.has(today)) }));
  const widest = (key, count = tiles.length) => Math.max(...tiles.slice(0, count).map(value => textEms(value[key])));
  return {
    ...base, account, status: 'ok', tiles,
    amount_classes: amountClasses(widest('amount'), widest('amount_compact'), widest('amount_compact', 2)),
    today_reported: earnings.has(today),
    as_of: `${WEEKDAYS[weekday(today)]} ${date.day} ${MONTHS[date.month - 1].slice(0, 3)}`,
    as_of_date: isoDate(today),
  };
}

// Every amount in a view shares one size: the largest the widest amount fits.
// Room is each view's tile text width in CSS px, measured in the framework for
// TRMNL OG landscape, OG portrait, X landscape and X portrait. Row heights cap
// the size at xxlarge on OG and xxxlarge on X.
const VALUE_SIZES = [['xsmall', 20], ['small', 26], ['base', 38], ['large', 58], ['xlarge', 74], ['xxlarge', 96], ['xxxlarge', 128]];
const VIEW_ROOM = { full: [361, 436, 481, 736], half_horizontal: [158, 191, 218, 341], half_vertical: [153, 181, 213, 331], quadrant: [153, 181, 213, 331] };
const PREFIXES = ['', 'portrait:', 'lg:', 'lg:portrait:'];
// Width in ems: Inter's tabular digits are 0.645em, separators 0.27em.
function textEms(text) { return Array.from(text).reduce((total, char) => total + (/\d/.test(char) ? 0.645 : /[.,]/.test(char) ? 0.27 : 0.7), 0); }
function amountClasses(fullEms, compactEms, quadrantEms) {
  const pick = (width, ems, cap) => (VALUE_SIZES.filter(([, size]) => size <= cap && ems * size * 1.03 <= width).pop() || VALUE_SIZES[0])[0];
  return Object.fromEntries(Object.entries(VIEW_ROOM).map(([view, room]) => {
    // The quadrant shows only today and yesterday.
    const ems = view === 'full' ? fullEms : view === 'quadrant' ? quadrantEms : compactEms;
    return [view, room.map((width, index) => `${PREFIXES[index]}value--${pick(width, ems, index < 2 ? 96 : 128)}`).join(' ')];
  }));
}

// Sentences for the views: a full line for wide tiles and a delta for narrow ones.
function comparison(tile, style, todayReported) {
  if (tile.key === 'today') return { comparison: todayReported ? 'Estimated so far' : 'No earnings reported yet', comparison_short: todayReported ? 'So far' : 'None yet' };
  if (tile.direction === 'none') return { comparison: `No data for ${tile.compare_label}`, comparison_short: 'No comparison' };
  const change = style === 'amount' ? tile.delta_amount : style === 'both' ? `${tile.delta_percent} (${tile.delta_amount})` : tile.delta_percent;
  return { comparison: `${change} vs ${tile.compare_label}`, comparison_short: style === 'amount' ? tile.delta_amount : tile.delta_percent };
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
function weekday(day) { return new Date(day * DAY).getUTCDay(); }
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
  const units = Math.round(Math.abs(micros) / 10 ** (6 - decimals));
  const whole = String(Math.floor(units / 10 ** decimals));
  const fraction = decimals ? `.${String(units % 10 ** decimals).padStart(decimals, '0')}` : '';
  return `${micros < 0 && units ? '-' : ''}${prefixFor(currency)}${grouped(whole)}${fraction}`;
}

// Narrow views abbreviate large amounts: $12.3K, ¥38.4M. Smaller ones stay exact.
function compactMoney(micros, currency) {
  const value = Math.abs(micros) / 1e6;
  const exact = formatMoney(micros, currency);
  if (value < 10000) return exact;
  const [divisor, suffix] = value >= 1e9 ? [1e9, 'B'] : value >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  const scaled = value / divisor;
  const text = scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
  return `${micros < 0 ? '-' : ''}${prefixFor(currency)}${text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text}${suffix}`;
}

function delta(amount, compare, currency) {
  const difference = amount - compare;
  const sign = difference > 0 ? '+' : difference < 0 ? '-' : '';
  const deltaAmount = `${sign}${formatMoney(Math.abs(difference), currency)}`;
  if (compare === 0) return { delta_percent: amount === 0 ? '0%' : 'New', delta_amount: deltaAmount, direction: amount === 0 ? 'flat' : 'up' };
  const percent = difference / Math.abs(compare) * 100;
  const rounded = Math.abs(percent) >= 100 ? Math.round(Math.abs(percent)).toString() : Math.abs(percent).toFixed(1);
  if (Number(rounded) === 0) return { delta_percent: '0%', delta_amount: deltaAmount, direction: 'flat' };
  return { delta_percent: `${sign}${rounded}%`, delta_amount: deltaAmount, direction: percent > 0 ? 'up' : 'down' };
}
