import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { loadPlugin, renderView, views } from '../src/plugin.js';
import { reviewScreens, reviewScenarios, reviewManifest, reviewOptions, reviewCase, passageSamples, passageSchedule } from '../src/review.js';
import { reviewSummary, contactSheetHtml, formatTypography } from '../src/review-report.js';
import { reviewFlags, pruneReviewCache } from '../src/review-runner.js';
import { ReviewCapture, minFontSize } from '../src/review-capture.js';
import { createPreviewServer } from '../src/server.js';

const plugin = await loadPlugin(fileURLToPath(new URL('../../../apps/bible-verses', import.meta.url)));

test('responsive samples select actual shortest, median and longest complete passages for both QR states', async () => {
  const scenarios = reviewScenarios(plugin, 'responsive');
  assert.equal(scenarios.length, 6);
  const collections = [plugin.data, ...Object.values(plugin.data.translations)];
  const lengths = collections.flatMap(c => c.verses.map(v => Array.from(v.text).length));
  for (const qr of [true, false]) {
    const samples = scenarios.filter(s => s.options.fields.show_context_qr === qr);
    assert.deepEqual(samples.map(s => s.sample.kind), ['shortest', 'median', 'longest']);
    assert.equal(samples[0].sample.characters, Math.min(...lengths));
    assert.equal(samples[2].sample.characters, Math.max(...lengths));
    const median = samples[1];
    assert.ok(lengths.filter(n => n < median.sample.characters).length <= lengths.length / 2);
    assert.ok(lengths.filter(n => n > median.sample.characters).length <= lengths.length / 2);
    for (const sample of samples) {
      const collection = collections.find(c => c.translation.language === sample.language);
      assert.ok(collection.verses.some(v => v.id === sample.expected.id && v.text === sample.expected.text));
      const html = await renderView(plugin, 'full', reviewOptions(plugin, sample, { model: 'og', portrait: false }));
      assert.ok(html.includes(`data-verse-id="${sample.expected.id}"`));
      assert.equal(html.includes('data-context-url='), qr);
    }
  }
  assert.throws(() => passageSamples([]), /empty/);
  assert.equal(passageSamples([{ id: 'b', text: 'aa' }, { id: 'a', text: 'bb' }])[0].verse.id, 'a');
});

test('agent summaries omit publisher text and detailed successes while preserving coverage and actionable failures', async () => {
  const manifest = await reviewManifest(plugin, 'responsive');
  const scenario = manifest.scenarios[0];
  const captures = [{ id: `${scenario.id}--og-landscape-full`, scenarioId: scenario.id, status: 'unreviewed', errors: [], metrics: {}, imageUrl: 'screenshots/first.png' }, { id: `${scenario.id}--og-portrait-full`, scenarioId: scenario.id, status: 'failed', errors: ['Clipped text'], metrics: {}, imageUrl: 'screenshots/second.png' }];
  const summary = reviewSummary(manifest, captures, { selected: 24, contactSheets: [{ scenarioId: scenario.id, imageUrl: 'contact-sheets/first.png' }] });
  assert.equal(summary.coverage.remaining, 22);
  assert.equal(summary.failed, true);
  assert.equal(summary.visualBaselinesComplete, false);
  assert.equal(summary.issues.length, 1);
  assert.deepEqual(summary.issues[0].errors, ['Clipped text']);
  assert.equal(summary.cases[0].contactSheet, 'contact-sheets/first.png');
  assert.ok(!JSON.stringify(summary).includes(scenario.expected.text));
  assert.ok(JSON.stringify(summary).length < JSON.stringify({ ...manifest, captured: captures }).length / 2);
  const sheet = contactSheetHtml(manifest, scenario, [{ ...captures[1], screenId: 'og-portrait-full' }]);
  assert.ok(sheet.includes('Render failed'));
  assert.ok(sheet.includes('Not captured'));
  assert.ok(sheet.includes('Median') === false);
  assert.equal((sheet.match(/<figure /g) ?? []).length, 24);
});

