const byId = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const report = globalThis.REVIEW_REPORT;
const recorded = new Map((report?.captured ?? []).map(result => [result.id, result]));
let manifest, observer, generation = 0, running = 0, queue = [], complete = 0, failures = 0, changes = 0, unreviewed = 0, runAll = false;
const tiles = new Map();
const scenarioCounts = new Map();
const sizeModes = new Set(['responsive']);

function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function query(scenario, screen) { return new URLSearchParams({ mode: manifest.mode, source: manifest.sourceHash, scenario: scenario.id, screen: screen.id }); }
function showError(message) { byId('error').textContent = message; byId('error').hidden = false; }
function progress() {
  const results = report?.captured;
  byId('progress').textContent = results
    ? `${results.length} / ${report.selected} captured · ${results.filter(r => r.status === 'failed').length} failed · ${results.filter(r => r.status === 'changed').length} changed · ${results.filter(r => r.status === 'unreviewed').length} without baseline`
    : `${complete} / ${tiles.size} captured · ${failures} failed · ${changes} changed · ${unreviewed} without baseline`;
  byId('run-all').textContent = runAll && complete < tiles.size ? 'Checking entire suite…' : 'Check entire suite';
  byId('run-all').disabled = Boolean(report) || runAll && complete < tiles.size;
}
function enqueue(tile) { if (tile.dataset.state !== 'pending') return; tile.dataset.state = 'queued'; queue.push({ tile, generation }); pump(); }
function pump() {
  while (running < 4 && queue.length) {
    const job = queue.shift();
    if (job.generation !== generation) continue;
    running++;
    capture(job).finally(() => { running--; pump(); });
  }
}
async function capture({ tile, generation: started }) {
  const { scenario, screen } = tiles.get(tile.dataset.case);
  tile.dataset.state = 'loading'; tile.querySelector('.placeholder').textContent = 'Rendering…';
  try {
    const response = report ? null : await fetch('/review/capture?' + query(scenario, screen));
    const result = report ? recorded.get(tile.dataset.case) : await response.json();
    if (started !== generation) return;
    if (report && !result) { tile.dataset.state = 'pending'; tile.querySelector('.placeholder').textContent = 'Outside this run'; tile.querySelector('.tile-status').textContent = 'Not captured'; return; }
    if (response && !response.ok) throw new Error(result.error ?? 'Capture failed. Reload source to retry.');
    tile.dataset.state = result.status;
    const preview = tile.querySelector('.preview-image');
    preview.replaceChildren();
    if (result.metrics) {
      const image = node('img'); image.src = result.imageUrl; image.alt = `${scenario.language.toUpperCase()} · ${scenario.expected?.reference ?? 'Recovery'} · ${screen.deviceName} · ${screen.orientation} · ${screen.viewLabel}`;
      image.width = screen.width; image.height = screen.height; image.loading = 'lazy';
      image.addEventListener('error', () => { preview.replaceChildren(node('span', 'Screenshot unavailable. Reload source to retry.', 'placeholder')); tile.dataset.state = 'failed'; showError('A screenshot could not load. Reload source to retry.'); });
      preview.append(image);
    } else preview.append(node('span', 'Render failed', 'placeholder'));
    const status = tile.querySelector('.tile-status');
    status.textContent = { passed: 'Passed', failed: 'Failed', changed: 'Changed', unreviewed: 'No baseline' }[result.status];
    status.className = `tile-status status-${result.status}`;
    const details = node('details'); details.append(node('summary', result.errors.length ? 'Failure' : result.status === 'changed' ? 'Compare' : 'Checks'));
    details.append(node('p', result.layoutPassed ? 'Layout checks passed.' : result.errors.join(' ')));
    if (result.status === 'unreviewed') details.append(node('p', 'No reviewed screenshot baseline exists for this browser environment.'));
    if (result.changedPixels !== null) details.append(node('p', `${result.changedPixels} changed pixels.`));
    const links = node('div', undefined, 'evidence-links');
    for (const [label, href] of [[report ? 'Native screenshot' : 'Native render', report ? result.imageUrl : '/review/render?' + query(scenario, screen)], ['Screenshot', result.metrics ? result.imageUrl : null], ['Baseline', result.baselineUrl], ['Difference', result.diffUrl]]) {
      if (!href) continue; const link = node('a', label); link.href = href; link.target = '_blank'; link.rel = 'noopener'; links.append(link);
    }
    details.append(links); tile.querySelector('figcaption').append(details);
    complete++; failures += Number(result.status === 'failed'); changes += Number(result.status === 'changed'); unreviewed += Number(result.status === 'unreviewed');
    const count = scenarioCounts.get(scenario.id); count.done++; count.failed += Number(['failed', 'changed'].includes(result.status));
    count.label.textContent = `${count.done} / 24 captured${count.failed ? ` · ${count.failed} need review` : ''}`;
  } catch (error) {
    if (started !== generation) return;
    tile.dataset.state = 'failed'; tile.querySelector('.placeholder').textContent = 'Capture unavailable';
    tile.querySelector('.tile-status').textContent = 'Failed';
    const detail = node('p', error.message, 'status-failed'); tile.append(detail); complete++; failures++;
    const count = scenarioCounts.get(scenario.id); count.done++; count.failed++;
    count.label.textContent = `${count.done} / 24 captured · ${count.failed} need review`;
    showError(error.message);
  }
  progress();
}

