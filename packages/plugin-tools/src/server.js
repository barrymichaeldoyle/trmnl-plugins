import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { loadPlugin, checkPlugin, renderView, screenHtml, exportFiles, escapeHtml, devices, previewTiming } from './plugin.js';
import { frameworkAsset } from './framework.js';
import { reviewManifest, reviewCase, reviewOptions } from './review.js';
import { ReviewCapture } from './review-capture.js';
import { reviewSummary } from './review-report.js';

function optionsFrom(url) {
  const fields = {};
  for (const key of new Set([...url.searchParams.keys()].filter(key => key.startsWith('field.')))) {
    const values = url.searchParams.getAll(key);
    fields[key.slice(6)] = values.length > 1 ? values : values[0];
  }
  const result = { fields, model: url.searchParams.get('model') ?? 'og', portrait: url.searchParams.get('portrait') === 'true' };
  if (url.searchParams.has('timestamp')) result.timestamp = Number(url.searchParams.get('timestamp'));
  if (url.searchParams.has('offset')) result.utcOffset = Number(url.searchParams.get('offset'));
  if (url.searchParams.has('refresh')) result.refreshMinutes = Number(url.searchParams.get('refresh'));
  if (url.searchParams.has('fixture')) result.fixture = url.searchParams.get('fixture');
  return result;
}

// Polling plugins preview a recorded response at the moment it was recorded,
// unless the preview asks for another time.
function fixtureOptions(plugin, { fixture, ...options }) {
  if (fixture === undefined) return plugin.fixtures && Object.keys(plugin.fixtures).length ? { ...previewTiming(plugin, 'default'), ...options } : options;
  if (!plugin.fixtures?.[fixture]) throw new Error(`Unknown fixture: ${fixture}`);
  return { ...previewTiming(plugin, fixture), ...options, data: plugin.fixtures[fixture] };
}

export function createPreviewServer(directory, { reviewByDefault = false, workers = 4 } = {}) {
  const root = resolve(directory);
  const capture = new ReviewCapture(root, { workers });
  const results = new Map();
  const server = createServer(async (req, res) => {
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const url = new URL(req.url, origin);
      const json = value => { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(value)); };
      if (url.pathname.startsWith('/framework/')) {
        const asset = await frameworkAsset(url.pathname.slice('/framework'.length));
        res.writeHead(200, { 'Content-Type': asset.type, 'Content-Encoding': 'gzip', 'Cache-Control': 'public, max-age=86400' }); res.end(asset.bytes); return;
      }
      let shell = { '/': reviewByDefault ? 'review.html' : 'preview.html', '/review': 'review.html', '/preview': 'preview.html', '/review/ui.js': 'review-ui.js', '/review/styles.css': 'review.css' }[url.pathname];
      if (shell === 'preview.html' && JSON.parse(await readFile(join(root, 'plugin.config.json'), 'utf8')).preview?.shell === 'fixtures') shell = 'preview-fixtures.html';
      if (shell) {
        res.setHeader('Content-Type', shell.endsWith('.js') ? 'text/javascript' : shell.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store'); res.end(await readFile(new URL(shell, import.meta.url), 'utf8')); return;
      }
      const image = url.pathname.match(/^\/review\/(image|baseline)\/([a-f0-9]{16,64})\/(?:([a-f0-9]{16})\/)?([a-z0-9_-]+(?:\.diff)?)\.png$/);
      if (image) {
        if (image[1] === 'image' && !image[3] || image[1] === 'baseline' && image[3]) throw new Error('Invalid screenshot path.');
        const path = image[1] === 'image' ? join(root, '.cache/review', image[2], image[3], `${image[4]}.png`) : join(root, 'review-baselines', image[2], `${image[4]}.png`);
        res.setHeader('Content-Type', 'image/png'); res.end(await readFile(path)); return;
      }
      const plugin = await loadPlugin(root);
      if (url.pathname === '/plugin') {
        json({ name: plugin.settings.name, fields: plugin.settings.custom_fields, defaults: { ...plugin.defaults, ...plugin.config.preview?.fields }, data: plugin.config.data ? plugin.data : undefined, devices, offset: plugin.config.preview?.utc_offset ?? 0, refresh: plugin.settings.refresh_interval,
          fixtures: Object.fromEntries(Object.keys(plugin.fixtures ?? {}).map(name => [name, plugin.config.fixtures[name].time ?? null])), fixture: plugin.config.preview?.fixture });
      } else if (['/review/manifest', '/review/render', '/review/capture', '/review/results', '/review/summary'].includes(url.pathname)) {
        const mode = url.searchParams.get('mode') ?? 'curated';
        const manifest = await reviewManifest(plugin, mode);
        const source = url.searchParams.get('source');
        if (source && source !== manifest.sourceHash) { res.statusCode = 409; json({ error: 'Source changed during this review. Reload the board to review the current files.' }); return; }
        if (url.pathname === '/review/manifest') { json(manifest); return; }
        if (url.pathname === '/review/results' || url.pathname === '/review/summary') {
          const captured = [...results.values()].filter(result => result.sourceHash === manifest.sourceHash && manifest.scenarios.some(scenario => scenario.id === result.scenarioId));
          json(url.pathname === '/review/summary' ? reviewSummary(manifest, captured) : { ...manifest, captured, completed: captured.length, remaining: manifest.total - captured.length }); return;
        }
        const testCase = reviewCase(manifest, url.searchParams.get('scenario'), url.searchParams.get('screen'));
        if (url.pathname === '/review/render') {
          const options = reviewOptions(plugin, testCase.scenario, testCase.screen);
          res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
          res.end(screenHtml(await renderView(plugin, testCase.screen.view, options), testCase.screen.view, plugin.settings.framework_version, true, options));
        } else {
          const result = await capture.capture(plugin, manifest, testCase, origin, { fresh: url.searchParams.get('fresh') === 'true' });
          results.set(`${manifest.sourceHash}/${result.id}`, result); json(result);
        }
      } else if (url.pathname === '/render') {
        const view = url.searchParams.get('view') ?? 'full';
        const options = fixtureOptions(plugin, optionsFrom(url));
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
        res.end(screenHtml(await renderView(plugin, view, options), view, plugin.settings.framework_version, true, options));
      } else if (url.pathname === '/download') {
        await checkPlugin(plugin);
        const { zipSync, strToU8 } = await import('fflate');
        res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="${plugin.config.slug}.zip"`);
        res.end(Buffer.from(zipSync(Object.fromEntries(Object.entries(exportFiles(plugin)).map(([name, contents]) => [name, strToU8(contents)])))));
      } else { res.writeHead(404); res.end('Not found'); }
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      res.writeHead(error.code === 'ENOENT' ? 404 : 400, { 'Content-Type': req.url.startsWith('/review/') ? 'application/json' : 'text/html; charset=utf-8' });
      res.end(req.url.startsWith('/review/') ? JSON.stringify({ error: error.message }) : `<h1>Preview could not render</h1><p>${escapeHtml(error.message)}</p><p>Correct the plugin files or preview parameters and reload.</p>`);
    }
  });
  return { server, capture, async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await capture.close(); } };
}
