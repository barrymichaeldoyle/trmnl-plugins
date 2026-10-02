import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadPlugin, renderView, views, escapeHtml, runTransform, contextFor } from '../../../packages/plugin-tools/src/plugin.js';

const plugin = await loadPlugin(fileURLToPath(new URL('..', import.meta.url)));
const epoch = value => Date.parse(value) / 1000;
const id = html => html.match(/data-verse-id="([^"]+)"/)?.[1];
const render = options => renderView(plugin, 'full', options);

test('daily changes at local midnight, including positive, negative and fractional offsets', async () => {
  for (const utcOffset of [7200, -18000, 20700, 50400, -43200]) {
    const boundary = epoch('2026-10-02T00:00:00Z') - utcOffset;
    const before = id(await render({ timestamp: boundary - 1, utcOffset }));
    const after = id(await render({ timestamp: boundary, utcOffset }));
    assert.notEqual(before, after);
    assert.equal(after, id(await render({ timestamp: boundary + 86399, utcOffset })));
  }
});

test('all offered intervals remain stable inside their local slot and change at the boundary', async () => {
  for (const [rotation, seconds] of Object.entries({ daily: 86400, twelve_hours: 43200, six_hours: 21600, hourly: 3600 })) {
    const timestamp = epoch('2026-10-01T00:00:00Z');
    const options = { fields: { rotation }, utcOffset: 0 };
    assert.equal(id(await render({ ...options, timestamp })), id(await render({ ...options, timestamp: timestamp + seconds - 1 })));
    assert.notEqual(id(await render({ ...options, timestamp })), id(await render({ ...options, timestamp: timestamp + seconds })));
  }
});

test('the transform changes the image marker only at each local rotation boundary and preserves Scripture', () => {
  for (const [rotation, seconds] of Object.entries({ daily: 86400, twelve_hours: 43200, six_hours: 21600, hourly: 3600 })) {
    for (const utcOffset of [7200, -18000, 20700]) {
      const boundary = epoch('2026-10-02T00:00:00Z') - utcOffset;
      const transformed = timestamp => runTransform(plugin, contextFor(plugin, { timestamp, utcOffset, fields: { rotation } }));
      const before = transformed(boundary - 1);
      const after = transformed(boundary);
      assert.equal(after.rotation_slot, before.rotation_slot + 1);
      assert.equal(after.rotation_slot, transformed(boundary + seconds - 1).rotation_slot);
      assert.deepEqual(JSON.parse(JSON.stringify(after.verses)), plugin.data.verses);
      assert.equal(after.trmnl, undefined);
    }
  }
});

test('mixed rotation covers the full collection once, with a different theme each interval', async () => {
  const ids = [];
  let previousTheme;
  for (let slot = 0; slot < plugin.data.verses.length; slot++) {
    const html = await render({ timestamp: slot * 86400, utcOffset: 0 });
    const selected = plugin.data.verses.find(verse => verse.id === id(html));
    assert.ok(selected);
    assert.notEqual(selected.theme, previousTheme);
    previousTheme = selected.theme;
    ids.push(selected.id);
  }
  assert.equal(new Set(ids).size, plugin.data.verses.length);
  assert.equal(id(await render({ timestamp: plugin.data.verses.length * 86400, utcOffset: 0 })), ids[0]);
});

test('each theme visits its entire curated collection without repeats', async () => {
  for (const { id: theme } of plugin.data.themes) {
    const expected = plugin.data.verses.filter(verse => verse.theme === theme);
    const seen = new Set();
    for (let slot = 0; slot < expected.length; slot++) {
      const html = await render({ timestamp: slot * 86400, utcOffset: 0, fields: { theme: [theme] } });
      const selected = plugin.data.verses.find(verse => verse.id === id(html));
      assert.equal(selected.theme, theme);
      seen.add(selected.id);
    }
    assert.deepEqual([...seen].sort(), expected.map(verse => verse.id).sort());
  }
});

