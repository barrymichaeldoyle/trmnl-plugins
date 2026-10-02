import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { escapeHtml } from './plugin.js';

export function reviewSummary(manifest, captured, { selected = manifest.total, selection, contactSheets = [], requireBaselines = false } = {}) {
  const counts = { passed: 0, failed: 0, changed: 0, unreviewed: 0 };
  const byScenario = new Map();
  for (const result of captured) {
    counts[result.status]++;
    byScenario.set(result.scenarioId, (byScenario.get(result.scenarioId) ?? 0) + 1);
  }
  return {
    sourceHash: manifest.sourceHash, framework: manifest.framework,
    coverage: { suite: manifest.mode, total: manifest.total, selected, captured: captured.length, remaining: selected - captured.length, selection },
    counts, failed: counts.failed + counts.changed > 0 || requireBaselines && counts.unreviewed > 0,
    visualBaselinesComplete: counts.unreviewed === 0 && counts.failed === 0 && captured.length === selected,
    environments: [...new Map(captured.filter(r => r.environment).map(r => [r.environment.id, r.environment])).values()],
    cases: manifest.scenarios.map(s => ({ id: s.id, language: s.language, name: s.name, themes: s.themes, reference: s.expected?.reference ?? null, sample: s.sample, qr: s.options.fields.show_context_qr, captured: byScenario.get(s.id) ?? 0, total: manifest.screens.length, contactSheet: contactSheets.find(sheet => sheet.scenarioId === s.id)?.imageUrl })),
    issues: captured.filter(r => ['failed', 'changed'].includes(r.status)).map(r => ({ id: r.id, status: r.status, errors: r.errors, changedPixels: r.changedPixels, screenshot: r.metrics ? r.imageUrl : undefined, baseline: r.baselineUrl, difference: r.diffUrl })),
    warnings: captured.filter(r => r.metrics?.warnings?.length).map(r => ({ id: r.id, warnings: r.metrics.warnings, screenshot: r.imageUrl })),
    typography: typographyMatrix(manifest, captured),
  };
}

// One compact "fitted px · % of layout filled" cell per screen and case lets
// agents compare sizing across devices without reading every screenshot.
export function typographyCell(result) {
  const t = result?.metrics?.typography;
  return t ? `${t.fontSize}px ${t.fill}%${result.metrics.warnings?.length ? ' !' : ''}` : null;
}

export function typographyMatrix(manifest, captured) {
  const results = new Map(captured.map(r => [r.id, r]));
  const columns = manifest.scenarios.map(s => s.id);
  const rows = manifest.screens.map(screen => ({ screen: screen.id, cells: Object.fromEntries(columns.map(id => [id, typographyCell(results.get(`${id}--${screen.id}`))])) }))
    .filter(row => Object.values(row.cells).some(Boolean));
  return { legend: 'fitted font px, % of layout height filled by Scripture, ! = warning', columns, rows };
}

export function formatTypography({ columns, rows }) {
  const label = id => id.replace('-sample', '').replace(/-qr-true$/, '+qr').replace(/-qr-false$/, '');
  const width = Math.max(...rows.map(row => row.screen.length)) + 2;
  const cell = Math.max(12, ...columns.map(id => label(id).length + 2));
  return [''.padEnd(width) + columns.map(id => label(id).padEnd(cell)).join(''),
    ...rows.map(row => row.screen.padEnd(width) + columns.map(id => (row.cells[id] ?? '–').padEnd(cell)).join(''))].join('\n');
}

