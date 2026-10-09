// The slice of Obsidian's API the plugin's runtime uses, for tests. requestUrl
// records requests and answers with the status the test queues.
import moment from 'moment';

export { moment };
export const Platform = { isMobile: false };
export const requests = [];
export const responses = [];
export async function requestUrl(request) {
  requests.push(request);
  const status = responses.shift() ?? 200;
  if (status === 'network') throw new Error('offline');
  return { status, text: '' };
}
export class TFile {}
export const normalizePath = path => String(path).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
export class Notice { constructor(message) { Notice.messages.push(message); } static messages = []; }
class Element {
  constructor() { this.text = ''; this.attrs = {}; }
  setText(text) { this.text = text; } setAttr(name, value) { this.attrs[name] = value; } addClass() {}
}
export class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; this.data = null; }
  async loadData() { return this.data; }
  async saveData(data) { this.data = structuredClone(data); }
  addStatusBarItem() { return this.statusBarEl = new Element(); }
  registerDomEvent() {} addSettingTab() {} addCommand() {} registerEvent() {} registerInterval(id) { return id; }
}
export class PluginSettingTab {} export class Modal {} export class SuggestModal {} export class AbstractInputSuggest {}
export class Setting {} export class SecretComponent {}