test('all views show the same complete passage for every slot, including the longest text', async () => {
  for (let slot = 0; slot < plugin.data.verses.length; slot++) {
    const verse = plugin.data.verses[slot];
    for (const view of views) {
      const html = await renderView(plugin, view, { timestamp: slot * 86400, utcOffset: 0 });
      assert.equal(id(html), verse.id);
      assert.ok(html.includes(escapeHtml(verse.text)), `${view} must preserve the entire ${verse.reference} passage`);
      assert.ok(html.includes(escapeHtml(verse.reference)));
    }
  }
});

test('unknown settings use the mixed daily defaults; missing data gives a useful recovery message', async () => {
  const options = { timestamp: epoch('2026-10-01T10:00:00Z'), utcOffset: 0 };
  assert.equal(id(await render(options)), id(await render({ ...options, fields: { theme: 'old-theme', rotation: 'invalid' } })));
  for (const view of views) {
    const html = await renderView(plugin, view, { data: { verses: [] } });
    assert.match(html, /[Rr]eimport/);
    assert.equal(id(html), undefined);
  }
});

test('the library has unique references and publisher provenance, and contains no footnotes or navigation text', () => {
  const { verses, provenance } = plugin.data;
  assert.equal(verses.length, 108);
  assert.equal(new Set(verses.map(v => v.reference)).size, verses.length);
  assert.match(provenance.archive_sha256, /^[a-f0-9]{64}$/);
  for (const verse of verses) {
    assert.match(verse.source, /^https:\/\/ebible.org\/engwebp\/[A-Z0-9]+\.htm#V\d+$/);
    assert.ok(verse.text.length > 15);
    assert.doesNotMatch(verse.text, /Frequently Asked|Public Domain|Greek|\bNU\b|\bTR\b|[†<>]/);
  }
});

test('several accepted themes form a balanced, repeat-free cycle in every view', async () => {
  for (const accepted of [['family', 'work'], ['money', 'rest', 'faith']]) {
    const expected = plugin.data.verses.filter(verse => accepted.includes(verse.theme));
    const seen = new Set();
    let previous;
    for (let slot = 0; slot < expected.length; slot++) {
      const options = { timestamp: slot * 86400, utcOffset: 0, fields: { theme: accepted } };
      const html = await render(options);
      const verse = plugin.data.verses.find(verse => verse.id === id(html));
      assert.ok(accepted.includes(verse.theme));
      assert.notEqual(verse.theme, previous);
      previous = verse.theme;
      seen.add(verse.id);
      for (const view of views) assert.equal(id(await renderView(plugin, view, options)), verse.id);
    }
    assert.deepEqual([...seen].sort(), expected.map(verse => verse.id).sort());
    assert.equal(id(await render({ timestamp: expected.length * 86400, utcOffset: 0, fields: { theme: accepted } })), expected[0].id);
  }
});

test('theme selection handles blank, legacy, duplicate and reordered values without broadening valid choices', async () => {
  const options = { timestamp: 1790848800, utcOffset: 20700, fields: { rotation: 'six_hours' } };
  const select = theme => render({ ...options, fields: { ...options.fields, theme } });
  for (const theme of [undefined, null, '', [], [''], 'all', ['all'], 'unknown', [false, 123, {}]]) {
    assert.equal(id(await select(theme)), id(await select('all')));
  }
  const pair = id(await select(['family', 'work']));
  for (const theme of [['work', 'family'], ['family', 'family', 'work'], ['all', 'family', 'work'], ['unknown', 'family', 'work'], ' family, work ', ['family,work']]) {
    assert.equal(id(await select(theme)), pair);
    const pool = runTransform(plugin, contextFor(plugin, { fields: { theme } })).reading_pool;
    assert.equal(pool.length, 24);
    assert.ok(pool.every(verse => ['family', 'work'].includes(verse.theme)));
  }
  for (const [old, current] of Object.entries({peace:'rest',hope:'hardship',strength:'hardship',trust:'faith',wisdom:'decisions',love:'relationships',prayer:'faith'})) {
    assert.equal(id(await select(old)), id(await select([current])));
  }
});
