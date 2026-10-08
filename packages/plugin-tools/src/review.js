import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { devices, views, previewDevice, contextFor, runTransform, previewTiming } from './plugin.js';

export const reviewEpoch = Date.parse('2026-10-01T12:00:00Z') / 1000;
export const viewLabels = { full: 'Full', half_horizontal: 'Half horizontal', half_vertical: 'Half vertical', quadrant: 'Quadrant' };
const fractions = { full: [1, 1], half_horizontal: [1, .5], half_vertical: [.5, 1], quadrant: [.5, .5] };
const intervals = { daily: 86400, twelve_hours: 43200, six_hours: 21600, hourly: 3600 };

export function reviewScreens() {
  return Object.keys(devices).flatMap(model => [false, true].flatMap(portrait => {
    const device = previewDevice(model, portrait);
    return views.map(view => ({
      id: `${model}-${portrait ? 'portrait' : 'landscape'}-${view}`, model, portrait, view,
      deviceName: device.name, orientation: portrait ? 'Portrait' : 'Landscape', viewLabel: viewLabels[view],
      width: Math.ceil(device.width * device.ratio * fractions[view][0]),
      height: Math.ceil(device.height * device.ratio * fractions[view][1]),
    }));
  }));
}

export function recoveryData(plugin) {
  return { ...plugin.data, verses: [], translations: Object.fromEntries(Object.entries(plugin.data.translations ?? {}).map(([key, value]) => [key, { ...value, verses: [] }])) };
}

export function reviewOptions(plugin, scenario, screen) {
  const data = scenario.fixture ? { data: plugin.fixtures[scenario.fixture] } : scenario.recovery ? { data: recoveryData(plugin) } : {};
  return { ...scenario.options, model: screen.model, portrait: screen.portrait, ...data };
}

// Apps without a Scripture collection declare their review cases instead:
// "review": { "cases": [{ "id": "usd", "name": "Typical account", "fixture": "usd",
//   "fields": { "comparison_style": "both" }, "expect": ["$44.11"], "suites": ["responsive"] }] }
// expect lists text that must be visible in every view; a case without suites
// runs in every suite.
export function caseScenarios(plugin, mode) {
  const cases = plugin.config.review.cases.filter(entry => !entry.suites || entry.suites.includes(mode) || mode === 'passages');
  return cases.map(entry => {
    if (entry.fixture && !plugin.fixtures?.[entry.fixture]) throw new Error(`Review case ${entry.id} names an unknown fixture.`);
    const fields = { ...plugin.defaults, ...plugin.config.preview?.fields, ...entry.fields };
    const timing = previewTiming(plugin, entry.fixture ?? 'default');
    return {
      id: entry.id, name: entry.name, coverage: [entry.name], fixture: entry.fixture, recovery: false, expected: null,
      options: { fields, utcOffset: entry.utc_offset ?? plugin.config.preview?.utc_offset ?? 0, timestamp: entry.time ? Date.parse(entry.time) / 1000 : timing.timestamp ?? reviewEpoch },
      language: entry.language ?? 'en', translation: entry.fixture ?? '', themes: entry.description ?? entry.fixture ?? '',
      expectText: entry.expect ?? [], expectTextByView: entry.expect_by_view ?? {},
    };
  });
}

export function passageSamples(verses) {
  const ordered = [...verses].sort((a, b) => Array.from(a.text).length - Array.from(b.text).length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!ordered.length) throw new Error('Cannot sample an empty passage collection.');
  return [['shortest', 0], ['median', Math.floor(ordered.length / 2)], ['longest', ordered.length - 1]].map(([kind, index]) => ({
    verse: ordered[index], sample: { kind, characters: Array.from(ordered[index].text).length, words: ordered[index].text.trim().split(/\s+/u).length, rank: index + 1, poolSize: ordered.length },
  }));
}

// Normal rotation selects passages, so a fixed timestamp reaches the target
// passage through the same transform and Liquid logic as a device render.
export function passageSchedule(plugin, fields, targetId, data = plugin.data) {
  const utcOffset = plugin.config.preview?.utc_offset ?? 0;
  const pool = runTransform(plugin, contextFor(plugin, { fields, timestamp: reviewEpoch, utcOffset, data })).reading_pool;
  if (!Array.isArray(pool)) throw new Error('The Scripture review adapter requires reading_pool from the transform.');
  const seconds = intervals[fields.rotation] ?? 86400;
  let slot = Math.floor((reviewEpoch + utcOffset) / seconds);
  if (targetId) {
    const index = pool.findIndex(verse => verse.id === targetId);
    if (index < 0) throw new Error(`Passage ${targetId} is outside the selected themes.`);
    slot += (index - slot % pool.length + pool.length) % pool.length;
  }
  const timestamp = targetId ? slot * seconds - utcOffset + Math.min(seconds / 2, 3600) : reviewEpoch;
  return { options: { fields, utcOffset, timestamp }, expected: pool.length ? pool[slot % pool.length] : null };
}

