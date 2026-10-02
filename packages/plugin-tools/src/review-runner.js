import { mkdir, readFile, readdir, stat, writeFile, copyFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createPreviewServer } from './server.js';
import { reviewManifest } from './review.js';
import { formatTypography, reviewSummary, writeContactSheets } from './review-report.js';

export function reviewFlags(flags) {
  const result = { mode: 'curated', workers: 4, limit: Infinity, shard: [1, 1], updateBaselines: false, fresh: false, requireBaselines: false };
  const integers = value => /^\d+$/.test(value ?? '') && Number(value) > 0 && Number.isSafeInteger(Number(value));
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === '--exhaustive') result.mode = 'passages';
    else if (flag === '--responsive') result.mode = 'responsive';
    else if (flag === '--contact-sheets') result.contactSheets = true;
    else if (flag === '--no-contact-sheets') result.contactSheets = false;
    else if (flag === '--all-settings') result.mode = 'settings';
    else if (flag === '--update-baselines') result.updateBaselines = true;
    else if (flag === '--fresh') result.fresh = true;
    else if (flag === '--require-baselines') result.requireBaselines = true;
    else if (flag === '--scenario' || flag === '--output') {
      const value = flags[++i]; if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
      result[flag.slice(2)] = value;
    }
    else if (flag === '--workers' || flag === '--limit') {
      const value = flags[++i]; if (!integers(value)) throw new Error(`${flag} requires a positive integer.`);
      result[flag.slice(2)] = Number(value);
    } else if (flag === '--shard') {
      const parts = (flags[++i] ?? '').split('/');
      if (parts.length !== 2 || !parts.every(integers) || Number(parts[0]) > Number(parts[1])) throw new Error('--shard requires an index/total such as 1/4.');
      result.shard = parts.map(Number);
    } else throw new Error(`Unknown review option: ${flag}`);
  }
  if (result.workers > 8) throw new Error('Review workers must be between 1 and 8.');
  if (result.mode === 'settings' && result.limit === Infinity) throw new Error('--all-settings requires an explicit --limit to bound the large settings product. Use --shard to divide coverage.');
  return result;
}

