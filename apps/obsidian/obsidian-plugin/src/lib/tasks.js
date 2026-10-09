import { splitFrontmatter, inlineText, isDone } from './markdown.js';

const TASK = /^(\s*)(?:[-*+]|\d+[.)])\s+\[(.)\]\s+(.*)$/;
// Due dates in the order the spec lists them: the Tasks plugin's signifier,
// then Dataview inline fields in brackets, parentheses, or bare at line end.
const DUE = [
  /📅️?\s*(\d{4}-\d{2}-\d{2})/u,
  /\[due::\s*(\d{4}-\d{2}-\d{2})[^\]]*\]/i,
  /\(due::\s*(\d{4}-\d{2}-\d{2})[^)]*\)/i,
  /(?:^|\s)due::\s*(\d{4}-\d{2}-\d{2})/i,
];

export function dueDate(raw) {
  for (const pattern of DUE) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Every checkbox in a note, outside frontmatter and code blocks, with the
// nearest heading above it and its nesting depth.
export function parseTasks(content) {
  const tasks = [];
  let heading = null;
  let fence = null;
  for (const line of splitFrontmatter(content).body.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) { if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null; continue; }
    if (fenceMatch) { fence = fenceMatch[1]; continue; }
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (headingMatch) { heading = { level: headingMatch[1].length, text: inlineText(headingMatch[2]) }; continue; }
    const match = line.match(TASK);
    if (!match) continue;
    const text = inlineText(match[3]);
    if (!text) continue;
    tasks.push({
      text,
      status: match[2],
      done: isDone(match[2]),
      depth: Math.floor(match[1].replace(/\t/g, '    ').length / 2),
      heading,
      due: dueDate(match[3]),
    });
  }
  return tasks;
}
