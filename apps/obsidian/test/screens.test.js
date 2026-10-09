import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { payload, demoVault, demoFixtures, moment } from '../scripts/fixtures.js';
import { memoryVault } from '../scripts/memory-vault.js';
import { DEMO_NOW } from '../scripts/demo.js';
import { dailyNotePath } from '../obsidian-plugin/src/lib/dates.js';
import { display } from '../obsidian-plugin/src/screens/dataview-query.js';

const fixtures = await demoFixtures();
const tasks = data => data.groups.flatMap(group => group.tasks);

test('committed fixtures match what the collectors produce for the demo vault', async () => {
  for (const [name, data] of Object.entries(fixtures)) {
    assert.deepEqual(JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')), data, `${name}: run pnpm --filter @trmnl/obsidian fixtures`);
    assert.ok(Buffer.byteLength(JSON.stringify({ merge_variables: data })) <= 5000, name);
    assert.doesNotMatch(JSON.stringify(data), /\p{Extended_Pictographic}/u, name);
  }
});

test('daily tasks group today’s checkboxes under their headings', () => {
  const data = fixtures['daily-tasks'];
  assert.equal(data.date_label, 'Friday 9 October');
  assert.deepEqual(data.groups.map(group => group.heading), ['Work', 'Personal']);
  assert.deepEqual([data.total, data.done, data.open], [7, 2, 5]);
  assert.ok(tasks(data).some(task => task.text === 'Pick up seed potatoes for the garden'));
  assert.equal(fixtures['daily-tasks-missing'].status, 'missing');
});

test('over the item limit, completed tasks are dropped before open ones', () => {
  const data = fixtures['daily-tasks-long'];
  assert.equal(tasks(data).length, 20);
  assert.ok(tasks(data).every(task => !task.done));
  assert.equal(data.hidden, 5);
});

test('due tasks put overdue first and skip done and far-off tasks', () => {
  const data = fixtures['due-tasks'];
  assert.deepEqual([data.overdue_count, data.today_count], [3, 1]);
  assert.deepEqual(data.tasks[0], { text: 'Get quotes for the raised beds', file: 'Garden Rebuild', bucket: 'overdue', days: -6, due_label: 'Sat 3 Oct', when: '6 days late' });
  assert.ok(data.tasks.every((task, index) => index === 0 || task.days >= data.tasks[index - 1].days));
  assert.ok(data.tasks.every(task => task.days <= 7));
  assert.ok(!data.tasks.some(task => task.text === 'Decide webhook vs polling'));
  // 20 overdue in September, and 8 of the 10 October tasks fall within the week.
  assert.equal(fixtures['due-tasks-long'].tasks.length + fixtures['due-tasks-long'].hidden, 28);
});

test('the Dataview screen formats links and dates and explains a missing plugin', () => {
  assert.deepEqual(fixtures['dataview-query'].rows[0], ['TRMNL Plugin', 'active', 'software', '1 Oct 2026']);
  assert.match(fixtures['dataview-missing'].message, /Install and enable the Dataview plugin/);
  assert.equal(display(moment, [{ path: 'a/B.md', embed: false }, true, null, { toHuman: () => '2 hr' }]), 'B, Yes, 2 hr');
});

test('resurface weighs stale notes and keeps its pick for the rotation period', async () => {
  const vault = memoryVault({ 'Old.md': { text: 'word '.repeat(60), mtime: Date.parse('2025-10-09') }, 'New.md': { text: 'word '.repeat(60), mtime: Date.parse(DEMO_NOW) }, 'Short.md': 'Too short.' });
  const picks = { Old: 0, New: 0 };
  for (let draw = 0; draw < 100; draw++) picks[(await payload('resurface', vault, { random: () => draw / 100 })).title]++;
  assert.ok(picks.Old > 95, JSON.stringify(picks));
  const state = {};
  const first = await payload('resurface', vault, { state, random: () => 0.999 });
  const later = await payload('resurface', vault, { state, random: () => 0, now: '2026-10-10T13:00:00Z' });
  const next = await payload('resurface', vault, { state, random: () => 0, now: '2026-10-10T15:00:00Z' });
  assert.equal(first.title, later.title);
  assert.notEqual(first.title, next.title);
  assert.equal(fixtures.resurface.age_label, 'Edited 100 days ago');
});

test('writing stats measure the rise in total words and keep the streak', async () => {
  const data = fixtures['writing-stats'];
  assert.deepEqual([data.words_today, data.streak_days, data.history.length], [312, 9, 14]);
  assert.equal(Math.max(...data.history.map(day => day.level)), 8);
  const state = {};
  const vault = text => memoryVault({ 'Daily/2026-10-09.md': text });
  assert.equal((await payload('writing_stats', vault('one two three'), { state })).words_today, 0);
  assert.equal((await payload('writing_stats', vault('one two three four five'), { state })).words_today, 2);
  assert.equal((await payload('writing_stats', vault('one'), { state })).words_today, 0);
  const tomorrow = await payload('writing_stats', vault('one two'), { state, now: '2026-10-10T09:00:00Z' });
  assert.deepEqual([tomorrow.words_today, tomorrow.streak_days], [1, 2]);
});

test('the pinned note keeps label pairs, headings and checkboxes', () => {
  const { title, lines } = fixtures['pinned-note'];
  assert.equal(title, 'This Week');
  assert.deepEqual(lines[0], { kind: 'pair', label: 'Ship', text: 'TRMNL Obsidian plugin MVP' });
  assert.deepEqual(lines.filter(line => line.kind === 'task').map(line => line.done), [true, false, false]);
  assert.equal(fixtures['pinned-note-missing'].status, 'missing');
});

test('daily note paths follow the folder and format settings', () => {
  assert.equal(dailyNotePath(moment, '2026-10-09', { folder: '/Journal/', format: 'YYYY/MM/YYYY-MM-DD' }), 'Journal/2026/10/2026-10-09.md');
  assert.equal(dailyNotePath(moment, '2026-10-09', {}), '2026-10-09.md');
});

test('a collector that throws still pushes a screen that explains it', async () => {
  const vault = await demoVault();
  vault.source = { files: () => { throw new Error('boom'); }, read: async () => '' };
  assert.equal((await payload('due_tasks', vault)).status, 'error');
});
