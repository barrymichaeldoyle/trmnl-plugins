import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import { loadPlugin, exportFiles, renderView, checkPlugin, views, screenHtml, previewDevice, settingsLimit } from '../src/plugin.js';

const plugin = await loadPlugin(fileURLToPath(new URL('../../../apps/bible-verses', import.meta.url)));

test('TRMNL ZIP is flat, polls the published collection, and renders identically after an import round trip', async () => {
  const files = exportFiles(plugin);
  const archive = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
  const imported = Object.fromEntries(Object.entries(unzipSync(archive)).map(([name, bytes]) => [name, strFromU8(bytes)]));
  assert.deepEqual(Object.keys(imported).sort(), ['settings.yml', 'transform.js', ...views.map(v => `${v}.liquid`)].sort());
  const settings = YAML.parse(imported['settings.yml']);
  assert.equal(settings.strategy, 'polling');
  assert.equal(settings.static_data, '');
  for (const name of ['settings.yml', 'transform.js']) assert.ok(Buffer.byteLength(imported[name]) <= settingsLimit, name);
  // Scripture is fetched, not shipped: no passage text travels in the recipe.
  for (const name of Object.keys(imported)) assert.ok(!imported[name].includes(plugin.collections.web.verses[0].text), name);
  const reloaded = { ...plugin, settings, transform: imported['transform.js'], templates: Object.fromEntries(views.map(v => [v, imported[`${v}.liquid`]])) };
  for (const language of Object.keys(plugin.collections)) {
    const options = { timestamp: 1790848800, refreshMinutes: 60, fields: { language, theme: ['family', 'work'] } };
    for (const view of views) assert.equal(await renderView(reloaded, view, options), await renderView(plugin, view, options));
  }
});

test('Daily Bread source matches its export, so TRMNL\'s Import from GitHub is safe', async () => {
  // GitHub Sync imports src/ as-is (shared.liquid stays separate). After a content
  // change, upload with pnpm upload and pull the sync commit to restore the match.
  const files = exportFiles(plugin);
  const source = name => readFile(join(plugin.root, 'src', name), 'utf8');
  assert.equal(await source('transform.js'), files['transform.js'], 'src/transform.js differs from the export');
  assert.deepEqual(YAML.parse(await source('settings.yml')), YAML.parse(files['settings.yml']), 'src/settings.yml differs from the export');
});

test('exports fail before upload when settings.yml would exceed TRMNL\'s limit', () => {
  const data = { verses: Array.from({ length: 400 }, (_, index) => ({ id: `v${index}`, text: 'x'.repeat(300) })) };
  assert.throws(() => exportFiles({ ...plugin, settings: { ...plugin.settings, strategy: 'static' }, data }), /settings\.yml is \d+ KB; TRMNL rejects files over 100 KB/);
});

test('checks reject custom markup styles and invalid views', async () => {
  await assert.rejects(checkPlugin({ ...plugin, templates: { ...plugin.templates, full: '<style>p{color:red}</style>' } }), /framework/);
  await assert.rejects(renderView(plugin, 'unknown'), /Unknown view/);
});

test('the plugin passes checks without any style allowance', async () => {
  await checkPlugin(plugin);
  await checkPlugin({ ...plugin, config: { ...plugin.config, allowed_style_blocks: [] } });
  for (const template of Object.values(plugin.templates)) assert.ok(!/<style\b|\sstyle\s*=/.test(template));
});

test('device previews use the framework profile, density, bit depth and orientation', () => {
  const device = previewDevice('v2', true);
  assert.equal(device.width, 780);
  assert.equal(device.height, 1040);
  assert.equal(device.ratio, 1.8);
  const html = screenHtml('<p>Scripture</p>', 'quadrant', '3.4.0', true, { model: 'v2', portrait: true });
  assert.match(html, /screen--v2 screen--lg screen--density-2x screen--4bit screen--portrait/);
  assert.match(html, /mashup--2x2/);
  assert.throws(() => previewDevice('invalid'), /Unknown device/);
});
