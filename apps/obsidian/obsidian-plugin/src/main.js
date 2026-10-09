import { Plugin, Notice, Platform, moment, requestUrl, normalizePath } from 'obsidian';
import { VaultIndex } from './lib/vault-index.js';
import { LIMITS, WEBHOOK_BASE, webhookId, hash, remaining, nextSlot } from './lib/push.js';
import { prepare, isDue, context } from './prepare.js';
import { screens, screenTypes, newScreen } from './screens/index.js';
import { TrmnlSettingTab } from './settings-tab.js';
import { ScreenPicker, PayloadModal } from './modals.js';

export const DEFAULT_SETTINGS = { plus: false, tickMinutes: 15, debounceSeconds: 60, forceRefreshMinutes: 180, debug: false, screens: null };
const STARTUP_DELAY = 10000;
const RETRY_DELAY = 60000;

export default class TrmnlScreensPlugin extends Plugin {
  async onload() {
    const saved = await this.loadData() ?? {};
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
    this.settings.screens ??= screens.map(screen => newScreen(screen.type));
    this.state = { pushes: {}, screens: {}, ...saved.state };
    delete this.settings.state;
    this.status = {};
    this.timers = new Map();
    this.dirty = new Set();

    this.index = new VaultIndex({
      files: () => this.app.vault.getMarkdownFiles().map(file => ({ path: file.path, mtime: file.stat.mtime, ctime: file.stat.ctime })),
      file: path => {
        const file = this.app.vault.getFileByPath(normalizePath(path));
        return file?.extension === 'md' ? { path: file.path, mtime: file.stat.mtime, ctime: file.stat.ctime } : null;
      },
      read: path => {
        const file = this.app.vault.getFileByPath(normalizePath(path));
        if (!file) throw new Error(`Missing file: ${path}`);
        return this.app.vault.cachedRead(file);
      },
    });

    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass('mod-clickable');
    this.registerDomEvent(this.statusBar, 'click', () => this.openSettings());
    this.addSettingTab(new TrmnlSettingTab(this.app, this));

    this.addCommand({ id: 'push-all', name: 'Push all screens now', callback: () => this.pushAll({ manual: true }) });
    this.addCommand({ id: 'push-screen', name: 'Push one screen now…', callback: () => new ScreenPicker(this.app, this.settings.screens, entry => this.pushScreen(entry, { manual: true })).open() });
    this.addCommand({ id: 'preview-payload', name: 'Preview a screen’s data…', callback: () => new ScreenPicker(this.app, this.settings.screens, entry => this.previewScreen(entry)).open() });

    for (const event of ['modify', 'create', 'delete']) this.registerEvent(this.app.vault.on(event, file => this.changed(file.path)));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { this.changed(oldPath); this.changed(file.path); }));

    this.app.workspace.onLayoutReady(() => {
      this.later('startup', STARTUP_DELAY, () => this.pushAll());
      this.schedule();
    });
    this.updateStatusBar();
  }

  onunload() {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    window.clearInterval(this.interval);
  }

  async save() {
    await this.saveData({ ...this.settings, state: this.state });
  }

  get limits() { return this.settings.plus ? LIMITS.plus : LIMITS.standard; }

  // The periodic check. Changing its interval in settings calls this again.
  schedule() {
    window.clearInterval(this.interval);
    this.interval = window.setInterval(() => {
      // A backgrounded phone app should not wake to push; edits and startup still do.
      if (Platform.isMobile && document.hidden) return;
      this.pushAll();
    }, Math.max(5, this.settings.tickMinutes) * 60000);
    this.registerInterval(this.interval);
  }

  later(key, delay, callback) {
    window.clearTimeout(this.timers.get(key));
    this.timers.set(key, window.setTimeout(() => { this.timers.delete(key); callback(); }, delay));
  }

  // Edits are collected and pushed once the vault has been quiet for the
  // debounce period, to the screens they can affect.
  changed(path) {
    if (!path.endsWith('.md')) return;
    this.dirty.add(path);
    this.later('edits', this.settings.debounceSeconds * 1000, () => {
      const paths = [...this.dirty];
      this.dirty.clear();
      for (const entry of this.active()) {
        const screen = screenTypes[entry.type];
        const ctx = this.context(entry);
        if (!screen.affects || paths.some(path => screen.affects(path, ctx))) this.pushScreen(entry);
      }
    });
  }

  active() {
    return this.settings.screens.filter(entry => entry.enabled && screenTypes[entry.type]);
  }

  async pushAll({ manual = false } = {}) {
    const entries = this.active();
    if (manual && !entries.length) { new Notice('TRMNL Screens: turn on a screen and add its webhook URL in settings first.'); return; }
    for (const entry of entries) await this.pushScreen(entry, { manual });
  }

  dailyNotes() {
    const periodic = this.app.plugins?.getPlugin?.('periodic-notes')?.settings?.daily;
    if (periodic?.enabled) return { folder: periodic.folder ?? '', format: periodic.format || 'YYYY-MM-DD' };
    const core = this.app.internalPlugins?.getPluginById?.('daily-notes');
    const options = core?.instance?.options ?? {};
    return { folder: options.folder ?? '', format: options.format || 'YYYY-MM-DD' };
  }

  context(entry) {
    const screen = screenTypes[entry.type];
    const state = this.state.screens[entry.id] ??= {};
    return context({
      vault: this.index, moment, now: moment(), options: entry.options, defaults: screen.defaults,
      state: state.data ??= {}, dailyNotes: this.dailyNotes(), dataview: this.app.plugins?.plugins?.dataview?.api ?? null,
    });
  }

  async collect(entry) {
    const result = await prepare(screenTypes[entry.type], this.context(entry), { vault: this.app.vault.getName(), maxBytes: this.limits.bytes });
    if (result.error) console.error('TRMNL Screens:', entry.name, result.error);
    if (this.settings.debug) console.debug('TRMNL Screens:', entry.name, `${result.bytes} bytes`, result.data);
    return result;
  }

  async previewScreen(entry) {
    const result = await this.collect(entry);
    await this.save();
    new PayloadModal(this.app, entry, result, this.limits.bytes).open();
  }

  report(entry, status, manual) {
    this.status[entry.id] = { ...status, at: Date.now() };
    this.updateStatusBar();
    this.settingTab?.refreshStatus?.(entry.id);
    if (manual) new Notice(`TRMNL Screens · ${entry.name}: ${status.message}`);
  }

  async pushScreen(entry, { manual = false, retry = false } = {}) {
    const uuid = webhookId(entry.secret ? this.app.secretStorage.getSecret(entry.secret) : '');
    if (!uuid) { this.report(entry, { kind: 'error', message: 'add this screen’s TRMNL webhook URL in settings.' }, manual); return; }
    const state = this.state.screens[entry.id] ??= {};
    let result;
    try { result = await this.collect(entry); }
    catch (error) { this.report(entry, { kind: 'error', message: error.message }, manual); return; }
    const now = Date.now();
    if (!isDue({ hash: result.hash, lastHash: state.hash, lastPush: state.lastPush, now, forceMinutes: this.settings.forceRefreshMinutes, manual })) {
      await this.save();
      if (manual) this.report(entry, { kind: 'ok', message: 'nothing changed since the last push.' }, manual);
      return;
    }
    // Budgets are per webhook, keyed by a hash so the UUID is never stored.
    const key = hash(uuid);
    const pushes = this.state.pushes[key] = (this.state.pushes[key] ?? []).filter(time => time > now - 3600000);
    if (!remaining(pushes, now, this.limits.pushes)) {
      const at = nextSlot(pushes, now, this.limits.pushes);
      this.later(`retry:${entry.id}`, at - now + 1000, () => this.pushScreen(entry));
      this.report(entry, { kind: 'pending', message: `hourly limit reached; pushing at ${moment(at).format('HH:mm')}.` }, manual);
      await this.save();
      return;
    }
    pushes.push(now);
    let response;
    try {
      response = await requestUrl({ url: WEBHOOK_BASE + uuid, method: 'POST', contentType: 'application/json', body: result.body, throw: false });
    } catch (error) {
      response = { status: 0, error };
    }
    if (response.status >= 200 && response.status < 300) {
      Object.assign(state, { hash: result.hash, lastPush: now });
      this.report(entry, { kind: 'ok', message: `pushed ${result.bytes} bytes.` }, manual);
    } else if (response.status === 429) {
      this.later(`retry:${entry.id}`, nextSlot(pushes, now, 1) - now + 1000, () => this.pushScreen(entry));
      this.report(entry, { kind: 'pending', message: 'TRMNL’s rate limit was reached; trying again within the hour.' }, manual);
    } else if (response.status >= 400 && response.status < 500) {
      const message = response.status === 404 ? 'TRMNL does not recognise this webhook URL. Copy it again from the plugin’s settings on TRMNL.' : `TRMNL refused the push (${response.status}).`;
      this.report(entry, { kind: 'error', message }, manual);
    } else {
      if (!retry) this.later(`retry:${entry.id}`, RETRY_DELAY, () => this.pushScreen(entry, { retry: true }));
      this.report(entry, { kind: 'error', message: response.status ? `TRMNL had a problem (${response.status}); ${retry ? 'giving up until the next check' : 'retrying in a minute'}.` : `could not reach TRMNL; ${retry ? 'giving up until the next check' : 'retrying in a minute'}.` }, manual);
    }
    await this.save();
  }

  // "TRMNL 14:02 · 9/12": the last push and the pushes left this hour on the
  // busiest webhook.
  updateStatusBar() {
    const entries = this.active();
    if (!entries.length) { this.statusBar.setText('TRMNL ·'); this.statusBar.setAttr('aria-label', 'TRMNL Screens: no screens turned on'); return; }
    const now = Date.now();
    const keys = entries.map(entry => { const uuid = webhookId(entry.secret ? this.app.secretStorage.getSecret(entry.secret) : ''); return uuid && hash(uuid); }).filter(Boolean);
    const left = keys.length ? Math.min(...keys.map(key => remaining(this.state.pushes[key], now, this.limits.pushes))) : this.limits.pushes;
    const last = Math.max(0, ...entries.map(entry => this.state.screens[entry.id]?.lastPush ?? 0));
    const statuses = entries.map(entry => this.status[entry.id]).filter(Boolean);
    const mark = statuses.some(status => status.kind === 'error') ? '✗' : statuses.some(status => status.kind === 'pending') ? '⏳' : last ? '✓' : '·';
    this.statusBar.setText(`TRMNL ${mark}${last ? ` ${moment(last).format('HH:mm')}` : ''} · ${left}/${this.limits.pushes}`);
    const problems = entries.filter(entry => this.status[entry.id]?.kind !== 'ok' && this.status[entry.id]).map(entry => `${entry.name}: ${this.status[entry.id].message}`);
    this.statusBar.setAttr('aria-label', problems.length ? problems.join('\n') : `${left} of ${this.limits.pushes} pushes left this hour`);
  }

  openSettings() {
    this.app.setting?.open?.();
    this.app.setting?.openTabById?.(this.manifest.id);
  }
}
