import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadPlugin, renderView, views } from '../../../packages/plugin-tools/src/plugin.js';

const plugin = await loadPlugin(fileURLToPath(new URL('..', import.meta.url)));

test('task progress includes tasks omitted from the visible list and handles completion and zero tasks', async () => {
  for (const view of views) {
    for (const [fixture, filled] of [['daily-tasks', 29], ['daily-tasks-long', 20], ['daily-tasks-done', 100]]) {
      const data = plugin.fixtures[fixture];
      const html = await renderView(plugin, view, { data });
      assert.match(html, new RegExp(`aria-valuemax="${data.total}" aria-valuenow="${data.done}"`));
      assert.equal((html.match(/class="grow w--0 h--full bg--black"/g) ?? []).length, filled, `${view}: ${fixture}`);
      assert.equal((html.match(/class="grow w--0 h--full/g) ?? []).length, 100, `${view}: ${fixture}`);
    }
    const empty = await renderView(plugin, view, { data: { ...plugin.fixtures['daily-tasks'], total: 0, done: 0, open: 0, groups: [] } });
    assert.doesNotMatch(empty, /role="progressbar"|NaN|Infinity/);
  }
});
