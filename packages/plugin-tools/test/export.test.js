import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import { loadPlugin, exportFiles, renderView, checkPlugin, views, screenHtml, previewDevice } from '../src/plugin.js';

const plugin = await loadPlugin(fileURLToPath(new URL('../../../apps/bible-verses', import.meta.url)));

test('TRMNL ZIP is flat, self-contained, and renders identically after an import round trip', async () => {
  const files = exportFiles(plugin);
  const archive = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
  const imported = Object.fromEntries(Object.entries(unzipSync(archive)).map(([name, bytes]) => [name, strFromU8(bytes)]));
  assert.deepEqual(Object.keys(imported).sort(), ['settings.yml', 'transform.js', ...views.map(v => `${v}.liquid`)].sort());
  const settings = YAML.parse(imported['settings.yml']);
  assert.equal(settings.strategy, 'static');
  assert.deepEqual(JSON.parse(settings.static_data), plugin.data);
  const reloaded = { ...plugin, settings, data: JSON.parse(settings.static_data), transform: imported['transform.js'], templates: Object.fromEntries(views.map(v => [v, imported[`${v}.liquid`]])) };
  for (const language of ['en', ...Object.keys(plugin.data.translations ?? {})]) {
    const options = { timestamp: 1790848800, fields: { language, theme: ['family', 'work'], rotation: 'hourly' } };
    for (const view of views) assert.equal(await renderView(reloaded, view, options), await renderView(plugin, view, options));
  }
});

test('checks reject custom markup styles and invalid views', async () => {
  await assert.rejects(checkPlugin({ ...plugin, templates: { ...plugin.templates, full: '<style>p{color:red}</style>' } }), /framework/);
  await assert.rejects(renderView(plugin, 'unknown'), /Unknown view/);
});

test('the wraparound style exception must be explicitly declared', async () => {
  await checkPlugin(plugin);
  await assert.rejects(checkPlugin({ ...plugin, config: { ...plugin.config, allowed_style_blocks: [] } }), /framework/);
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
