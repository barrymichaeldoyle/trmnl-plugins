import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { DEMO_NOW, DEMO_TIME_ZONE, demoTimes, demoWritingState, demoDataview } from './demo.js';
import { nodeVault } from './node-vault.js';
import { memoryVault } from './memory-vault.js';

process.env.TZ = DEMO_TIME_ZONE;
const { default: moment } = await import('moment');
const { VaultIndex } = await import('../obsidian-plugin/src/lib/vault-index.js');
const { splitFrontmatter } = await import('../obsidian-plugin/src/lib/markdown.js');
const { prepare, context } = await import('../obsidian-plugin/src/prepare.js');
const { screenTypes } = await import('../obsidian-plugin/src/screens/index.js');

export const demoVaultPath = fileURLToPath(new URL('../demo-vault', import.meta.url));
export const demoDailyNotes = { folder: 'Daily', format: 'YYYY-MM-DD' };
export { moment };

// One screen's merge_variables, exactly as the plugin would push them.
export async function payload(type, source, { options = {}, state = {}, dataview = null, now = DEMO_NOW, maxBytes = 5000, random = () => 0.5 } = {}) {
  const screen = screenTypes[type];
  const vault = source instanceof VaultIndex ? source : new VaultIndex(source);
  const ctx = context({ vault, moment, now: moment(now), options, defaults: screen.defaults, state, dailyNotes: demoDailyNotes, dataview, random });
  const { body } = await prepare(screen, ctx, { vault: 'Demo vault', maxBytes });
  return JSON.parse(body).merge_variables;
}

export async function demoVault() {
  return new VaultIndex(await nodeVault(demoVaultPath, { times: demoTimes }));
}

export async function demoFixtures() {
  const vault = await demoVault();
  let total = 0;
  const frontmatter = {};
  for (const file of vault.files()) {
    total += file.path.startsWith('Templates/') ? 0 : await vault.words(file);
    const yaml = splitFrontmatter(await vault.text(file)).frontmatter.replace(/^---\r?\n|---\s*$/g, '');
    if (yaml) frontmatter[file.path] = YAML.parse(yaml);
  }
  const long = 'Rewrite the onboarding flow so that a first-time user can connect their vault, choose a screen and see it on the device in under five minutes';
  const many = Array.from({ length: 24 }, (_, index) => `- [${index % 5 === 1 ? 'x' : ' '}] ${index % 4 === 0 ? long : ['Reply to the plumber', 'Water the seedlings', 'Draft the release notes for version 0.2', 'Back up the vault'][index % 4]}`);
  return {
    'daily-tasks': await payload('daily_tasks', vault),
    'due-tasks': await payload('due_tasks', vault),
    'dataview-query': await payload('dataview_query', vault, { dataview: demoDataview(frontmatter) }),
    resurface: await payload('resurface', vault, { state: { path: 'Notes/Old Idea - Vault Metrics.md', picked: Date.parse(DEMO_NOW) - 3600000 } }),
    'writing-stats': await payload('writing_stats', vault, { state: demoWritingState(total) }),
    'pinned-note': await payload('pinned_note', vault),

    'daily-tasks-long': await payload('daily_tasks', memoryVault({ 'Daily/2026-10-09.md': `# Friday\n\n## Work\n${many.slice(0, 9).join('\n')}\n  - [ ] A subtask with a long description that wraps onto the next line\n\n## Home\n${many.slice(9, 16).join('\n')}\n\n## Errands and appointments for the long weekend\n${many.slice(16).join('\n')}\n` })),
    'daily-tasks-done': await payload('daily_tasks', memoryVault({ 'Daily/2026-10-09.md': '## Work\n- [x] Ship it\n- [x] Tell everyone\n- [x] Go home' })),
    'daily-tasks-missing': await payload('daily_tasks', memoryVault({ 'Daily/2026-10-08.md': '- [ ] Yesterday' })),
    'due-tasks-long': await payload('due_tasks', memoryVault(Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`Projects/Client project number ${index + 1} with a long name.md`, `- [ ] ${index % 3 ? 'Send the invoice' : long} 📅 2026-${index < 20 ? '09' : '10'}-${String(index < 20 ? 10 + index : index - 11).padStart(2, '0')}`])))),
    'due-tasks-clear': await payload('due_tasks', memoryVault({ 'Projects/Done.md': '- [x] Finished 📅 2026-10-01\n- [ ] Someday, no date' })),
    'dataview-wide': await payload('dataview_query', vault, { options: { title: 'Reading list with a very long title for the screen' }, dataview: { query: async () => ({ successful: true, value: { type: 'table', headers: ['Book', 'Author', 'Status', 'Rating', 'Started', 'Notes'], values: Array.from({ length: 20 }, (_, index) => [{ path: `Books/Book ${index + 1}.md`, embed: false, display: index % 2 ? `A Considerably Longer Book Title, Volume ${index}` : undefined }, 'Ursula K. Le Guin', index % 3 ? 'reading' : 'finished', index % 5, null, 'Recommended by a friend at the library sale in spring']) } }) } }),
    'dataview-list': await payload('dataview_query', vault, { options: { title: 'Notes tagged garden', query: 'LIST FROM #garden' }, dataview: { query: async () => ({ successful: true, value: { type: 'list', values: [{ path: 'Notes/Compost Ratios.md', embed: false }, { path: 'Projects/Garden Rebuild.md', embed: false }] } }) } }),
    'dataview-missing': await payload('dataview_query', vault),
    'resurface-long': await payload('resurface', vault, { options: { excerptChars: 900 }, state: { path: 'Books/Thinking in Systems.md', picked: Date.parse(DEMO_NOW) } }),
    'writing-stats-first-day': await payload('writing_stats', memoryVault({ 'Notes/One.md': 'Just one short note to start with.' })),
    'pinned-note-long': await payload('pinned_note', vault, { options: { path: 'Books/Thinking in Systems.md' } }),
    'pinned-note-missing': await payload('pinned_note', vault, { options: { path: 'Weekly Plan' } }),
    waiting: {},
  };
}
