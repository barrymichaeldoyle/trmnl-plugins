import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Liquid } from 'liquidjs';
import YAML from 'yaml';
import { zipSync, strToU8 } from 'fflate';
import { runInNewContext } from 'node:vm';
import QRCode from 'qrcode';

export const views = ['full', 'half_horizontal', 'half_vertical', 'quadrant'];
export const sizes = { full: [800, 480], half_horizontal: [800, 240], half_vertical: [400, 480], quadrant: [400, 240] };
// Geometry from the pinned framework's device profiles, in CSS pixels.
export const devices = {
  og: { name: 'TRMNL OG', width: 800, height: 480, ratio: 1, classes: 'screen--og screen--md screen--1bit' },
  ogv2: { name: 'TRMNL OG · 2-bit', width: 800, height: 480, ratio: 1, classes: 'screen--ogv2 screen--md screen--2bit' },
  v2: { name: 'TRMNL X', width: 1040, height: 780, ratio: 1.8, classes: 'screen--v2 screen--lg screen--density-2x screen--4bit' },
};
export function previewDevice(model = 'og', portrait = false) {
  const profile = devices[model];
  if (!profile) throw new Error(`Unknown device: ${model}`);
  return { ...profile, model, portrait, width: portrait ? profile.height : profile.width, height: portrait ? profile.width : profile.height };
}
export const engine = new Liquid({ strictFilters: true, timezoneOffset: 0 });
engine.registerFilter('base64_encode', value => Buffer.from(String(value)).toString('base64'));
// Local equivalent of TRMNL's native qr_code filter. Production supplies it.
engine.registerFilter('qr_code', async (value, size = 11, level = 'h') => {
  const correction = ['l', 'm', 'q', 'h'].includes(String(level).toLowerCase()) ? String(level).toUpperCase() : 'H';
  return (await QRCode.toString(String(value), { type: 'svg', margin: 0, errorCorrectionLevel: correction })).replace('<svg ', '<svg class="qr-code" ');
});
export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export async function loadPlugin(directory) {
  const root = resolve(directory);
  const config = JSON.parse(await readFile(join(root, 'plugin.config.json'), 'utf8'));
  const settings = YAML.parse(await readFile(join(root, 'src/settings.yml'), 'utf8'));
  const data = JSON.parse(await readFile(join(root, config.data), 'utf8'));
  if (config.translations) {
    data.translations = Object.fromEntries(await Promise.all(Object.entries(config.translations).map(async ([language, path]) => {
      const collection = JSON.parse(await readFile(join(root, path), 'utf8'));
      if (collection.translation?.language !== language || !Array.isArray(collection.verses) || !collection.verses.length) throw new Error(`Invalid ${language} Scripture collection.`);
      return [language, collection];
    })));
  }
  let transform;
  try { transform = await readFile(join(root, 'src/transform.js'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const shared = await readFile(join(root, 'src/shared.liquid'), 'utf8');
  const templates = Object.fromEntries(await Promise.all(views.map(async view => [view, shared + '\n' + await readFile(join(root, `src/${view}.liquid`), 'utf8')])));
  const defaults = Object.fromEntries((settings.custom_fields ?? []).filter(field => field.default !== undefined).map(field => [field.keyname, field.default]));
  return { root, config, settings, data, transform, templates, defaults };
}

export function contextFor(plugin, { fields = {}, timestamp = Date.now() / 1000, utcOffset = plugin.config.preview?.utc_offset ?? 0, instanceName = plugin.settings.name, data = plugin.data, model = 'og', portrait = false } = {}) {
  if (!Number.isFinite(Number(timestamp)) || !Number.isFinite(Number(utcOffset))) throw new Error('Preview time and UTC offset must be numbers.');
  return {
    ...data,
    trmnl: {
      system: { timestamp_utc: Math.floor(Number(timestamp)) },
      user: { utc_offset: Number(utcOffset), locale: 'en' },
      device: { ...previewDevice(model, portrait), bit_depth: model === 'v2' ? 4 : model === 'ogv2' ? 2 : 1 },
      plugin_settings: { instance_name: instanceName, custom_fields_values: { ...plugin.defaults, ...fields } },
    },
  };
}

export async function renderView(plugin, view, options = {}) {
  if (!views.includes(view)) throw new Error(`Unknown view: ${view}`);
  const context = contextFor(plugin, options);
  const data = runTransform(plugin, context);
  return engine.parseAndRender(plugin.templates[view], { ...data, trmnl: context.trmnl });
}

export function runTransform(plugin, context) {
  if (!plugin.transform) return context;
  const timestamp = context.trmnl.system.timestamp_utc * 1000;
  class PreviewDate extends Date {
    constructor(...args) { super(...(args.length ? args : [timestamp])); }
    static now() { return timestamp; }
  }
  // Production withholds trmnl.system from transforms; reproduce that contract.
  const { system, ...globals } = context.trmnl;
  const input = structuredClone({ ...context, trmnl: globals });
  const result = runInNewContext(`${plugin.transform}\ntransform(input)`, { input, Date: PreviewDate }, { timeout: 1000 });
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('A plugin transform must return a data object.');
  return result;
}

export function screenHtml(markup, view, version = '3.4.0', localAssets = false, deviceOptions = {}) {
  if (!views.includes(view) || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid view or framework version.');
  // Production supplies screen/view wrappers. Only local previews add them.
  const positions = { full: 'view--full', half_horizontal: 'view--half_horizontal', half_vertical: 'view--half_vertical', quadrant: 'view--quadrant' };
  const css = localAssets ? `/framework/${version}/plugins.css` : `https://trmnl.com/css/${version}/plugins.css`;
  const js = localAssets ? `/framework/${version}/plugins.js` : `https://trmnl.com/js/${version}/plugins.js`;
  const content = `<div class="view ${positions[view]}">${markup}</div>`;
  const composition = { half_horizontal: 'mashup--1Tx1B', half_vertical: 'mashup--1Lx1R', quadrant: 'mashup--2x2' };
  const inner = view === 'full' ? content : `<div class="mashup ${composition[view]}">${content}</div>`;
  const device = previewDevice(deviceOptions.model, deviceOptions.portrait);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TRMNL ${escapeHtml(view)} preview</title><link rel="stylesheet" href="${css}"><script src="${js}" defer></script><style>html,body{margin:0;padding:0;background:white}</style></head><body class="trmnl"><div class="screen ${device.classes}${device.portrait ? ' screen--portrait' : ''}">${inner}</div></body></html>`;
}

export async function checkPlugin(plugin) {
  if (!plugin.settings.name || plugin.settings.strategy !== 'static') throw new Error('This tool currently supports named static recipes.');
  if (!Array.isArray(plugin.settings.custom_fields)) throw new Error('custom_fields must be an array.');
  for (const [view, template] of Object.entries(plugin.templates)) {
    const frameworkMarkup = template.replace(/<style data-plugin-style="([\w-]+)">[\s\S]*?<\/style>/g, (block, name) =>
      plugin.config.allowed_style_blocks?.includes(name) ? '' : block);
    if (/<style\b|\sstyle\s*=/.test(frameworkMarkup)) throw new Error(`${view}: use TRMNL framework classes instead of custom styles.`);
    if (/class=["'][^"']*\b(screen|view)\b/.test(template)) throw new Error(`${view}: TRMNL supplies screen/view wrappers.`);
    if (Buffer.byteLength(template) > 1024 * 1024) throw new Error(`${view}: template exceeds TRMNL's 1 MB limit.`);
    const rendered = await renderView(plugin, view);
    if (!rendered.includes('class="layout') || !rendered.includes('class="title_bar"')) throw new Error(`${view}: missing layout/title_bar.`);
  }
  return true;
}

// TRMNL rejects settings.yml and transform.js files over about 100 KB. With
// bundle_data_in_transform, translations that do not fit in static data are
// bundled in the transform as SCRIPTURE.translations, which it merges back.
export const settingsLimit = 100 * 1000;
const packingBudget = 90 * 1000;

export function exportFiles(plugin) {
  const { translations = {}, ...primary } = plugin.data;
  const staticTranslations = {};
  const bundled = {};
  const settingsFor = data => YAML.stringify({ ...plugin.settings, static_data: JSON.stringify(data) });
  for (const [language, collection] of Object.entries(translations)) {
    const candidate = { ...primary, translations: { ...staticTranslations, [language]: collection } };
    if (!plugin.config.bundle_data_in_transform || Buffer.byteLength(settingsFor(candidate)) <= packingBudget) staticTranslations[language] = collection;
    else bundled[language] = collection;
  }
  const staticData = Object.keys(translations).length ? { ...primary, translations: staticTranslations } : primary;
  const transform = plugin.transform && Object.keys(bundled).length ? `const SCRIPTURE = ${JSON.stringify({ translations: bundled })};\n${plugin.transform}` : plugin.transform;
  // Inline shared code into each view: compatible with TRMNL's flat ZIP format,
  // including importers that do not understand a separate shared.liquid file.
  const files = { 'settings.yml': settingsFor(staticData), ...Object.fromEntries(views.map(view => [`${view}.liquid`, plugin.templates[view]])), ...(transform ? { 'transform.js': transform } : {}) };
  for (const name of ['settings.yml', 'transform.js']) {
    const size = files[name] ? Buffer.byteLength(files[name]) : 0;
    if (size > settingsLimit) throw new Error(`${name} is ${Math.round(size / 1000)} KB; TRMNL rejects files over ${settingsLimit / 1000} KB.${name === 'settings.yml' ? ' Set bundle_data_in_transform in plugin.config.json.' : ''}`);
  }
  return files;
}

export async function buildPlugin(plugin) {
  await checkPlugin(plugin);
  const output = join(plugin.root, 'dist');
  await mkdir(join(output, 'preview'), { recursive: true });
  const files = exportFiles(plugin);
  for (const [name, contents] of Object.entries(files)) await writeFile(join(output, name), contents);
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, strToU8(contents)])));
  const zipPath = join(output, `${plugin.config.slug}.zip`);
  await writeFile(zipPath, zip);
  for (const view of views) await writeFile(join(output, 'preview', `${view}.html`), screenHtml(await renderView(plugin, view), view, plugin.settings.framework_version));
  return zipPath;
}