test('summaries compare fitted type across screens and keep warnings separate from failures', async () => {
  const manifest = await reviewManifest(plugin, 'responsive');
  const [first, second] = manifest.scenarios;
  const capture = (scenario, screen, typography, warnings = []) => ({ id: `${scenario.id}--${screen}`, scenarioId: scenario.id, screenId: screen, status: 'unreviewed', errors: [], metrics: { typography, warnings }, imageUrl: `screenshots/${scenario.id}--${screen}.png` });
  const captures = [
    capture(first, 'og-landscape-quadrant', { fontSize: 10, fill: 83 }, ['Scripture fits at 10px, below the 16px legibility floor.']),
    capture(second, 'og-landscape-quadrant', { fontSize: 20, fill: 97 }),
  ];
  const summary = reviewSummary(manifest, captures, { selected: 2 });
  assert.equal(summary.failed, false);
  assert.equal(summary.warnings.length, 1);
  assert.deepEqual(summary.typography.rows, [{ screen: 'og-landscape-quadrant', cells: Object.fromEntries(manifest.scenarios.map(s => [s.id, s.id === first.id ? '10px 83% !' : s.id === second.id ? '20px 97%' : null])) }]);
  const table = formatTypography(summary.typography);
  assert.match(table, /en-shortest\+qr/);
  assert.match(table, /og-landscape-quadrant +10px 83% ! +20px 97%/);
  const sheet = contactSheetHtml(manifest, first, captures.slice(0, 1));
  assert.ok(sheet.includes('400 × 240 · 10px 83% !'));
  assert.ok(sheet.includes('class="unreviewed warning"'));
});

test('legibility floors default to 16px and accept per-view plugin overrides', () => {
  assert.equal(minFontSize(plugin, 'quadrant'), 10);
  assert.equal(minFontSize(plugin, 'full'), 16);
  assert.equal(minFontSize({ config: { review: { min_font_size: { default: 14 } } } }, 'full'), 14);
  assert.equal(minFontSize({ config: {} }, 'quadrant'), 16);
});

test('documentation screenshots name real screens and reach each passage through normal rotation', async () => {
  const entries = JSON.parse(await readFile(join(plugin.root, 'docs/screenshots.json'), 'utf8'));
  const screens = new Set(reviewScreens().map(screen => screen.id));
  assert.ok(entries.some(entry => entry.file === 'listing-full.png'));
  assert.equal(new Set(entries.map(entry => entry.file)).size, entries.length);
  for (const entry of entries) {
    assert.ok(screens.has(entry.screen), entry.file);
    const fields = { ...plugin.defaults, language: entry.language, theme: 'all', rotation: 'daily', show_context_qr: entry.qr };
    assert.equal(passageSchedule(plugin, fields, entry.passage).expected.id, entry.passage, entry.file);
  }
});

test('review cache pruning keeps the current fingerprint and the most recent others', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-cache-'));
  const names = ['current', 'old', 'older', 'oldest'];
  for (const [index, name] of names.entries()) {
    await mkdir(join(root, '.cache/review', name), { recursive: true });
    const time = new Date(Date.UTC(2026, 0, 10 - index));
    await utimes(join(root, '.cache/review', name), time, time);
  }
  assert.deepEqual(await pruneReviewCache(root, 'oldest'), ['older']);
  assert.deepEqual((await readdir(join(root, '.cache/review'))).sort(), ['current', 'old', 'oldest']);
  assert.deepEqual(await pruneReviewCache(join(root, 'missing'), 'current'), []);
});

test('curated cases cover each translated theme, short passages, references, QR-off and localized recovery', async () => {
  const scenarios = reviewScenarios(plugin);
  assert.equal(new Set(scenarios.map(s => s.id)).size, scenarios.length);
  assert.deepEqual(scenarios.slice(0, 3).map(s => s.id), ['en-default', 'fr-default', 'es-default']);
  for (const collection of [plugin.data, ...Object.values(plugin.data.translations)]) {
    const language = collection.translation.language;
    for (const theme of collection.themes) {
      const scenario = scenarios.find(s => s.id === `${language}-longest-${theme.id}`);
      const pool = collection.verses.filter(v => v.theme === theme.id);
      assert.equal(scenario.expected.text.length, Math.max(...pool.map(v => v.text.length)));
    }
    assert.ok(scenarios.some(s => s.language === language && !s.options.fields.show_context_qr));
    assert.ok(scenarios.some(s => s.language === language && s.recovery));
  }
  // Exercise actual rotation and markup, including the missing-content branch.
  for (const scenario of scenarios) for (const view of views) {
    const html = await renderView(plugin, view, reviewOptions(plugin, scenario, { model: 'og', portrait: false }));
    if (scenario.expected) {
      assert.ok(html.includes(`data-verse-id="${scenario.expected.id}"`), `${scenario.id} ${view}`);
      assert.equal(html.includes('data-context-url='), scenario.options.fields.show_context_qr);
    } else {
      assert.ok(html.includes(scenario.missingText));
      assert.ok(!html.includes('data-verse-id='));
    }
  }
});