// Each template edit creates a new source fingerprint. Keep the current one and
// the two most recent others so quick before/after comparisons stay cached.
export async function pruneReviewCache(root, current, keep = 2) {
  const cache = join(root, '.cache/review');
  let entries;
  try { entries = await readdir(cache, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const others = await Promise.all(entries.filter(entry => entry.isDirectory() && entry.name !== current)
    .map(async entry => ({ name: entry.name, modified: (await stat(join(cache, entry.name))).mtimeMs })));
  const stale = others.sort((a, b) => b.modified - a.modified).slice(keep).map(entry => entry.name);
  await Promise.all(stale.map(name => rm(join(cache, name), { recursive: true, force: true })));
  return stale;
}

export async function runReview(plugin, flags = []) {
  const options = reviewFlags(flags);
  const manifest = await reviewManifest(plugin, options.mode);
  const selected = options.scenario ? manifest.scenarios.filter(scenario => scenario.id === options.scenario) : manifest.scenarios;
  if (!selected.length) throw new Error('No review scenarios match the requested case.');
  const [shardIndex, shardTotal] = options.shard;
  let cases = selected.flatMap(scenario => manifest.screens.map(screen => ({ scenario, screen, id: `${scenario.id}--${screen.id}` })));
  cases = cases.filter((_, index) => index % shardTotal === shardIndex - 1).slice(0, options.limit);
  if (!cases.length) throw new Error('The requested shard contains no cases.');
  await pruneReviewCache(plugin.root, manifest.sourceHash);
  const output = resolve(plugin.root, options.output ?? `dist/review/${options.mode}${shardTotal > 1 ? `-${shardIndex}-of-${shardTotal}` : ''}`);
  // Reports are rebuilt from the capture cache, so clear images from earlier
  // sample sets instead of leaving them beside the current ones.
  for (const directory of ['screenshots', 'contact-sheets', 'baselines']) await rm(join(output, directory), { recursive: true, force: true });
  await mkdir(join(output, 'screenshots'), { recursive: true });
  const app = createPreviewServer(plugin.root, { workers: options.workers });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const captured = [];
  let contactSheets = [];
  let next = 0;
  console.log(`${options.mode}: ${cases.length} captures (${manifest.total} in the full suite), ${options.workers} workers. Cached captures resume automatically.`);
  try {
    await Promise.all(Array.from({ length: options.workers }, async () => {
      while (next < cases.length) {
        const testCase = cases[next++];
        let result;
        try { result = await app.capture.capture(plugin, manifest, testCase, origin, options); }
        catch (error) { result = { id: testCase.id, scenarioId: testCase.scenario.id, screenId: testCase.screen.id, status: 'failed', errors: [error.message], layoutPassed: false }; }
        if (result.metrics) {
          await copyFile(result.screenshotPath, join(output, 'screenshots', `${result.id}.png`)); result.imageUrl = `screenshots/${result.id}.png`;
          if (result.baselineUrl) { await mkdir(join(output, 'baselines'), { recursive: true }); await copyFile(result.baselinePath, join(output, 'baselines', `${result.id}.png`)); result.baselineUrl = `baselines/${result.id}.png`; }
          if (result.diffUrl) { await copyFile(result.screenshotPath.replace(/\.png$/, '.diff.png'), join(output, 'screenshots', `${result.id}.diff.png`)); result.diffUrl = `screenshots/${result.id}.diff.png`; }
        }
        captured.push(result);
        // Progress is bounded and useful in CI, even for exhaustive runs.
        if (captured.length % 24 === 0 || captured.length === cases.length) console.log(`${captured.length}/${cases.length} captured · ${captured.filter(result => result.status === 'failed').length} failed · ${captured.filter(result => result.status === 'changed').length} changed`);
      }
    }));
    if (options.contactSheets ?? ['responsive', 'curated'].includes(options.mode)) {
      contactSheets = await writeContactSheets(await app.capture.browser(), { ...manifest, scenarios: selected }, captured, output);
    }
  } finally { await app.close(); }
  const order = new Map(cases.map((testCase, index) => [testCase.id, index]));
  captured.sort((a, b) => order.get(a.id) - order.get(b.id));
  const failed = captured.some(result => ['failed', 'changed'].includes(result.status) || options.requireBaselines && result.status === 'unreviewed');
  const report = { ...manifest, scenarios: selected, generatedAt: new Date().toISOString(), selection: { scenario: options.scenario, limit: Number.isFinite(options.limit) ? options.limit : null, shard: options.shard }, selected: cases.length, completed: captured.length, remaining: manifest.total - captured.length, captured, contactSheets, failed };
  await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2));
  const summary = reviewSummary(report, captured, { selected: cases.length, selection: report.selection, contactSheets, requireBaselines: options.requireBaselines });
  await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  await copyFile(new URL('./review-ui.js', import.meta.url), join(output, 'review-ui.js'));
  await copyFile(new URL('./review.css', import.meta.url), join(output, 'review.css'));
  const html = (await readFile(new URL('./review.html', import.meta.url), 'utf8')).replace('/review/styles.css', 'review.css').replace('/review/ui.js', 'review-ui.js').replace('</head>', `<script>globalThis.REVIEW_REPORT=${JSON.stringify(report).replaceAll('<', '\\u003c')};</script></head>`);
  await writeFile(join(output, 'index.html'), html);
  if (summary.typography.rows.length && summary.typography.columns.length <= 8) console.log(`Typography (${summary.typography.legend}):\n${formatTypography(summary.typography)}`);
  if (summary.warnings.length) console.log(`${summary.warnings.length} captures have legibility or spacing warnings; see summary.json warnings.`);
  console.log(`Report: ${join(output, 'index.html')}`);
  console.log(`JSON: ${join(output, 'results.json')}`);
  console.log(`Agent summary: ${join(output, 'summary.json')} · ${contactSheets.length} contact sheets`);
  const unreviewed = captured.filter(result => result.status === 'unreviewed').length;
  if (unreviewed) console.log(`${unreviewed} captures passed layout checks without a reviewed visual baseline. Use --update-baselines only after inspecting them.`);
  return report;
}
