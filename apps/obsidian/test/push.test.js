import test from 'node:test';
import assert from 'node:assert/strict';
import { webhookId, stableStringify, hash, envelope, fit, remaining, nextSlot, byteLength } from '../obsidian-plugin/src/lib/push.js';
import { isDue } from '../obsidian-plugin/src/prepare.js';

const HOUR = 3600000;

test('the webhook field accepts the URL TRMNL shows or the bare UUID', () => {
  const id = '0f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
  assert.equal(webhookId(`https://trmnl.com/api/custom_plugins/${id}`), id);
  assert.equal(webhookId(` ${id.toUpperCase()}/ `), id);
  assert.equal(webhookId('https://trmnl.com/api/custom_plugins/not-a-uuid'), null);
  assert.equal(webhookId(''), null);
});

test('hashes ignore key order', () => {
  assert.equal(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
  assert.equal(hash(stableStringify({ a: 1, b: 2 })), hash(stableStringify({ b: 2, a: 1 })));
  assert.notEqual(hash('a'), hash('b'));
});

test('payloads shrink until they fit and never exceed the byte limit', () => {
  const build = data => envelope('due_tasks', 'Vault', '14:00', data);
  const data = { tasks: Array.from({ length: 200 }, (_, index) => ({ text: `Task ${index} with ünïcödé text` })), hidden: 0 };
  const shrink = current => current.tasks.length ? { tasks: current.tasks.slice(0, -1), hidden: current.hidden + 1 } : null;
  const result = fit(build, data, shrink, 5000);
  assert.ok(result.bytes <= 5000 && byteLength(result.body) === result.bytes);
  assert.equal(result.data.tasks.length + result.data.hidden, 200);
  assert.throws(() => fit(build, data, () => null, 100), /over 100 bytes/);
});

test('the budget allows the plan’s pushes in any sliding hour', () => {
  const now = 10 * HOUR;
  const times = Array.from({ length: 12 }, (_, index) => now - HOUR + 1000 + index * 60000);
  assert.equal(remaining(times, now, 12), 0);
  assert.equal(nextSlot(times, now, 12), times[0] + HOUR);
  assert.equal(remaining(times, times[0] + HOUR, 12), 1);
  assert.equal(remaining(times, now, 30), 18);
  assert.equal(nextSlot([], now, 12), now);
});

test('unchanged data is skipped until the force interval, unless pushed by hand', () => {
  const base = { hash: 'a', lastHash: 'a', lastPush: 0, forceMinutes: 180 };
  assert.equal(isDue({ ...base, now: 60 * 60000 }), false);
  assert.equal(isDue({ ...base, now: 180 * 60000 }), true);
  assert.equal(isDue({ ...base, hash: 'b', now: 1 }), true);
  assert.equal(isDue({ ...base, now: 1, manual: true }), true);
});