test('every-passage suite includes each publisher passage with both QR states and 24 native-size screens', () => {
  const cases = reviewScenarios(plugin, 'passages');
  const screens = reviewScreens();
  assert.equal(cases.length, 648);
  assert.equal(screens.length, 24);
  assert.equal(new Set(screens.map(s => s.id)).size, 24);
  assert.equal(cases.length * screens.length, 15552);
  for (const collection of [plugin.data, ...Object.values(plugin.data.translations)]) for (const verse of collection.verses) {
    const variants = cases.filter(c => c.language === collection.translation.language && c.expected.id === verse.id);
    assert.deepEqual(variants.map(c => c.options.fields.show_context_qr).sort(), [false, true]);
  }
  assert.deepEqual(screens.find(s => s.id === 'v2-portrait-quadrant').width, 702);
  assert.equal(screens.find(s => s.id === 'v2-portrait-quadrant').height, 936);
});

test('source fingerprints change for content, template, transform and settings changes', async () => {
  const original = (await reviewManifest(plugin)).sourceHash;
  assert.equal(original, (await reviewManifest(plugin)).sourceHash);
  for (const changed of [
    { ...plugin, templates: { ...plugin.templates, full: plugin.templates.full + '\n<!-- edit -->' } },
    { ...plugin, transform: plugin.transform + '\n// edit' },
    { ...plugin, data: { ...plugin.data, verses: plugin.data.verses.slice(1) } },
    { ...plugin, settings: { ...plugin.settings, description: 'Changed' } },
  ]) assert.notEqual(original, (await reviewManifest(changed)).sourceHash);
});

test('review runner rejects unbounded full-settings coverage and malformed flags', () => {
  assert.throws(() => reviewFlags(['--all-settings']), /explicit --limit/);
  for (const flags of [['--limit', '0'], ['--workers', '9'], ['--limit', '-1'], ['--shard', '3/2'], ['--shard', 'a/b'], ['--typo']]) assert.throws(() => reviewFlags(flags));
  assert.deepEqual(reviewFlags(['--shard', '2/4', '--limit', '24']).shard, [2, 4]);
  assert.equal(reviewFlags(['--exhaustive']).mode, 'passages');
  assert.equal(reviewFlags(['--responsive']).mode, 'responsive');
  assert.equal(reviewFlags(['--all-settings', '--limit', '24']).mode, 'settings');
});

test('baseline handling distinguishes unreviewed, unchanged and changed without replacing references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'trmnl-review-'));
  const capture = new ReviewCapture(root);
  await mkdir(join(root, 'images'));
  const screenshotPath = join(root, 'images/case.png');
  const image = new PNG({ width: 8, height: 8 }); image.data.fill(255);
  await writeFile(screenshotPath, PNG.sync.write(image));
  const result = { id: 'case--screen', environment: { id: '0123456789abcdef' }, sourceHash: 'a'.repeat(64), errors: [], screenshotPath };
  assert.equal((await capture.compare(result)).status, 'unreviewed');
  const accepted = await capture.compare(result, true);
  assert.equal(accepted.status, 'passed');
  const original = await readFile(accepted.baselinePath);
  image.data.fill(0); for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  await writeFile(screenshotPath, PNG.sync.write(image));
  const changed = await capture.compare(result);
  assert.equal(changed.status, 'changed'); assert.equal(changed.changedPixels, 64); assert.ok(changed.diffUrl);
  assert.deepEqual(await readFile(accepted.baselinePath), original);
  assert.equal((await capture.compare({ ...result, errors: ['Clipped text'] }, true)).status, 'failed');
  assert.deepEqual(await readFile(accepted.baselinePath), original);
});

test('preview server serves shared review cases, rejects stale source and invalid cases, and preserves the single preview', async () => {
  const app = createPreviewServer(plugin.root);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const manifest = await (await fetch(origin + '/review/manifest')).json();
    assert.equal(manifest.total, manifest.scenarios.length * 24);
    const selected = reviewCase(manifest, 'en-default', 'og-landscape-full');
    assert.ok(selected.scenario.expected);
    const query = new URLSearchParams({ scenario: selected.scenario.id, screen: selected.screen.id, source: manifest.sourceHash });
    const render = await fetch(`${origin}/review/render?${query}`);
    assert.equal(render.status, 200); assert.ok((await render.text()).includes(selected.scenario.expected.id));
    query.set('source', 'old-source'); assert.equal((await fetch(`${origin}/review/render?${query}`)).status, 409);
    assert.equal((await fetch(origin + '/review/render?scenario=unknown&screen=bad')).status, 400);
    assert.match(await (await fetch(origin + '/review')).text(), /Review board/);
    assert.match(await (await fetch(origin + '/preview')).text(), /Preview settings/);
  } finally { await app.close(); }
});
