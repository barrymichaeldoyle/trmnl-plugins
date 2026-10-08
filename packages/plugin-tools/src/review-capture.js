import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, access, copyFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { renderView, screenHtml } from './plugin.js';
import { reviewOptions } from './review.js';
import { measureReview } from './review-metrics.js';

async function atomicWrite(path, bytes) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes); await rename(temporary, path);
}

// Legibility floor in logical px. Plugins can accept smaller fitted text for
// compact views in plugin.config.json, e.g. "review": { "min_font_size": { "quadrant": 10 } }.
export function minFontSize(plugin, view) {
  const floors = plugin.config.review?.min_font_size ?? {};
  return floors[view] ?? floors.default ?? 16;
}

export class ReviewCapture {
  constructor(root, { workers = 4 } = {}) {
    this.root = root; this.workers = workers; this.active = 0; this.waiting = []; this.pending = new Map();
  }

  async browser() {
    this.browserPromise ??= chromium.launch({ headless: true }).catch(error => {
      this.browserPromise = undefined;
      throw new Error(`Screenshot browser could not start. Run pnpm review:install, then retry. ${error.message}`);
    });
    return this.browserPromise;
  }

  async environment() {
    const browser = await this.browser();
    const info = { browser: browser.version(), platform: process.platform, arch: process.arch, deviceScaleFactor: 1 };
    return { ...info, id: createHash('sha256').update(JSON.stringify(info)).digest('hex').slice(0, 16) };
  }

  async acquire() {
    if (this.active >= this.workers) await new Promise(resolve => this.waiting.push(resolve));
    else this.active++;
  }
  release() { const next = this.waiting.shift(); if (next) next(); else this.active--; }

  async capture(plugin, manifest, testCase, origin, { fresh = false, updateBaselines = false } = {}) {
    const key = `${manifest.sourceHash}/${testCase.id}`;
    let pending = this.pending.get(key);
    if (!pending) {
      pending = (async () => {
        await this.acquire();
        try { return await this.render(plugin, manifest, testCase, origin, fresh); }
        finally { this.release(); }
      })();
      this.pending.set(key, pending);
      pending.finally(() => this.pending.delete(key)).catch(() => {});
    }
    const rendered = await pending;
    return this.compare(rendered, updateBaselines);
  }

  async render(plugin, manifest, { scenario, screen, id }, origin, fresh) {
    const environment = await this.environment();
    const directory = join(this.root, '.cache/review', manifest.sourceHash, environment.id);
    const screenshotPath = join(directory, `${id}.png`);
    const resultPath = join(directory, `${id}.json`);
    if (!fresh) {
      try { await access(screenshotPath); return { ...JSON.parse(await readFile(resultPath, 'utf8')), cached: true, screenshotPath }; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await mkdir(directory, { recursive: true });
    const browser = await this.browser();
    const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
    const errors = [];
    let metrics;
    try {
      const options = reviewOptions(plugin, scenario, screen);
      const markup = await renderView(plugin, screen.view, options);
      const html = screenHtml(markup, screen.view, plugin.settings.framework_version, true, options);
      // Screenshots use local pinned assets; plugin content cannot navigate out.
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin && url.pathname === '/review/document') return route.fulfill({ contentType: 'text/html', body: html });
        return url.origin === origin || ['data:', 'about:'].includes(url.protocol) ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('requestfailed', request => errors.push(`Asset failed: ${request.url()}`));
      page.on('response', response => { if (response.status() >= 400) errors.push(`Asset returned ${response.status()}: ${response.url()}`); });
      await page.clock.setFixedTime(scenario.options.timestamp * 1000);
      await page.goto(`${origin}/review/document`, { waitUntil: 'load', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => window.TRMNL_PLUGINS_READY === true, null, { timeout: 15000 });
      // Two animation frames let the final layout flush after font fitting.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      metrics = await page.evaluate(measureReview, { expected: scenario.expected, missingTitle: scenario.missingTitle, missingText: scenario.missingText, qr: scenario.options.fields.show_context_qr, recovery: scenario.recovery, minFontSize: minFontSize(plugin, screen.view), expectText: scenario.expectText ? [...scenario.expectText, ...(scenario.expectTextByView?.[screen.view] ?? [])] : undefined });
      await atomicWrite(screenshotPath, await page.screenshot({ animations: 'disabled' }));
    } catch (error) {
      errors.push(error.message);
    } finally { await context.close(); }
    const result = { id, scenarioId: scenario.id, screenId: screen.id, sourceHash: manifest.sourceHash, environment, capturedAt: new Date().toISOString(), inputs: { ...scenario.options, model: screen.model, portrait: screen.portrait, view: screen.view, recovery: scenario.recovery }, expectedPassageId: scenario.expected?.id ?? null, expectedReference: scenario.expected?.reference ?? null, metrics, errors: [...new Set([...errors, ...(metrics?.errors ?? [])])], screenshotPath, cached: false };
    // Only completed captures can be resumed. Infrastructure failures retry next run.
    if (metrics && !result.errors.length) await atomicWrite(resultPath, JSON.stringify(result, null, 2));
    return result;
  }

  async compare(result, updateBaselines = false) {
    const baselineDir = join(this.root, 'review-baselines', result.environment.id);
    const baselinePath = join(baselineDir, `${result.id}.png`);
    const imageKey = `${result.sourceHash}/${result.environment.id}/${result.id}`;
    const output = { ...result, imageKey, imageUrl: `/review/image/${imageKey}.png`, baselinePath, status: result.errors.length ? 'failed' : 'unreviewed', layoutPassed: result.errors.length === 0, changedPixels: null };
    if (result.errors.length) return output;
    if (updateBaselines) {
      await mkdir(baselineDir, { recursive: true });
      await copyFile(result.screenshotPath, baselinePath);
      await writeFile(join(baselineDir, 'environment.json'), JSON.stringify(result.environment, null, 2));
    }
    let reference;
    try { reference = await readFile(baselinePath); }
    catch (error) { if (error.code === 'ENOENT') return output; throw error; }
    const actual = PNG.sync.read(await readFile(result.screenshotPath));
    const baseline = PNG.sync.read(reference);
    output.baselineUrl = `/review/baseline/${result.environment.id}/${result.id}.png`;
    if (actual.width !== baseline.width || actual.height !== baseline.height) return { ...output, status: 'changed', changedPixels: actual.width * actual.height, baselineSizeChanged: true };
    const diff = new PNG({ width: actual.width, height: actual.height });
    output.changedPixels = pixelmatch(actual.data, baseline.data, diff.data, actual.width, actual.height, { threshold: .1 });
    output.status = output.changedPixels ? 'changed' : 'passed';
    if (output.changedPixels) {
      await atomicWrite(result.screenshotPath.replace(/\.png$/, '.diff.png'), PNG.sync.write(diff));
      output.diffUrl = `/review/image/${imageKey}.diff.png`;
    }
    return output;
  }

  async close() { if (this.browserPromise) await (await this.browserPromise).close(); }
}