function filter() {
  const text = byId('search').value.toLocaleLowerCase();
  let visible = 0;
  for (const section of byId('board').children) { section.hidden = !section.dataset.search.includes(text); visible += Number(!section.hidden); }
  byId('empty').hidden = visible !== 0;
}

async function load() {
  const current = ++generation;
  observer?.disconnect(); queue = []; tiles.clear(); scenarioCounts.clear(); complete = failures = changes = unreviewed = 0; runAll = false;
  byId('reload').disabled = true; byId('error').hidden = true; byId('board').replaceChildren(); byId('scope').textContent = 'Loading cases…';
  try {
    const response = report ? null : await fetch('/review/manifest?mode=' + byId('suite').value);
    if (response && !response.ok) { const error = await response.json(); throw new Error(error.error); }
    const loaded = report ?? await response.json(); if (current !== generation) return; manifest = loaded;
    byId('plugin-name').textContent = `${manifest.name} · All screens, together`;
    let scenarios = params.has('scenario') ? manifest.scenarios.filter(scenario => scenario.id === params.get('scenario')) : manifest.scenarios;
    if (report) { const needsReview = new Set(report.captured.filter(r => ['failed', 'changed'].includes(r.status)).map(r => r.scenarioId)); scenarios = scenarios.sort((a, b) => Number(needsReview.has(b.id)) - Number(needsReview.has(a.id))); }
    byId('scope').textContent = `${scenarios.length} ${scenarios.length === 1 ? 'case' : 'cases'} × 24 screens · Framework ${manifest.framework} · Source ${manifest.sourceHash.slice(0, 10)}`;
    byId('results-link').href = report ? 'results.json' : '/review/results?' + new URLSearchParams({ mode: manifest.mode, source: manifest.sourceHash });
    byId('summary-link').href = report ? 'summary.json' : '/review/summary?' + new URLSearchParams({ mode: manifest.mode, source: manifest.sourceHash });
    byId('case-index').replaceChildren();
    if (sizeModes.has(manifest.mode) && scenarios.length <= 18) for (const scenario of scenarios) {
      const link = node('a', scenario.sample ? `${scenario.language.toUpperCase()} ${scenario.sample.kind} · ${scenario.options.fields.show_context_qr === undefined ? scenario.fixture ?? '' : `QR ${scenario.options.fields.show_context_qr ? 'on' : 'off'}`}` : scenario.name); link.href = `#${scenario.id}`; byId('case-index').append(link);
    }
    byId('case-index').hidden = !byId('case-index').children.length;
    observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) enqueue(entry.target); }, { rootMargin: '250px' });
    for (const scenario of scenarios) {
      const section = node('article', undefined, 'scenario'); section.id = scenario.id;
      section.dataset.search = `${scenario.language} ${scenario.translation} ${scenario.name} ${scenario.themes} ${scenario.expected?.reference ?? ''} qr ${scenario.options.fields.show_context_qr ? 'on' : 'off'}`.toLocaleLowerCase();
      const head = node('div', undefined, 'scenario-head');
      const title = node('div'); title.append(node('h2', `${scenario.language.toUpperCase()} · ${scenario.name}`));
      const date = new Date((scenario.options.timestamp + scenario.options.utcOffset) * 1000).toISOString().replace('T', ' ').slice(0, 16);
      const offset = scenario.options.utcOffset / 3600;
      title.append(node('p', `${scenario.expected?.reference ?? (scenario.fixture ? scenario.name : 'Recovery message')} · ${scenario.themes} · ${scenario.options.fields.show_context_qr === undefined ? scenario.fixture ?? '' : `QR ${scenario.options.fields.show_context_qr ? 'on' : 'off'}`} · ${date} UTC${offset >= 0 ? '+' : ''}${offset}`, 'case-meta'));
      if (scenario.sample) title.append(node('p', `${scenario.sample.characters} characters · ${scenario.sample.words} words · Length rank ${scenario.sample.rank} of ${scenario.sample.poolSize}${scenario.sample.kind === 'median' ? ' · Middle passage by character count' : ''}`, 'sample-meta'));
      const sheet = report?.contactSheets?.find(sheet => sheet.scenarioId === scenario.id);
      if (sheet) { const link = node('a', 'Contact sheet · 24 screens'); link.href = sheet.imageUrl; link.target = '_blank'; link.rel = 'noopener'; title.append(link); }
      const count = node('span', '0 / 24 captured', 'scenario-status'); scenarioCounts.set(scenario.id, { done: 0, failed: 0, label: count }); head.append(title, count); section.append(head);
      const scroll = node('div', undefined, 'matrix-scroll'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', `${scenario.language} ${scenario.name} screen matrix`);
      const matrix = node('div', undefined, 'matrix'); matrix.append(node('div', 'Device / orientation', 'column-label'));
      for (const label of ['Full', 'Half horizontal', 'Half vertical', 'Quadrant']) matrix.append(node('div', label, 'column-label'));
      let deviceRow;
      for (const [index, screen] of manifest.screens.entries()) {
        if (index % 4 === 0) { deviceRow = node('div', undefined, 'device-row'); const label = node('h3', screen.deviceName, 'row-label'); label.append(node('span', screen.orientation)); deviceRow.append(label); matrix.append(deviceRow); }
        const id = `${scenario.id}--${screen.id}`;
        const tile = node('figure', undefined, 'tile'); tile.dataset.case = id; tile.dataset.state = 'pending';
        const preview = node('div', undefined, 'preview-image'); preview.append(node('span', 'Not captured', 'placeholder')); tile.append(preview);
        const caption = node('figcaption'); caption.append(node('span', screen.viewLabel, 'view-label'), node('span', `${screen.width} × ${screen.height}`), node('span', 'Pending', 'tile-status')); tile.append(caption);
        deviceRow.append(tile); tiles.set(id, { tile, scenario, screen }); observer.observe(tile);
      }
      scroll.append(matrix); section.append(scroll); byId('board').append(section);
    }
    filter(); progress();
  } catch (error) { showError(error.message); byId('scope').textContent = 'Review unavailable'; }
  finally { byId('reload').disabled = Boolean(report); }
}