export function reviewScenarios(plugin, mode = 'curated') {
  if (!['responsive', 'curated', 'passages', 'settings'].includes(mode)) throw new Error('Unknown review suite.');
  if (plugin.config.review?.cases) return caseScenarios(plugin, mode);
  const collections = [plugin.data, ...Object.values(plugin.data.translations ?? {})];
  if (collections.some(collection => !collection.translation || !collection.verses?.length || !collection.themes?.length)) throw new Error('Review suites require Scripture collections with translation, verses, and themes.');
  const cases = [];
  const seen = new Map();
  const add = (collection, name, key, fields = {}, target, recovery = false, sample) => {
    fields = { ...plugin.defaults, language: collection.translation.language, theme: 'all', rotation: 'daily', show_context_qr: true, ...fields };
    const { options, expected } = passageSchedule(plugin, fields, target?.id, recovery ? recoveryData(plugin) : plugin.data);
    const signature = JSON.stringify([options, recovery, sample?.kind]);
    if (seen.has(signature)) { seen.get(signature).coverage.push(name); return; }
    const scenario = {
      id: `${collection.translation.language}-${key}`, name, coverage: [name], options, recovery,
      language: collection.translation.language, translation: collection.translation.name,
      themes: (Array.isArray(fields.theme) ? fields.theme : [fields.theme]).map(id => collection.themes.find(theme => theme.id === id)?.name ?? 'All themes').join(', '),
      expected, sample, missingTitle: collection.labels?.missing_title ?? 'Your Scripture collection is missing',
      missingText: collection.labels?.missing_text ?? 'Reimport Daily Bread to restore the Scripture collection.',
    };
    seen.set(signature, scenario); cases.push(scenario);
  };
  const longest = verses => verses.reduce((a, b) => a.text.length >= b.text.length ? a : b);
  if (mode === 'responsive') {
    const pool = collections.flatMap(collection => collection.verses.map(verse => ({ ...verse, sampleLanguage: collection.translation.language })));
    const samples = passageSamples(pool);
    for (const qr of [true, false]) for (const { verse, sample } of samples) {
      const collection = collections.find(c => c.translation.language === verse.sampleLanguage);
      add(collection, `${sample.kind[0].toUpperCase()}${sample.kind.slice(1)} passage`, `sample-${sample.kind}-qr-${qr}`, { show_context_qr: qr }, verse, false, sample);
    }
    return cases;
  }
  for (const collection of collections) {
    if (mode === 'passages') {
      for (const verse of collection.verses) for (const qr of [true, false]) add(collection, `Every passage · QR ${qr ? 'on' : 'off'}`, `${verse.id}-qr-${qr}`, { show_context_qr: qr }, verse);
    } else if (mode === 'settings') {
      for (let selection = 0; selection < 2 ** collection.themes.length; selection++) {
        const theme = collection.themes.filter((_, index) => selection & (1 << index)).map(theme => theme.id);
        for (const rotation of Object.keys(intervals)) for (const qr of [true, false]) add(collection, 'Every settings combination', `selection-${selection}-${rotation}-qr-${qr}`, { theme, rotation, show_context_qr: qr });
      }
    } else {
      add(collection, 'Mixed daily default', 'default');
      add(collection, 'Shortest passage', 'shortest', {}, collection.verses.reduce((a, b) => a.text.length <= b.text.length ? a : b));
      for (const { verse, sample } of passageSamples(collection.verses).slice(1)) add(collection, `${sample.kind[0].toUpperCase()}${sample.kind.slice(1)} passage`, sample.kind, {}, verse, false, sample);
      for (const theme of collection.themes) add(collection, `Longest · ${theme.name}`, `longest-${theme.id}`, { theme: [theme.id] }, longest(collection.verses.filter(verse => verse.theme === theme.id)));
      const theme = collection.themes.slice(0, 2).map(theme => theme.id);
      add(collection, 'Multiple themes', 'multiple', { theme });
      add(collection, 'Longest passage · QR off', 'longest-qr-off', { show_context_qr: false }, longest(collection.verses));
      add(collection, 'Longest reference', 'longest-reference', {}, collection.verses.reduce((a, b) => a.reference.length >= b.reference.length ? a : b));
      add(collection, 'Missing collection recovery', 'recovery', {}, undefined, true);
    }
  }
  // Put the three language defaults together before the stress cases.
  return cases.sort((a, b) => Number(b.coverage.includes('Mixed daily default')) - Number(a.coverage.includes('Mixed daily default')));
}

export async function reviewManifest(plugin, mode = 'curated') {
  const tooling = await Promise.all(['plugin.js', 'review.js', 'review-metrics.js', 'review-capture.js'].map(name => readFile(new URL(name, import.meta.url), 'utf8')));
  const sourceHash = createHash('sha256').update(JSON.stringify({ config: plugin.config, settings: plugin.settings, templates: plugin.templates, data: plugin.data, fixtures: plugin.fixtures, transform: plugin.transform, tooling })).digest('hex');
  const scenarios = reviewScenarios(plugin, mode);
  const screens = reviewScreens();
  return { name: plugin.settings.name, framework: plugin.settings.framework_version, mode, sourceHash, scenarios, screens, total: scenarios.length * screens.length };
}

export function reviewCase(manifest, scenarioId, screenId) {
  const scenario = manifest.scenarios.find(value => value.id === scenarioId);
  const screen = manifest.screens.find(value => value.id === screenId);
  if (!scenario || !screen) throw new Error('Unknown review case.');
  return { scenario, screen, id: `${scenario.id}--${screen.id}` };
}
