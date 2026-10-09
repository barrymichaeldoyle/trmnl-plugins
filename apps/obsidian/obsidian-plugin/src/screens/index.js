import dailyTasks from './daily-tasks.js';
import dueTasks from './due-tasks.js';
import dataviewQuery from './dataview-query.js';
import resurface from './resurface.js';
import writingStats from './writing-stats.js';
import pinnedNote from './pinned-note.js';

export const screens = [dailyTasks, dueTasks, dataviewQuery, resurface, writingStats, pinnedNote];
export const screenTypes = Object.fromEntries(screens.map(screen => [screen.type, screen]));

// One entry per TRMNL plugin install: which screen it shows, the name of the
// Obsidian secret holding its webhook URL, and the screen's options.
export function newScreen(type, existing = []) {
  const screen = screenTypes[type];
  const taken = new Set(existing.map(entry => entry.id));
  const base = type.replace(/_/g, '-');
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return { id, type, name: screen.name, enabled: false, secret: '', options: structuredClone(screen.defaults) };
}