export function contactSheetHtml(manifest, scenario, captured) {
  const results = new Map(captured.map(r => [r.screenId, r]));
  const title = `${scenario.language.toUpperCase()} · ${scenario.name} · QR ${scenario.options.fields.show_context_qr ? 'on' : 'off'}`;
  const sample = scenario.sample ? ` · ${scenario.sample.characters} characters · rank ${scenario.sample.rank}/${scenario.sample.poolSize}` : '';
  const cells = manifest.screens.map((screen, index) => {
    const result = results.get(screen.id);
    const row = index % 4 === 0 ? `<div class="row">${escapeHtml(screen.deviceName)}<span>${screen.orientation}</span></div>` : '';
    const image = result?.dataUrl ? `<img src="${result.dataUrl}" width="${screen.width}" height="${screen.height}" alt="${escapeHtml(screen.id)}">` : `<span>${result?.status === 'failed' ? 'Render failed' : 'Not captured'}</span>`;
    return `${row}<figure class="${result?.status ?? 'pending'}${result?.metrics?.warnings?.length ? ' warning' : ''}"><div class="image">${image}</div><figcaption>${screen.width} × ${screen.height}${typographyCell(result) ? ` · ${typographyCell(result)}` : ''}<strong>${result?.status ?? 'not captured'}</strong></figcaption></figure>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:24px;font:16px system-ui,sans-serif;background:#f0f3ef;color:#22271f}
    h1{font:28px Georgia,serif;margin:0 0 10px}p{margin:0 0 18px;color:#51584d}footer{margin-top:16px;font-size:14px;color:#51584d}
    .matrix{display:grid;grid-template-columns:180px repeat(4,minmax(0,1fr));gap:1px;background:#cdcfc4;border:1px solid #cdcfc4}
    .heading,.row{background:#e7ece3;padding:14px;font-weight:600}.row{display:flex;flex-direction:column;justify-content:center;gap:10px}.row span{font-weight:400}
    figure{margin:0;padding:14px;background:#fff}.image{height:280px;display:flex;justify-content:center;align-items:center}.image img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}
    figcaption{display:flex;justify-content:space-between;gap:12px;margin-top:12px;font-size:14px}.failed{background:#fbefec}.changed{background:#fcf3dd}.warning{box-shadow:inset 0 0 0 4px #d8a31a}
  </style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(scenario.expected?.reference ?? 'Recovery')} · ${escapeHtml(scenario.themes)}${sample}</p>
  <div class="matrix"><div class="heading">Device / orientation</div>${['Full', 'Half horizontal', 'Half vertical', 'Quadrant'].map(label => `<div class="heading">${label}</div>`).join('')}${cells}</div>
  <footer>Native renders scaled to fit each cell, so compare sizes using the px · % fill captions; ! = legibility or wasted-space warning · ${escapeHtml(manifest.framework)} · Source ${manifest.sourceHash.slice(0, 12)} · unreviewed = no visual baseline</footer></body></html>`;
}

export async function writeContactSheets(browser, manifest, captured, output) {
  const groups = new Map();
  for (const result of captured) {
    if (!groups.has(result.scenarioId)) groups.set(result.scenarioId, []);
    groups.get(result.scenarioId).push(result);
  }
  await mkdir(join(output, 'contact-sheets'), { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1840, height: 1200 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const sheets = [];
  try {
    const page = await context.newPage();
    for (const scenario of manifest.scenarios) {
      const results = groups.get(scenario.id);
      if (!results) continue;
      const images = await Promise.all(results.map(async r => ({ ...r, dataUrl: r.metrics ? `data:image/png;base64,${(await readFile(join(output, r.imageUrl))).toString('base64')}` : undefined })));
      await page.setContent(contactSheetHtml(manifest, scenario, images), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const imageUrl = `contact-sheets/${scenario.id}.png`;
      await page.screenshot({ path: join(output, imageUrl), fullPage: true, animations: 'disabled' });
      const sheet = { scenarioId: scenario.id, imageUrl, captured: results.length, total: manifest.screens.length };
      sheets.push(sheet);
      // Screenshot provenance travels with the exported image, including partial runs.
      await writeFile(join(output, 'contact-sheets', `${scenario.id}.json`), JSON.stringify({ ...sheet, sourceHash: manifest.sourceHash, reference: scenario.expected?.reference, sample: scenario.sample, inputs: scenario.options, renders: results.map(r => ({ id: r.id, image: r.imageUrl, environment: r.environment, capturedAt: r.capturedAt })) }, null, 2));
    }
  } finally { await context.close(); }
  return sheets;
}
