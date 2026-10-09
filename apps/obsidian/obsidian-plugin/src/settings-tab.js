import { PluginSettingTab, Setting, SecretComponent, AbstractInputSuggest, moment } from 'obsidian';
import { screens, screenTypes, newScreen } from './screens/index.js';

const SETUP_URL = 'https://github.com/barrymichaeldoyle/obsidian-trmnl-screens#setup';
const folders = value => String(value).split(',').map(folder => folder.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);

class NoteSuggest extends AbstractInputSuggest {
  constructor(app, input, choose) { super(app, input); this.choose = choose; }
  getSuggestions(query) {
    const text = query.toLowerCase();
    return this.app.vault.getMarkdownFiles().filter(file => file.path.toLowerCase().includes(text)).slice(0, 30);
  }
  renderSuggestion(file, el) { el.setText(file.path); }
  selectSuggestion(file) { this.setValue(file.path); this.choose(file.path); this.close(); }
}

export class TrmnlSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.statusEls = new Map();
    plugin.settingTab = this;
  }

  refreshStatus(id) {
    const el = this.statusEls.get(id);
    if (el) el.setText(this.statusText(id));
  }

  statusText(id) {
    const status = this.plugin.status[id];
    const last = this.plugin.state.screens[id]?.lastPush;
    const pushed = last ? `Last pushed ${moment(last).format('D MMM HH:mm')}.` : 'Not pushed yet.';
    return status && status.kind !== 'ok' ? `${pushed} ${status.message.charAt(0).toUpperCase()}${status.message.slice(1)}` : pushed;
  }

  display() {
    const { containerEl, plugin } = this;
    const save = async () => { await plugin.save(); plugin.updateStatusBar(); };
    containerEl.empty();
    this.statusEls.clear();

    const intro = containerEl.createEl('p');
    intro.appendText('Each screen pushes to one TRMNL plugin. Install the Obsidian Screens recipe on TRMNL once per screen, then paste that plugin’s webhook URL here. ');
    intro.createEl('a', { text: 'Setup guide', href: SETUP_URL });

    new Setting(containerEl).setName('TRMNL+').setDesc('TRMNL+ allows 30 pushes an hour and 10 KB per push instead of 12 and 5 KB.')
      .addToggle(toggle => toggle.setValue(plugin.settings.plus).onChange(async value => { plugin.settings.plus = value; await save(); }));
    new Setting(containerEl).setName('Check every').setDesc('How often screens are rebuilt without an edit, for example when the date changes.')
      .addDropdown(dropdown => dropdown.addOptions({ 5: '5 minutes', 15: '15 minutes', 30: '30 minutes', 60: '1 hour' }).setValue(String(plugin.settings.tickMinutes))
        .onChange(async value => { plugin.settings.tickMinutes = Number(value); plugin.schedule(); await save(); }));
    new Setting(containerEl).setName('Wait after edits').setDesc('Push once the vault has been quiet this long, so typing does not spend the hourly limit.')
      .addDropdown(dropdown => dropdown.addOptions({ 30: '30 seconds', 60: '1 minute', 120: '2 minutes', 300: '5 minutes' }).setValue(String(plugin.settings.debounceSeconds))
        .onChange(async value => { plugin.settings.debounceSeconds = Number(value); await save(); }));
    new Setting(containerEl).setName('Resend unchanged screens after').setDesc('A screen whose data has not changed is only pushed again to refresh its update time.')
      .addDropdown(dropdown => dropdown.addOptions({ 60: '1 hour', 180: '3 hours', 360: '6 hours', 720: '12 hours' }).setValue(String(plugin.settings.forceRefreshMinutes))
        .onChange(async value => { plugin.settings.forceRefreshMinutes = Number(value); await save(); }));
    new Setting(containerEl).setName('Log data to the console').setDesc('Writes each screen’s data and size to the developer console.')
      .addToggle(toggle => toggle.setValue(plugin.settings.debug).onChange(async value => { plugin.settings.debug = value; await save(); }));

    for (const entry of plugin.settings.screens) this.screenSection(containerEl, entry, save);

    let type = screens[0].type;
    new Setting(containerEl).setName('Add a screen').setDesc('Add another screen, for example a second pinned note.')
      .addDropdown(dropdown => dropdown.addOptions(Object.fromEntries(screens.map(screen => [screen.type, screen.name]))).setValue(type).onChange(value => { type = value; }))
      .addButton(button => button.setButtonText('Add').onClick(async () => { plugin.settings.screens.push(newScreen(type, plugin.settings.screens)); await save(); this.display(); }));
  }

  screenSection(containerEl, entry, save) {
    const { plugin, app } = this;
    const screen = screenTypes[entry.type];
    if (!screen) return;
    const options = entry.options;
    const set = key => async value => { options[key] = value; await save(); };

    new Setting(containerEl).setName(entry.name).setHeading()
      .addToggle(toggle => toggle.setTooltip('Push this screen').setValue(entry.enabled).onChange(async value => { entry.enabled = value; await save(); if (value) plugin.pushScreen(entry); }))
      .addExtraButton(button => button.setIcon('trash').setTooltip('Remove this screen').onClick(async () => {
        plugin.settings.screens = plugin.settings.screens.filter(other => other !== entry);
        delete plugin.state.screens[entry.id];
        await save();
        this.display();
      }));
    containerEl.createEl('p', { text: screen.description, cls: 'setting-item-description' });
    new Setting(containerEl).setName('Name').setDesc('How this screen is listed in Obsidian.')
      .addText(text => text.setValue(entry.name).onChange(async value => { entry.name = value.trim() || screen.name; await save(); }));
    new Setting(containerEl).setName('Webhook URL').setDesc('Kept in Obsidian’s secret storage, never in the vault. Choose or create a secret holding the webhook URL from the TRMNL plugin’s settings.')
      .addComponent(el => new SecretComponent(app, el).setValue(entry.secret).onChange(async value => { entry.secret = value ?? ''; await save(); }));

    switch (entry.type) {
      case 'daily_tasks':
        new Setting(containerEl).setName('Show completed tasks')
          .addToggle(toggle => toggle.setValue(options.includeCompleted).onChange(set('includeCompleted')));
        new Setting(containerEl).setName('Group by heading')
          .addToggle(toggle => toggle.setValue(options.groupByHeading).onChange(set('groupByHeading')));
        break;
      case 'due_tasks':
        new Setting(containerEl).setName('Look ahead').setDesc('Upcoming tasks shown after overdue and today’s.')
          .addDropdown(dropdown => dropdown.addOptions({ 0: 'Today only', 1: '1 day', 3: '3 days', 7: '7 days', 14: '14 days', 30: '30 days' }).setValue(String(options.lookaheadDays)).onChange(async value => set('lookaheadDays')(Number(value))));
        this.folderSettings(containerEl, options, set);
        break;
      case 'dataview_query':
        new Setting(containerEl).setName('Title')
          .addText(text => text.setValue(options.title).onChange(set('title')));
        new Setting(containerEl).setName('Dataview query').setDesc('A TABLE or LIST query in Dataview’s query language.')
          .addTextArea(area => { area.inputEl.rows = 4; area.setValue(options.query).onChange(set('query')); });
        break;
      case 'resurface':
        new Setting(containerEl).setName('Prefer older notes').setDesc('Notes left untouched the longest are likelier picks.')
          .addToggle(toggle => toggle.setValue(options.weighting === 'stale').onChange(async value => set('weighting')(value ? 'stale' : 'uniform')));
        new Setting(containerEl).setName('New note every')
          .addDropdown(dropdown => dropdown.addOptions({ 6: '6 hours', 12: '12 hours', 24: 'Day', 168: 'Week' }).setValue(String(options.rotateHours)).onChange(async value => set('rotateHours')(Number(value))));
        new Setting(containerEl).setName('Skip daily notes')
          .addToggle(toggle => toggle.setValue(options.skipDailyNotes).onChange(set('skipDailyNotes')));
        this.folderSettings(containerEl, options, set);
        break;
      case 'writing_stats':
        new Setting(containerEl).setName('Days in the chart')
          .addDropdown(dropdown => dropdown.addOptions({ 7: '7 days', 14: '14 days' }).setValue(String(options.historyDays)).onChange(async value => set('historyDays')(Number(value))));
        new Setting(containerEl).setName('Ignore folders').setDesc('Comma-separated folders left out of word counts.')
          .addText(text => text.setValue(options.excludeFolders.join(', ')).onChange(async value => set('excludeFolders')(folders(value))));
        break;
      case 'pinned_note':
        new Setting(containerEl).setName('Note')
          .addSearch(search => { search.setValue(options.path).onChange(set('path')); new NoteSuggest(app, search.inputEl, set('path')); });
        break;
    }

    const actions = new Setting(containerEl).setName('Status');
    this.statusEls.set(entry.id, actions.descEl);
    actions.setDesc(this.statusText(entry.id))
      .addButton(button => button.setButtonText('Preview').onClick(() => plugin.previewScreen(entry)))
      .addButton(button => button.setButtonText('Push now').setCta().onClick(() => plugin.pushScreen(entry, { manual: true })));
  }

  folderSettings(containerEl, options, set) {
    new Setting(containerEl).setName('Only folders').setDesc('Comma-separated. Leave empty for the whole vault.')
      .addText(text => text.setValue(options.includeFolders.join(', ')).onChange(async value => set('includeFolders')(folders(value))));
    new Setting(containerEl).setName('Ignore folders').setDesc('Comma-separated.')
      .addText(text => text.setValue(options.excludeFolders.join(', ')).onChange(async value => set('excludeFolders')(folders(value))));
  }
}
