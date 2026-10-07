import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { loadPlugin, renderView, views, escapeHtml } from '../../../packages/plugin-tools/src/plugin.js';

const plugin = await loadPlugin(fileURLToPath(new URL('..', import.meta.url)));

test('TRMNL select controls submit the language, theme and rotation identifiers', () => {
  const fields = plugin.settings.custom_fields;
  for (const keyname of ['language', 'theme', 'rotation']) {
    const field = fields.find(field => field.keyname === keyname);
    const values = field.options.map(option => {
      assert.equal(typeof option, 'object', `${keyname} options must be YAML label/value mappings`);
      assert.equal(Object.keys(option).length, 1);
      return Object.values(option)[0];
    });
    if (field.default) assert.ok(values.includes(field.default), `${keyname} default must be selectable`);
    if (keyname === 'language') assert.deepEqual(values, ['en', 'fr', 'es']);
    if (keyname === 'theme') assert.deepEqual(values, plugin.data.themes.map(theme => theme.id));
    if (keyname === 'rotation') assert.deepEqual(values, ['daily', 'twelve_hours', 'six_hours', 'hourly']);
  }
});

test('each language covers the same curated cycle with localized references and independent provenance', () => {
  assert.equal(plugin.defaults.language, 'en');
  assert.deepEqual(Object.keys(plugin.data.translations).sort(), ['es', 'fr']);
  for (const [language, collection] of Object.entries(plugin.data.translations)) {
    assert.equal(collection.translation.language, language);
    assert.equal(collection.translation.license, 'Public domain');
    assert.match(collection.provenance.archive_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(collection.verses.map(v => v.id), plugin.data.verses.map(v => v.id));
    assert.deepEqual(collection.verses.map(v => v.theme), plugin.data.verses.map(v => v.theme));
    assert.equal(new Set(collection.verses.map(v => v.reference)).size, collection.verses.length);
    for (const verse of collection.verses) {
      assert.ok(verse.source.startsWith(collection.translation.source));
      assert.ok(verse.text.length > 15);
      assert.doesNotMatch(verse.text, /Public Domain|Copyright|LIVRE|[<>†]/);
    }
  }
});

test('every translated passage remains complete in every view, with the correct attribution', async () => {
  for (const [language, collection] of Object.entries(plugin.data.translations)) {
    for (let slot = 0; slot < collection.verses.length; slot++) {
      const verse = collection.verses[slot];
      for (const view of views) {
        const html = await renderView(plugin, view, { timestamp: slot * 86400, utcOffset: 0, fields: { language } });
        assert.ok(html.includes(escapeHtml(verse.text)), `${language} ${view} ${verse.reference}`);
        assert.ok(html.includes(escapeHtml(verse.reference)));
        assert.ok(html.includes(collection.translation.abbreviation));
        assert.ok(!html.includes(' · WEB'));
        assert.ok(html.includes(`lang="${language}" translate="no"`));
      }
    }
  }
});

test('French Psalm numbering follows the source while preserving the equivalent selected passage', () => {
  const french = plugin.data.translations.fr.verses;
  const verse = french.find(v => v.id === 'psa-42-11');
  assert.equal(verse.reference, 'Psaumes 42:12');
  assert.ok(verse.source.endsWith('PSA042.htm#V12'));
  assert.ok(verse.text.startsWith('Pourquoi t’abats-tu, mon âme'));
  const comfort = french.find(v => v.id === 'psa-34-17-18');
  assert.equal(comfort.reference, 'Psaumes 34:18–19');
  assert.ok(comfort.text.startsWith('Quand les justes crient'));
  const burden = french.find(v => v.id === 'psa-55-22');
  assert.equal(burden.reference, 'Psaumes 55:23');
  assert.ok(burden.source.endsWith('PSA055.htm#V23'));
  assert.ok(burden.text.startsWith('Remets ton sort à l’Éternel'));
  const spanish = plugin.data.translations.es.verses.find(v => v.id === burden.id);
  assert.equal(spanish.reference, 'Salmos 55:22');
  assert.ok(spanish.text.startsWith('Echa sobre Jehová tu carga'));
});

test('language changes preserve theme and local rotation, and unknown languages use English', async () => {
  const options = { timestamp: 1790848800, utcOffset: 7200, fields: { theme: ['family', 'work', 'faith'], rotation: 'hourly' } };
  const english = await renderView(plugin, 'full', options);
  const id = html => html.match(/data-verse-id="([^"]+)"/)?.[1];
  assert.equal(await renderView(plugin, 'full', { ...options, fields: { ...options.fields, language: 'unknown' } }), english);
  for (const language of ['fr', 'es']) {
    const translated = await renderView(plugin, 'full', { ...options, fields: { ...options.fields, language } });
    assert.equal(id(translated), id(english));
    const selected = plugin.data.translations[language].verses.find(v => v.id === id(translated));
    assert.ok(options.fields.theme.includes(selected.theme));
  }
});