byId('suite').value = report?.mode ?? (['responsive', 'curated', 'passages'].includes(params.get('mode')) ? params.get('mode') : 'responsive');
byId('suite').addEventListener('change', () => { params.delete('scenario'); params.set('mode', byId('suite').value); history.replaceState(null, '', '?' + params); load(); });
byId('reload').addEventListener('click', load);
byId('scale').addEventListener('change', () => { document.body.classList.toggle('readable', byId('scale').value !== 'overview'); document.body.classList.toggle('large', byId('scale').value === 'large'); });
byId('search').addEventListener('input', filter);
byId('run-all').addEventListener('click', () => { runAll = true; for (const { tile } of tiles.values()) enqueue(tile); progress(); });
load();
if (report) {
  byId('suite').value = report.mode;
  byId('suite').disabled = byId('reload').disabled = byId('run-all').disabled = true;
  byId('note').textContent = `Saved report · ${report.completed} / ${report.total} captures · ${report.generatedAt}. This report does not change with source edits.`;
  document.querySelector('nav a').href = 'http://127.0.0.1:4567/preview';
}
// Stop obsolete captures when templates/content change on disk.
if (!report) setInterval(async () => {
  if (!manifest || document.hidden) return;
  try {
    const response = await fetch('/review/manifest?mode=curated');
    const latest = await response.json();
    if (response.ok && latest.sourceHash !== manifest.sourceHash) { generation++; observer?.disconnect(); queue = []; byId('run-all').disabled = true; showError('Source changed. Reload source to capture the current files.'); }
  } catch { /* Keep the existing evidence when the server is restarting. */ }
}, 15000);
