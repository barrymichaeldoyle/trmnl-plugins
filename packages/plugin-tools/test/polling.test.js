import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { loadPlugin, polledData, renderPolling, checkPlugin, checkPolling, previewTiming, exportFiles } from '../src/plugin.js';
import { reviewScenarios, reviewOptions } from '../src/review.js';

const plugin = await loadPlugin(fileURLToPath(new URL('../../../apps/admob-earnings', import.meta.url)));
const withSettings = changes => ({ ...plugin, settings: { ...plugin.settings, ...changes } });

test('polled data matches TRMNL: arrays wrap as data, several URLs become IDX_n', () => {
  assert.deepEqual(polledData([[1, 2]]), { data: [1, 2] });
  assert.deepEqual(polledData([{ a: 1 }]), { a: 1 });
  assert.deepEqual(polledData([{ a: 1 }, [2]]), { IDX_0: { a: 1 }, IDX_1: { data: [2] } });
  assert.deepEqual(Object.keys(plugin.fixtures.usd), ['data']);
  assert.equal(plugin.data.data.length, plugin.fixtures.usd.data.length);
});

test('polling settings render with field values, the OAuth token and both header formats', async () => {
  const request = await renderPolling(withSettings({ polling_url: 'https://a.test/{{ publisher_id }}\nhttps://b.test', polling_headers: 'x-one=1&authorization=Bearer {{ oauth_access_token }}' }), { fields: { publisher_id: 'p' }, accessToken: 't' });
  assert.deepEqual(request.urls, ['https://a.test/p', 'https://b.test']);
  assert.deepEqual(request.headers, { 'x-one': '1', authorization: 'Bearer t' });
  assert.deepEqual((await renderPolling(withSettings({ polling_headers: '{"x-two":"{{ oauth_token_type }}"}' }))).headers, { 'x-two': 'Bearer' });
});

test('polling checks reject insecure URLs, broken JSON bodies and committed OAuth credentials', async () => {
  await checkPolling(plugin);
  await assert.rejects(checkPolling(withSettings({ polling_url: 'http://insecure.test' })), /HTTPS/);
  await assert.rejects(checkPolling(withSettings({ polling_body: '{"broken": }' })), /valid JSON/);
  await assert.rejects(checkPolling(withSettings({ oauth_client_secret: 'x' })), /credentials/);
  await assert.rejects(checkPolling(withSettings({ oauth_scopes: '' })), /oauth_scopes/);
  await assert.rejects(checkPlugin(withSettings({ strategy: 'webhook' })), /static and polling/);
});

test('fixtures preview at the moment they were recorded', () => {
  assert.equal(previewTiming(plugin, 'eur-month-start').timestamp, Date.parse('2026-10-01T09:00:00Z') / 1000);
  assert.equal(previewTiming(plugin, 'default').timestamp, Date.parse(plugin.config.fixtures[plugin.config.preview.fixture].time) / 1000);
});

test('declared review cases select suites, fixtures, fields and expected text', () => {
  const responsive = reviewScenarios(plugin, 'responsive');
  const curated = reviewScenarios(plugin, 'curated');
  assert.ok(responsive.length < curated.length);
  assert.equal(reviewScenarios(plugin, 'passages').length, plugin.config.review.cases.length);
  const yen = curated.find(scenario => scenario.id === 'jpy-both');
  assert.equal(yen.options.fields.comparison_style, 'both');
  assert.equal(yen.options.fields.publisher_id, plugin.config.preview.fields.publisher_id);
  assert.equal(yen.options.timestamp, Date.parse('2026-10-08T15:00:00Z') / 1000);
  assert.ok(yen.expectTextByView.full.includes('¥36,342,382'));
  assert.equal(reviewOptions(plugin, yen, { model: 'og', portrait: false }).data, plugin.fixtures.jpy);
  assert.throws(() => reviewScenarios({ ...plugin, config: { ...plugin.config, review: { cases: [{ id: 'x', fixture: 'missing' }] } } }, 'curated'), /unknown fixture/);
});

test('encrypted settings kept outside src/ survive the blanks GitHub Sync writes', async () => {
  // GitHub Sync writes the encrypted polling settings as empty values.
  assert.equal(YAML.parse(await readFile(join(plugin.root, 'src/settings.yml'), 'utf8')).polling_body, '');
  assert.match(plugin.settings.polling_body, /reportSpec/);
  assert.match(plugin.settings.polling_headers, /oauth_access_token/);
  const exported = YAML.parse(exportFiles(plugin)['settings.yml']);
  assert.match(exported.polling_body, /reportSpec/);
  assert.match(exported.polling_headers, /oauth_access_token/);
});
