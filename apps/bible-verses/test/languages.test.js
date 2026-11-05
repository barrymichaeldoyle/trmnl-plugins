import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPlugin, renderView, renderPolling, runTransform, contextFor, views, escapeHtml } from '../../../packages/plugin-tools/src/plugin.js';

const plugin = await loadPlugin(fileURLToPath(new URL('..', import.meta.url)));
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const catalogue = await read('../content/translations.json');
const locales = await read('../content/locales.json');
const collections = plugin.collections;
const web = collections.web;
const published = 'https://cdn.jsdelivr.net/gh/barrymichaeldoyle/trmnl-plugins@main/apps/bible-verses/content/verses/';
// Views either show the whole reference or set the book apart from the chapter
// and verses, as in "Hébreux" over "4:14–16".
const showsReference = (html, reference) => {
  const verses = reference.split(' ').at(-1);
  const book = reference.slice(0, -verses.length - 1);
  return html.includes(escapeHtml(reference)) || (html.includes(`>${escapeHtml(book)}<`) && html.includes(`>${escapeHtml(verses)}<`));
};
const id = html => html.match(/data-verse-id="([^"]+)"/)?.[1];
const recovery = language => runTransform(plugin, contextFor(plugin, { fields: { language }, data: {} })).labels;

test('the translation setting lists every catalogue entry, grouped by language, and themes stay selectable', () => {
  const fields = plugin.settings.custom_fields;
  assert.equal(fields.find(field => field.keyname === 'rotation'), undefined);
  assert.equal(plugin.settings.refresh_interval, 1440);
  assert.equal(plugin.settings.refresh_interval_floor, '60');
  const options = keyname => fields.find(field => field.keyname === keyname).options.map(option => {
    assert.equal(typeof option, 'object', `${keyname} options must be YAML label/value mappings`);
    assert.equal(Object.keys(option).length, 1);
    return Object.entries(option)[0];
  });
  const translations = options('language');
  assert.deepEqual(translations.map(([, value]) => value), catalogue.map(entry => entry.id));
  assert.deepEqual(translations.map(([label]) => label), catalogue.map(entry => `${locales[entry.language].name} · ${entry.name} (${entry.abbreviation})`));
  // Each language's translations sit together, English first.
  const order = catalogue.map(entry => entry.language).filter((language, index, all) => all.indexOf(language) === index);
  assert.equal(order[0], 'en');
  assert.deepEqual(catalogue.map(entry => entry.language), [...catalogue.map(entry => entry.language)].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  assert.equal(new Set(catalogue.flatMap(entry => [entry.id, ...(entry.aliases ?? [])])).size, catalogue.flatMap(entry => [entry.id, ...(entry.aliases ?? [])]).length);
  assert.deepEqual(options('theme').map(([, value]) => value), web.themes.map(theme => theme.id));
});

test('the polling URL fetches the selected translation\'s published collection, and earlier values still resolve', async () => {
  assert.equal(plugin.settings.strategy, 'polling');
  assert.equal(plugin.settings.static_data, '');
  assert.doesNotMatch(plugin.settings.polling_url, /\n/, 'one line: TRMNL polls each line as a separate URL');
  const url = async language => (await renderPolling(plugin, { fields: { language } })).urls;
  for (const entry of catalogue) {
    assert.deepEqual(await url(entry.id), [`${published}${entry.id}.json`]);
    for (const alias of entry.aliases ?? []) assert.deepEqual(await url(alias), [`${published}${entry.id}.json`]);
    await access(join(plugin.root, 'content/verses', `${entry.id}.json`));
  }
  for (const value of ['', undefined, 'unknown', '../web']) assert.deepEqual(await url(value), [`${published}web.json`]);
});

test('the transform knows each catalogue translation\'s language and recovery message', () => {
  for (const entry of catalogue) {
    for (const value of [entry.id, ...(entry.aliases ?? [])]) {
      const result = runTransform(plugin, contextFor(plugin, { fields: { language: value }, data: collections[entry.id] }));
      assert.equal(result.language, entry.language, value);
      assert.equal(result.translation?.id, entry.id, value);
      assert.equal(result.reading_pool.length, 108);
    }
  }
  const messages = Object.keys(locales).map(language => recovery(catalogue.find(entry => entry.language === language).id));
  assert.equal(new Set(messages.map(labels => labels.missing_text)).size, Object.keys(locales).length);
});

test('each translation covers the same curated cycle with localized references and independent provenance', () => {
  assert.equal(plugin.defaults.language, 'web');
  assert.deepEqual(Object.keys(collections), catalogue.map(entry => entry.id));
  for (const entry of catalogue) {
    const collection = collections[entry.id];
    const { archive, format, aliases, chapter_url, layout_marks, ...attribution } = entry;
    assert.deepEqual(collection.translation, attribution);
    assert.ok(collection.translation.license.trim());
    assert.equal(collection.provenance.archive, archive);
    assert.match(collection.provenance.archive_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(collection.labels, locales[entry.language].labels);
    assert.deepEqual(collection.themes, web.themes.map(theme => ({ id: theme.id, name: locales[entry.language].themes[theme.id] })));
    assert.deepEqual(collection.verses.map(v => v.id), web.verses.map(v => v.id));
    assert.deepEqual(collection.verses.map(v => v.theme), web.verses.map(v => v.theme));
    assert.equal(new Set(collection.verses.map(v => v.reference)).size, collection.verses.length);
    const sources = chapter_url ? chapter_url.split('{')[0] : entry.source;
    for (const verse of collection.verses) {
      assert.ok(verse.source.startsWith(sources), `${entry.id} ${verse.source}`);
      assert.ok(verse.text.length > 15);
      assert.doesNotMatch(verse.text, /Public Domain|Copyright|LIVRE|[<>†*¶]|\(\d+:\d+\)/);
    }
  }
});

test('every translated passage remains complete in every view, with the correct attribution', async () => {
  for (const entry of catalogue) {
    const collection = collections[entry.id];
    for (let slot = 0; slot < collection.verses.length; slot++) {
      const verse = collection.verses[slot];
      for (const view of views) {
        const html = await renderView(plugin, view, { timestamp: slot * 86400, utcOffset: 0, fields: { language: entry.id } });
        assert.equal(id(html), verse.id);
        assert.ok(html.includes(escapeHtml(verse.text)), `${entry.id} ${view} ${verse.reference}`);
        assert.ok(showsReference(html, verse.reference), `${view} must show the ${verse.reference} reference`);
        assert.ok(html.includes(escapeHtml(entry.name)));
        assert.ok(html.includes(`lang="${entry.language}" translate="no"`));
      }
    }
  }
});

test('Psalm numbering follows each source while preserving the equivalent selected passage', () => {
  const french = collections.lsg1910.verses;
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
  const passage = id => Object.fromEntries(catalogue.map(entry => [entry.id, collections[entry.id].verses.find(v => v.id === id)]));
  const cast = passage('psa-55-22');
  assert.equal(cast.rv1909.reference, 'Salmos 55:22');
  assert.ok(cast.rv1909.text.startsWith('Echa sobre Jehová tu carga'));
  assert.equal(cast.luther1912.reference, 'Psalm 55,22');
  assert.ok(cast.luther1912.text.startsWith('Wirf dein Anliegen auf den HERRN'));
  assert.ok(cast.ntbt.text.startsWith('Echa tu carga sobre Jehová'));
  assert.ok(cast.ntbt.source.endsWith('/nueva-traduccion-bibliatodo/salmos-55'));
  // The Dutch edition sets its original Psalm numbering and acrostic letters inline.
  const cry = passage('psa-34-17-18');
  assert.equal(cry.hs1917.reference, 'Psalm 34:17–18');
  assert.ok(cry.hs1917.text.startsWith('Zij roepen, en de HEERE hoort'));
  assert.ok(passage('psa-145-18-19').hs1917.text.startsWith('De HEERE is nabij allen'));
  assert.ok(passage('1pe-5-6-7').ntbt.source.endsWith('/nueva-traduccion-bibliatodo/1pedro-5'));
  assert.ok(passage('heb-13-5-6').blivre.text.endsWith('o que o ser humano poderá fazer a mim.'));
});

test('translation changes preserve theme and local rotation, and unknown values use the World English Bible', async () => {
  const options = { timestamp: 1790848800, utcOffset: 7200, refreshMinutes: 60, fields: { theme: ['family', 'work', 'faith'] } };
  const english = await renderView(plugin, 'full', options);
  for (const language of ['unknown', '', 'en']) assert.equal(await renderView(plugin, 'full', { ...options, fields: { ...options.fields, language } }), english);
  for (const entry of catalogue) {
    const translated = await renderView(plugin, 'full', { ...options, fields: { ...options.fields, language: entry.id } });
    assert.equal(id(translated), id(english));
    const selected = collections[entry.id].verses.find(v => v.id === id(translated));
    assert.ok(options.fields.theme.includes(selected.theme));
  }
});

test('the editorial list matches the imported passages and keeps its notes out of recipe data', async () => {
  const selection = await read('../content/selection.json');
  assert.equal(Object.keys(selection).length, 9);
  const ids = [];
  for (const [theme, entries] of Object.entries(selection)) {
    assert.equal(entries.length, 12);
    for (const entry of entries) {
      assert.ok(entry.tags.length > 0);
      assert.ok(entry.note.length > 20);
      const id = entry.reference.toLowerCase().replace(' ', '-').replace(':', '-');
      ids.push(id);
      const passage = web.verses.find(verse => verse.id === id);
      assert.equal(passage?.theme, theme);
      assert.equal(passage?.note, undefined);
      assert.equal(passage?.tags, undefined);
    }
  }
  assert.equal(new Set(ids).size, 108);
});

test('another translation\'s collection shows recovery rather than Scripture under the wrong attribution', async () => {
  for (const [selected, served] of [['lsg1910', 'web'], ['kjv', 'web'], ['web', 'bsb'], ['ntbt', 'rv1909']]) {
    const html = await renderView(plugin, 'full', { data: collections[served], fields: { language: selected } });
    assert.ok(html.includes(escapeHtml(recovery(selected).missing_title)));
    assert.equal(id(html), undefined);
  }
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
    collection => { collection.translation.id = 'wrong'; },
  ];
  for (const entry of catalogue) {
    const { missing_title, missing_text } = recovery(entry.id);
    for (const corrupt of [...corruptions, collection => { for (const key of Object.keys(collection)) delete collection[key]; }]) {
      const data = structuredClone(collections[entry.id]);
      corrupt(data);
      // Merge variables may contain values from an earlier render.
      data.verse = web.verses[0];
      data.context_qr = 'stale-context-qr';
      for (const view of views) {
        const html = await renderView(plugin, view, { data, fields: { language: entry.id } });
        assert.ok(html.includes(escapeHtml(missing_text)), `${entry.id} ${view}`);
        if (view === 'full') assert.ok(html.includes(escapeHtml(missing_title)));
        assert.ok(html.includes(`lang="${entry.language}"`));
        assert.ok(!html.includes('data-verse-id='), `${entry.id} ${view} must recover`);
        assert.ok(!html.includes('data-context-url='));
        assert.ok(!html.includes('stale-context-qr'));
      }
    }
  }
});

test('invalid array entries do not prevent complete, correctly attributed passages from rendering', async () => {
  for (const entry of catalogue) {
    const data = structuredClone(collections[entry.id]);
    const verse = data.verses[0];
    data.verses = [null, {}, { ...verse, source: '' }, verse];
    data.themes = [null, {}, ...data.themes];
    for (const view of views) {
      const html = await renderView(plugin, view, { data, fields: { language: entry.id } });
      assert.ok(html.includes(escapeHtml(verse.text)));
      assert.ok(html.includes(escapeHtml(entry.name)));
      assert.ok(html.includes(`lang="${entry.language}"`));
    }
  }
});

test('the About text credits every translation, with each publisher\'s required attribution', () => {
  const about = plugin.settings.custom_fields.find(field => field.keyname === 'about');
  for (const description of [about.description, about['description-fr'], about['description-es-ES']]) {
    for (const entry of catalogue) assert.ok(description.includes(entry.name), `${entry.name} credit`);
    // The NTBT licence asks for its Spanish credit with an active link to its page.
    assert.ok(description.includes('Santa Biblia, Nueva Traducción BibliaTodo (NTBT). Publicada por <a href="https://www.bibliatodo.com/ntbt/" class="underline">BibliaTodo Bible Society</a>, sello editorial de BibliaTodo LLC.'));
    assert.ok(description.includes('Copyright © Diego Santos, Mario Sérgio e Marco Teles'));
    assert.ok(description.includes('CC BY 4.0'));
  }
});

test('fresh and blank preferences use the World English Bible, all themes, daily rotation, QR on and light appearance in every layout', async () => {
  assert.deepEqual(plugin.defaults, { language: 'web', show_context_qr: true, appearance: 'light' });
  const options = { timestamp: 1790848800, utcOffset: 0 };
  for (const view of views) {
    const initial = await renderView(plugin, view, options);
    const blank = await renderView(plugin, view, { ...options, fields: { language: '', theme: [], show_context_qr: null, appearance: null } });
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

test('dark appearance inverts this plugin\'s content and artwork; the QR code carries its own white quiet zone', async () => {
  const options = { timestamp: 1790848800, utcOffset: 0 };
  for (const view of views) {
    const light = await renderView(plugin, view, options);
    const dark = await renderView(plugin, view, { ...options, fields: { appearance: 'dark' } });
    assert.ok(dark.includes('class="layout layout--col layout--top inverse bg--canvas" data-appearance="dark"'));
    assert.ok(dark.includes('class="title_bar inverse bg--canvas" data-appearance="dark"'));
    // No tile colour to flip: the code's white background extends four modules past
    // its finder patterns, as TRMNL's qr_code draws it, so any appearance scans.
    for (const html of [light, dark]) {
      assert.doesNotMatch(html.match(/<a class="block [^"]*" href=[^>]*data-context-url/)[0], /bg--|p--/);
      const qr = Buffer.from(html.match(/src="data:image\/svg\+xml;base64,([^"]+)" alt="Read in context"/)[1], 'base64').toString();
      assert.match(qr, /<path fill="#ffffff" d="M0 0h(\d+)v\1H0z"\/><path stroke="#000000" d="M4 4\.5h7/);
    }
    const crossOf = html => html.match(/src="(data:image\/svg\+xml;base64,[^"]+)"[^>]*data-reading-cross/)[1];
    assert.notEqual(crossOf(dark), crossOf(light));
    assert.ok(Buffer.from(crossOf(dark).split(',')[1], 'base64').toString().includes('fill="white" stroke="white"'));
  }
});
