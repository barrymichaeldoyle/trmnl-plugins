// What every push shares: the payload envelope, its size and hash, and the
// sliding-hour budget TRMNL enforces per webhook.

export const LIMITS = { standard: { pushes: 12, bytes: 5000 }, plus: { pushes: 30, bytes: 10000 } };
export const WEBHOOK_BASE = 'https://trmnl.com/api/custom_plugins/';
const HOUR = 60 * 60 * 1000;

// Accepts the webhook URL TRMNL shows, or just its UUID.
export function webhookId(value) {
  const match = String(value ?? '').trim().match(/(?:custom_plugins\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i);
  return match ? match[1].toLowerCase() : null;
}

// Keys in a fixed order so equal data always hashes the same.
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

// FNV-1a, 32 bits: enough to notice that a screen's data changed.
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const byteLength = text => new TextEncoder().encode(text).length;

// The request body TRMNL expects. The screen key picks the layout in the
// recipe; updated is the vault's local time of this push.
export function envelope(type, vault, updated, data) {
  return { merge_variables: { screen: type, vault, updated, ...data } };
}

// Collectors cap their own output; this enforces the byte limit by asking the
// screen to shrink until the serialized body fits. It never cuts mid-string.
export function fit(build, data, shrink, maxBytes) {
  let current = data;
  for (let attempt = 0; attempt < 500; attempt++) {
    const body = JSON.stringify(build(current));
    const bytes = byteLength(body);
    if (bytes <= maxBytes) return { data: current, body, bytes };
    const smaller = shrink?.(current);
    if (!smaller) break;
    current = smaller;
  }
  throw new Error(`The payload is still over ${maxBytes} bytes after trimming.`);
}

export function recent(times, now) {
  return (times ?? []).filter(time => time > now - HOUR && time <= now);
}

export function remaining(times, now, limit) {
  return Math.max(0, limit - recent(times, now).length);
}

// When the oldest push in the window ages out, a slot opens.
export function nextSlot(times, now, limit) {
  const window = recent(times, now).sort((a, b) => a - b);
  return window.length < limit ? now : window[window.length - limit] + HOUR;
}
