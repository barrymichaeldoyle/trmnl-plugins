// A vault held in memory, for edge cases the demo vault does not have.
export function memoryVault(notes, { time = Date.parse('2026-10-01T12:00:00Z') } = {}) {
  const files = Object.keys(notes).sort().map(path => ({ path, mtime: notes[path].mtime ?? time, ctime: notes[path].ctime ?? time }));
  return { files: () => files, read: async path => typeof notes[path] === 'string' ? notes[path] : notes[path].text };
}
