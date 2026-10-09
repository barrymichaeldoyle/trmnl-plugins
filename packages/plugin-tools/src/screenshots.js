import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPreviewServer } from './server.js';
import { passageSchedule, reviewManifest, reviewScreens } from './review.js';

// Documentation and listing images are declared in docs/screenshots.json, so
// a layout change is followed by one regeneration rather than manual captures:
// [{ "file": "full.png", "passage": "mat-11-28-30", "language": "en",
//    "screen": "og-landscape-full", "qr": true, "fields": { "appearance": "dark" } }]
// Optional fields set any other plugin setting for that capture. Apps with
// declared review cases name one instead of a passage:
// [{ "file": "full.png", "case": "usd-percent", "screen": "og-landscape-full", "fields": { "appearance": "dark" } }]
export async function writeScreenshots(plugin) {
  const entries = JSON.parse(await readFile(join(plugin.root, 'docs/screenshots.json'), 'utf8'));
  const screens = new Map(reviewScreens().map(screen => [screen.id, screen]));
  const { sourceHash } = await reviewManifest(plugin, 'responsive');
  const cases = plugin.config.review?.cases ? new Map((await reviewManifest(plugin, 'passages')).scenarios.map(scenario => [scenario.id, scenario])) : null;
  const app = createPreviewServer(plugin.root);
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const failures = [];
  try {
    await Promise.all(entries.map(async entry => {
      const screen = screens.get(entry.screen);
      if (!screen) throw new Error(`${entry.file}: unknown screen ${entry.screen}.`);
      if (cases) {
        const base = cases.get(entry.case);
        if (!base) throw new Error(`${entry.file}: unknown review case ${entry.case}.`);
        const scenario = { ...base, id: `screenshot-${entry.file.replace(/\W+/g, '-')}`, options: { ...base.options, fields: { ...base.options.fields, ...entry.fields } } };
        const result = await app.capture.render(plugin, { sourceHash }, { scenario, screen, id: `${scenario.id}--${screen.id}` }, origin, true);
        if (result.errors.length) failures.push(`${entry.file}: ${result.errors.join(' ')}`);
        else await copyFile(result.screenshotPath, join(plugin.root, 'docs/screenshots', entry.file));
        console.log(`${entry.file} · ${base.name} · ${screen.width}×${screen.height}${result.errors.length ? ' · FAILED' : ''}`);
        return;
      }
      const fields = { ...plugin.defaults, language: entry.language, theme: 'all', show_context_qr: entry.qr ?? true, ...entry.fields };
      const { options, expected } = passageSchedule(plugin, fields, entry.passage, plugin.data);
      if (expected?.id !== entry.passage) throw new Error(`${entry.file}: passage ${entry.passage} is not in the ${entry.language} collection.`);
      const scenario = { id: `screenshot-${entry.file.replace(/\W+/g, '-')}`, options, expected, recovery: false };
      const result = await app.capture.render(plugin, { sourceHash }, { scenario, screen, id: `${scenario.id}--${screen.id}` }, origin, true);
      if (result.errors.length) failures.push(`${entry.file}: ${result.errors.join(' ')}`);
      else await copyFile(result.screenshotPath, join(plugin.root, 'docs/screenshots', entry.file));
      const t = result.metrics?.typography;
      console.log(`${entry.file} · ${expected.reference} · ${screen.width}×${screen.height}${t ? ` · ${t.fontSize}px ${t.fill}%` : ''}${result.errors.length ? ' · FAILED' : ''}`);
    }));
  } finally { await app.close(); }
  if (failures.length) throw new Error(`Screenshots failed layout checks:\n${failures.join('\n')}`);
}