test('the editorial list matches the imported passages and keeps its notes out of recipe data', async () => {
  const selection = JSON.parse(await readFile(new URL('../content/selection.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(selection).length, 9);
  const ids = [];
  for (const [theme, entries] of Object.entries(selection)) {
    assert.equal(entries.length, 12);
    for (const entry of entries) {
      assert.ok(entry.tags.length > 0);
      assert.ok(entry.note.length > 20);
      const id = entry.reference.toLowerCase().replace(' ', '-').replace(':', '-');
      ids.push(id);
      const passage = plugin.data.verses.find(verse => verse.id === id);
      assert.equal(passage?.theme, theme);
      assert.equal(passage?.note, undefined);
      assert.equal(passage?.tags, undefined);
    }
  }
  assert.equal(new Set(ids).size, 108);
});

test('a missing selected collection shows recovery text without silently displaying another translation', async () => {
  const data = structuredClone(plugin.data);
  data.translations.fr.verses = [];
  const html = await renderView(plugin, 'full', { data, fields: { language: 'fr' } });
  assert.ok(html.includes('Réimportez'));
  assert.ok(!html.includes('data-verse-id='));
});

test('missing and corrupted collections recover in every view without stale Scripture or QR values', async () => {
  const corruptions = [
    collection => { delete collection.verses; },
    collection => { collection.verses = []; },
    collection => { collection.verses = {}; },
    collection => { collection.verses = [null, {}, { ...collection.verses[0], text: '' }]; },
    collection => { delete collection.themes; },
    collection => { collection.themes = []; },
    collection => { collection.themes = [null, {}]; },
    collection => { delete collection.translation; },
    collection => { collection.translation = {}; },
    collection => { collection.translation.language = 'wrong'; },
  ];
  for (const language of ['en', 'fr', 'es']) {
    for (const corrupt of corruptions) {
      const data = structuredClone(plugin.data);
      const collection = language === 'en' ? data : data.translations[language];
      corrupt(collection);
      // Merge variables may contain values from an earlier render.
      data.verse = plugin.data.verses[0];
      data.context_qr = 'stale-context-qr';
      for (const view of views) {
        const html = await renderView(plugin, view, { data, fields: { language } });
        assert.match(html, /[Rr]eimport|Réimportez|Vuelve a importar/);
        assert.ok(!html.includes('data-verse-id='), `${language} ${view} must recover`);
        assert.ok(!html.includes('data-context-url='));
        assert.ok(!html.includes('stale-context-qr'));
      }
    }
    if (language !== 'en') {
      for (const value of [undefined, null, {}]) {
        const data = structuredClone(plugin.data);
        data.translations[language] = value;
        for (const view of views) {
          const html = await renderView(plugin, view, { data, fields: { language } });
          assert.match(html, /[Rr]eimport|Réimportez|Vuelve a importar/);
          assert.ok(!html.includes('data-verse-id='));
        }
      }
    }
  }
});

test('invalid array entries do not prevent complete, correctly attributed passages from rendering', async () => {
  for (const language of ['en', 'fr', 'es']) {
    const data = structuredClone(plugin.data);
    const collection = language === 'en' ? data : data.translations[language];
    const verse = collection.verses[0];
    collection.verses = [null, {}, { ...verse, source: '' }, verse];
    collection.themes = [null, {}, ...collection.themes];
    for (const view of views) {
      const html = await renderView(plugin, view, { data, fields: { language } });
      assert.ok(html.includes(escapeHtml(verse.text)));
      assert.ok(html.includes(collection.translation.abbreviation));
      assert.ok(html.includes(`lang="${language}"`));
    }
  }
});


test('fresh and blank preferences use English, all themes, daily rotation, QR on and light appearance in every layout', async () => {
  assert.deepEqual(plugin.defaults, { language: 'en', rotation: 'daily', show_context_qr: true, appearance: 'light' });
  const options = { timestamp: 1790848800, utcOffset: 0 };
  for (const view of views) {
    const initial = await renderView(plugin, view, options);
    const blank = await renderView(plugin, view, { ...options, fields: { language: '', theme: [], rotation: null, show_context_qr: null, appearance: null } });
    assert.equal(blank, initial);
    assert.ok(initial.includes('data-appearance="light"'));
    assert.ok(!initial.includes('inverse bg--canvas"'));
    assert.ok(initial.includes('data-context-url='));
    assert.ok(initial.includes('data-reading-cross="true"'));
    const withoutQr = await renderView(plugin, view, { ...options, fields: { show_context_qr: false } });
    assert.ok(!withoutQr.includes('data-context-url='));
    assert.ok(withoutQr.includes('data-reading-cross="true"'));
  }
});

test('dark appearance inverts this plugin\'s content and artwork but keeps the QR tile white', async () => {
  const options = { timestamp: 1790848800, utcOffset: 0 };
  for (const view of views) {
    const light = await renderView(plugin, view, options);
    const dark = await renderView(plugin, view, { ...options, fields: { appearance: 'dark' } });
    assert.ok(dark.includes('class="layout layout--col layout--top inverse bg--canvas" data-appearance="dark"'));
    assert.ok(dark.includes('class="title_bar inverse bg--canvas" data-appearance="dark"'));
    assert.ok(dark.includes('bg--white'));
    const crossOf = html => html.match(/src="(data:image\/svg\+xml;base64,[^"]+)"[^>]*data-reading-cross/)[1];
    assert.notEqual(crossOf(dark), crossOf(light));
    assert.ok(Buffer.from(crossOf(dark).split(',')[1], 'base64').toString().includes('fill="white" stroke="white"'));
  }
});
