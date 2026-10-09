import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { loadPlugin, renderPolling, checkPlugin, renderView, exportFiles, previewTiming, views } from '@trmnl/plugin-tools';

const plugin = await loadPlugin(fileURLToPath(new URL('..', import.meta.url)));

// Liquid's "now" reads the clock, so freeze it the way a poll at that moment would see it.
async function pollAt(time, fields) {
  test.mock.timers.enable({ apis: ['Date'], now: Date.parse(time) });
  try { return await renderPolling(plugin, { fields, accessToken: 'token-123' }); }
  finally { test.mock.timers.reset(); }
}

test('the polling request is a well-formed AdMob network report call', async () => {
  const request = await pollAt('2026-10-08T15:00:00Z', { publisher_id: 'pub-1234567890123456' });
  assert.equal(request.verb, 'POST');
  assert.deepEqual(request.urls, ['https://admob.googleapis.com/v1/accounts/pub-1234567890123456/networkReport:generate']);
  assert.deepEqual(request.headers, { authorization: 'Bearer token-123', 'content-type': 'application/json' });
  const { reportSpec } = JSON.parse(request.body);
  assert.deepEqual(reportSpec.dateRange, { startDate: { year: 2026, month: 7, day: 7 }, endDate: { year: 2026, month: 10, day: 9 } });
  assert.deepEqual(reportSpec.dimensions, ['DATE']);
  assert.deepEqual(reportSpec.metrics, ['ESTIMATED_EARNINGS', 'AD_REQUESTS', 'IMPRESSIONS', 'CLICKS']);
  assert.ok(reportSpec.maxReportRows >= 95);
});

test('the requested window always covers the month before last', async () => {
  // Worst cases: the last day of a 31-day month after two 31-day months, a year boundary, a leap day.
  for (const time of ['2026-08-31T23:59:00Z', '2026-12-31T23:59:00Z', '2027-01-31T00:00:00Z', '2028-03-01T00:00:00Z', '2026-10-31T12:00:00Z']) {
    const { dateRange } = JSON.parse((await pollAt(time, { publisher_id: 'pub-1' })).body).reportSpec;
    const start = Date.UTC(dateRange.startDate.year, dateRange.startDate.month - 1, dateRange.startDate.day);
    // East of UTC the account's day can be one ahead of the UTC date.
    const latestToday = new Date(Date.parse(time) + 86400000);
    const monthBeforeLast = Date.UTC(latestToday.getUTCFullYear(), latestToday.getUTCMonth() - 2, 1);
    assert.ok(start <= monthBeforeLast, time);
    const end = Date.UTC(dateRange.endDate.year, dateRange.endDate.month - 1, dateRange.endDate.day);
    assert.ok(end >= latestToday.setUTCHours(0, 0, 0, 0), time);
  }
});

test('recorded fixtures match the request the recipe sends at their recording time', async () => {
  for (const [name, entry] of Object.entries(plugin.config.fixtures)) {
    const header = plugin.fixtures[name].data?.find(element => element.header)?.header;
    if (!header) continue;
    const { dateRange } = JSON.parse((await pollAt(entry.time, { publisher_id: 'pub-1' })).body).reportSpec;
    assert.deepEqual(header.dateRange, dateRange, name);
  }
});

test('settings use Google OAuth with the read-only scope and keep credentials out', () => {
  const { settings } = plugin;
  assert.equal(settings.strategy, 'polling');
  assert.equal(settings.oauth_enabled, 'true');
  assert.equal(settings.oauth_scopes, 'https://www.googleapis.com/auth/admob.report');
  assert.deepEqual(JSON.parse(settings.oauth_auth_params), { access_type: 'offline', prompt: 'consent' });
  assert.ok(!/client_(id|secret)|GOCSPX|apps\.googleusercontent/.test(YAML.stringify(settings)));
  const picker = settings.custom_fields.find(field => field.keyname === 'publisher_id');
  assert.equal(picker.field_type, 'xhrSelect');
  // Required would block saving the OAuth client before Google is connected.
  assert.equal(picker.optional, true);
  assert.equal(picker.remote.url, 'https://admob.googleapis.com/v1/accounts');
  assert.equal(picker.remote.headers.Authorization, 'Bearer {{ oauth_access_token }}');
});

test('every fixture renders all four views with framework markup only', async () => {
  await checkPlugin(plugin);
  for (const [name, data] of Object.entries(plugin.fixtures)) {
    for (const view of views) {
      const html = await renderView(plugin, view, { data, ...previewTiming(plugin, name) });
      assert.match(html, /class="title_bar/, `${name} ${view}`);
      assert.ok(!/<style\b|\sstyle\s*=/.test(html), `${name} ${view}`);
    }
  }
  const full = await renderView(plugin, 'full', { data: plugin.fixtures.usd, ...previewTiming(plugin, 'usd') });
  for (const text of ['Today so far', '$18.20', '$47.77', '$337.20', '$1,365.65', '+6%', 'vs the same day last week', '12,958 requests', '34,054 requests', 'Updated 08:00']) assert.ok(full.includes(text), text);
  const noCurrency = structuredClone(plugin.fixtures.usd);
  delete noCurrency.data[0].header.localizationSettings;
  const bare = await renderView(plugin, 'full', { data: noCurrency, ...previewTiming(plugin, 'usd') });
  assert.ok(bare.includes('<span class="instance">Updated 08:00</span>') && bare.includes('1,365.65') && !bare.includes('$'));
  const auth = await renderView(plugin, 'quadrant', { data: plugin.fixtures.unauthenticated, ...previewTiming(plugin, 'unauthenticated') });
  assert.ok(auth.includes('Connect Google again'));
  const dark = await renderView(plugin, 'half_vertical', { data: plugin.fixtures.usd, fields: { appearance: 'dark' }, ...previewTiming(plugin, 'usd') });
  assert.ok(dark.includes('inverse bg--canvas'));
});

test('the import ZIP carries polling settings, not static data', () => {
  const files = exportFiles(plugin);
  assert.deepEqual(Object.keys(files).sort(), ['settings.yml', 'transform.js', ...views.map(view => `${view}.liquid`)].sort());
  const settings = YAML.parse(files['settings.yml']);
  assert.ok(!settings.static_data, 'polling recipes carry no static data');
  assert.equal(settings.polling_url, plugin.settings.polling_url);
  assert.equal(settings.polling_body, plugin.settings.polling_body);
  assert.equal(files['transform.js'], plugin.transform);
});
