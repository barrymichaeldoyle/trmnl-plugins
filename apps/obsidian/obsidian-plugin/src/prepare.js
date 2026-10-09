import { envelope, fit, hash, stableStringify } from './lib/push.js';

// Collects one screen and returns the request body to send, its size, and a
// hash of the data that ignores the push time. A collector that throws still
// produces a screen, so the display says what went wrong.
export async function prepare(screen, ctx, { vault, maxBytes }) {
  let data;
  let error = null;
  try { data = await screen.collect(ctx); }
  catch (caught) { error = caught; data = { status: 'error', message: 'TRMNL Screens could not read this screen from the vault.' }; }
  const updated = ctx.now.clone().locale('en').format('HH:mm');
  const result = fit(current => envelope(screen.type, vault, updated, current), data, screen.shrink, maxBytes);
  return { ...result, error, hash: hash(stableStringify({ screen: screen.type, vault, ...result.data })) };
}

// Unchanged data is skipped until the force interval passes, which only
// refreshes the "Updated" time on the display.
export function isDue({ hash: next, lastHash, lastPush = 0, now, forceMinutes, manual = false }) {
  return manual || next !== lastHash || now - lastPush >= forceMinutes * 60000;
}

// The collector context. Screens get their own options merged over defaults,
// and their own persisted state object to keep picks and history in.
export function context({ vault, moment, now = moment(), options = {}, defaults = {}, state = {}, dailyNotes = {}, dataview = null, random = Math.random }) {
  return { vault, moment, now, today: now.format('YYYY-MM-DD'), options: { ...defaults, ...options }, state, dailyNotes, dataview, random };
}
