import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineText, wordCount, blocks, clip, splitFrontmatter } from '../obsidian-plugin/src/lib/markdown.js';
import { parseTasks, dueDate } from '../obsidian-plugin/src/lib/tasks.js';

test('inline Markdown becomes plain text with links read as their visible text', () => {
  assert.equal(inlineText('Pick up seed potatoes for [[Garden Rebuild|the garden]]'), 'Pick up seed potatoes for the garden');
  assert.equal(inlineText('See [[Projects/TRMNL Plugin#Tasks]] and [the docs](https://trmnl.com/docs (v2))'), 'See TRMNL Plugin > Tasks and the docs');
  assert.equal(inlineText('**Bold**, *italic*, _under_, ~~gone~~, ==marked== and `code`'), 'Bold, italic, under, gone, marked and code');
  assert.equal(inlineText('snake_case_name and 2*3*4 stay'), 'snake_case_name and 2*3*4 stay');
  assert.equal(inlineText('Embed ![[diagram.png]] here %%secret%% ^block-1'), 'Embed here');
});

test('Tasks signifiers, Dataview fields and emoji never reach the screen', () => {
  assert.equal(inlineText('Publish the recipe ⏫ 📅 2026-10-16 ✅ 2026-10-17'), 'Publish the recipe');
  assert.equal(inlineText('Water plants 🔁 every week 📅 2026-10-10'), 'Water plants');
  assert.equal(inlineText('Order soil [due:: 2026-10-10] (priority:: high)'), 'Order soil');
  assert.equal(inlineText('Choose a book due:: 2026-10-30'), 'Choose a book');
  assert.equal(inlineText('Run 🏃‍♀️ then 🇿🇦 braai 👍🏽'), 'Run then braai');
});

test('due dates come from the Tasks signifier or a Dataview due field', () => {
  assert.equal(dueDate('Thing 📅 2026-10-09'), '2026-10-09');
  assert.equal(dueDate('Thing [due:: 2026-10-10]'), '2026-10-10');
  assert.equal(dueDate('Thing (due:: 2026-10-14)'), '2026-10-14');
  assert.equal(dueDate('Thing due:: 2026-10-30'), '2026-10-30');
  assert.equal(dueDate('Thing ⏳ 2026-10-30'), null);
});

test('tasks carry their heading and depth, and skip code and frontmatter', () => {
  const tasks = parseTasks('---\ntodo: "- [ ] not a task"\n---\n# Day\n## Work\n- [x] Done\n  - [ ] Nested 📅 2026-10-09\n```\n- [ ] in code\n```\n1. [-] Cancelled\n* [/] Started');
  assert.deepEqual(tasks.map(task => [task.text, task.done, task.depth, task.heading?.text, task.due]), [
    ['Done', true, 0, 'Work', null], ['Nested', false, 1, 'Work', '2026-10-09'], ['Cancelled', true, 0, 'Work', null], ['Started', false, 0, 'Work', null],
  ]);
});

test('word counts skip frontmatter and code and count CJK characters', () => {
  assert.equal(wordCount('---\ntitle: x y z\n---\nOne two, three-four. It’s 2026!\n```\nnot counted\n```'), 5);
  assert.equal(wordCount('日本語 and English'), 5);
  assert.equal(splitFrontmatter('no frontmatter').body, 'no frontmatter');
});

test('blocks keep lines, pairs, lists and tasks and drop rules and code', () => {
  assert.deepEqual(blocks('# Title\n**Ship:** it\nLine one\nLine two\n\n---\n- item\n  - [x] sub task\n> [!note] Callout title\n> quoted\n```js\nx\n```\n| a | b |\n|---|---|\n| 1 | 2 |'), [
    { kind: 'h', level: 1, text: 'Title' }, { kind: 'pair', label: 'Ship', text: 'it' }, { kind: 'p', text: 'Line one' }, { kind: 'p', text: 'Line two' },
    { kind: 'li', depth: 0, text: 'item' }, { kind: 'task', depth: 1, done: true, text: 'sub task' }, { kind: 'p', text: 'Callout title' }, { kind: 'p', text: 'quoted' },
    { kind: 'p', text: 'a · b' }, { kind: 'p', text: '1 · 2' },
  ]);
});

test('clipping cuts at a word boundary and marks the cut', () => {
  assert.equal(clip('short', 10), 'short');
  assert.equal(clip('The quick brown fox jumps over', 20), 'The quick brown fox…');
  assert.ok(clip('x'.repeat(50), 10).length <= 10);
});
