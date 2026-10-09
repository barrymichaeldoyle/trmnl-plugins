import { Modal, SuggestModal } from 'obsidian';
import { screenTypes } from './screens/index.js';

export class ScreenPicker extends SuggestModal {
  constructor(app, entries, choose) {
    super(app);
    this.entries = entries;
    this.choose = choose;
    this.setPlaceholder('Choose a screen');
  }

  getSuggestions(query) {
    const text = query.toLowerCase();
    return this.entries.filter(entry => entry.name.toLowerCase().includes(text));
  }

  renderSuggestion(entry, el) {
    el.createDiv({ text: entry.name });
    el.createEl('small', { text: `${screenTypes[entry.type]?.name ?? entry.type}${entry.enabled ? '' : ' · off'}` });
  }

  onChooseSuggestion(entry) { this.choose(entry); }
}

// What a push would send, without sending it: useful before a webhook exists.
export class PayloadModal extends Modal {
  constructor(app, entry, result, limit) {
    super(app);
    this.entry = entry;
    this.result = result;
    this.limit = limit;
  }

  onOpen() {
    this.setTitle(`${this.entry.name}: data for TRMNL`);
    const { contentEl } = this;
    contentEl.createEl('p', { text: `${this.result.bytes} of ${this.limit} bytes. This is what the next push sends as merge variables.` });
    const pre = contentEl.createEl('pre');
    pre.createEl('code', { text: JSON.stringify(JSON.parse(this.result.body).merge_variables, null, 2) });
  }

  onClose() { this.contentEl.empty(); }
}
