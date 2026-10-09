import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { nodeVault } from '../scripts/node-vault.js';
import { demoVaultPath } from '../scripts/fixtures.js';
import { demoTimes } from '../scripts/demo.js';

// The real plugin, bundled against a fake obsidian module so its push logic
// runs here: budgets, deduplication, secrets and error handling.
const fake = new URL('fake-obsidian.js', import.meta.url).href;
const output = fileURLToPath(new URL('../.cache/runtime-main.mjs', import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('../obsidian-plugin/src/main.js', import.meta.url))], bundle: true, outfile: output, format: 'esm', platform: 'node', external: ['obsidian', 'moment'], logLevel: 'error' });
await writeFile(output, (await readFile(output, 'utf8')).replaceAll('from "obsidian"', `from ${JSON.stringify(fake)}`));
const { default: TrmnlScreensPlugin } = await import(pathToFileURL(output).href);
const obsidian = await import(fake);

const UUID = '0f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
globalThis.window = globalThis;
globalThis.document = { hidden: false };

async function plugin({ secrets = { 'trmnl-daily': `https://trmnl.com/api/custom_plugins/${UUID}` }, data } = {}) {
  const source = await nodeVault(demoVaultPath, { times: demoTimes });
  const files = source.files().map(file => Object.assign(new obsidian.TFile(), { path: file.path, extension: 'md', stat: { mtime: file.mtime, ctime: file.ctime } }));
  const app = {
    vault: { getMarkdownFiles: () => files, getFileByPath: path => files.find(file => file.path === path) ?? null, cachedRead: file => source.read(file.path), getName: () => 'Demo vault', on: () => ({}) },
    workspace: { onLayoutReady: () => {} },
    secretStorage: { getSecret: id => secrets[id] ?? null },
    internalPlugins: { getPluginById: () => ({ instance: { options: { folder: 'Daily', format: 'YYYY-MM-DD' } } }) },
    plugins: { getPlugin: () => null, plugins: {} },
  };
  const instance = new TrmnlScreensPlugin(app, { id: 'trmnl-screens' });
  instance.data = data ?? null;
  await instance.onload();
  const daily = instance.settings.screens.find(entry => entry.type === 'daily_tasks');
  Object.assign(daily, { enabled: true, secret: 'trmnl-daily' });
  return { instance, daily };
}

test.afterEach(() => { obsidian.requests.length = 0; obsidian.responses.length = 0; obsidian.Notice.messages.length = 0; for (const timer of timers) clearTimeout(timer); timers.length = 0; });
const timers = [];
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => { const id = realSetTimeout(() => {}, 0); timers.push(id); return id; };

test('a push posts the screen to the webhook and records it without storing the URL', async () => {
  const { instance, daily } = await plugin();
  await instance.pushScreen(daily, { manual: true });
  assert.equal(obsidian.requests.length, 1);
  const [request] = obsidian.requests;
  assert.equal(request.url, `https://trmnl.com/api/custom_plugins/${UUID}`);
  assert.equal(request.method, 'POST');
  const { merge_variables } = JSON.parse(request.body);
  assert.equal(merge_variables.screen, 'daily_tasks');
  assert.equal(merge_variables.vault, 'Demo vault');
  assert.ok(!JSON.stringify(instance.data).includes(UUID));
  assert.match(instance.statusBarEl.text, /^TRMNL ✓ \d\d:\d\d · 11\/12$/);
});

test('unchanged data is not pushed again; a manual push still goes', async () => {
  const { instance, daily } = await plugin();
  await instance.pushScreen(daily);
  await instance.pushScreen(daily);
  assert.equal(obsidian.requests.length, 1);
  await instance.pushScreen(daily, { manual: true });
  assert.equal(obsidian.requests.length, 2);
});

test('the hourly limit holds pushes back instead of sending them', async () => {
  const { instance, daily } = await plugin();
  for (let push = 0; push < 14; push++) await instance.pushScreen(daily, { manual: true });
  assert.equal(obsidian.requests.length, 12);
  assert.equal(instance.status[daily.id].kind, 'pending');
  assert.match(instance.statusBarEl.text, /· 0\/12$/);
});

test('TRMNL errors are explained, and a missing webhook never sends', async () => {
  const { instance, daily } = await plugin();
  obsidian.responses.push(404);
  await instance.pushScreen(daily, { manual: true });
  assert.match(instance.status[daily.id].message, /does not recognise this webhook URL/);
  obsidian.responses.push('network');
  await instance.pushScreen(daily, { manual: true });
  assert.match(instance.status[daily.id].message, /could not reach TRMNL; retrying in a minute/);
  const bare = await plugin({ secrets: {} });
  await bare.instance.pushScreen(bare.daily, { manual: true });
  assert.equal(obsidian.requests.length, 2);
  assert.match(bare.instance.status[bare.daily.id].message, /add this screen’s TRMNL webhook URL/);
});

test('settings and state survive a reload', async () => {
  const { instance, daily } = await plugin();
  await instance.pushScreen(daily);
  const again = await plugin({ data: instance.data });
  assert.equal(again.instance.settings.screens.length, 6);
  assert.ok(again.instance.state.screens[daily.id].lastPush);
  await again.instance.pushScreen(again.daily);
  assert.equal(obsidian.requests.length, 1);
});
