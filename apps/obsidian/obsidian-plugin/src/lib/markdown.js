// Markdown to plain text for an e-ink screen. TRMNL renders no emoji and no
// Markdown, so everything here ends up as words, numbers and punctuation.

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(content) {
  const match = content.match(FRONTMATTER);
  return match ? { frontmatter: match[0], body: content.slice(match[0].length) } : { frontmatter: '', body: content };
}

// Tasks plugin signifiers: dates, recurrence, priority, dependencies.
const TASK_DATE = /[📅📆🗓⏳⌛🛫✅➕❌]️?\s*\d{4}-\d{2}-\d{2}/gu;
const TASK_RECURRENCE = /🔁️?\s*[^📅📆🗓⏳⌛🛫✅➕❌⏫🔼🔽⏬🔺🆔⛔]*/gu;
const TASK_IDS = /(?:🆔|⛔)️?\s*[\w,-]+/gu;
// Joiners and selectors sit outside the class so each is matched on its own.
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}]|\uFE0F|\u200D|\u20E3/gu;

// One line of Markdown as plain text: links keep their visible text, inline
// fields and Tasks signifiers go, and emoji are removed.
export function inlineText(source) {
  return String(source)
    .replace(/%%[\s\S]*?%%/g, ' ')
    .replace(TASK_DATE, ' ').replace(TASK_RECURRENCE, ' ').replace(TASK_IDS, ' ')
    .replace(/[[(][\w ][\w -]*::[^\])]*[\])]/g, ' ')
    .replace(/(^|\s)[\w-]+::.*$/, '$1')
    .replace(/!\[\[[^\]]*\]\]/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_, target) => linkName(target))
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w_])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/==(.+?)==/g, '$1')
    .replace(/\s\^[\w-]+$/, '')
    .replace(EMOJI, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// [[Folder/Note#Heading]] reads as "Note > Heading".
function linkName(target) {
  const [path, ...rest] = target.split('#');
  const name = path.split('/').pop().replace(/\.md$/, '');
  const heading = rest.join('#').replace(/^\^.*/, '');
  return [name, heading].filter(Boolean).join(' > ');
}

// Words the way a reader counts them: Latin-script words, numbers, and each
// CJK character, ignoring frontmatter, code, comments and link targets.
export function wordCount(content) {
  const text = splitFrontmatter(content).body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/%%[\s\S]*?%%/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  const words = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ')
    .match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  return words + cjk;
}

// The note's structure as plain-text blocks: headings, list items with their
// depth, tasks, "**Label:** text" pairs and lines of prose. Obsidian shows a
// single line break as a break, so each line of prose is its own block. Code
// blocks, tables' rules, comments and horizontal rules are dropped.
export function blocks(content) {
  const lines = splitFrontmatter(content).body.replace(/%%[\s\S]*?%%/g, '').split(/\r?\n/);
  const result = [];
  let fence = null;
  for (const raw of lines) {
    const fenceMatch = raw.match(/^\s*(`{3,}|~{3,})/);
    if (fence) { if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null; continue; }
    if (fenceMatch) { fence = fenceMatch[1]; continue; }
    let line = raw.replace(/^(\s*>)+\s?/, '');
    if (/^\s*>/.test(raw)) line = line.replace(/^\s*\[!\w+\][+-]?\s*/, '');
    if (!line.trim() || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line) || /^\s*\|?\s*:?-{2,}/.test(line)) continue;
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) { const text = inlineText(heading[2]); if (text) result.push({ kind: 'h', level: heading[1].length, text }); continue; }
    const item = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[(.)\]\s+)?(.*)$/);
    if (item) {
      const depth = Math.min(3, Math.floor(item[1].replace(/\t/g, '    ').length / 2));
      const text = inlineText(item[3]);
      if (text) result.push(item[2] !== undefined ? { kind: 'task', depth, done: isDone(item[2]), text } : { kind: 'li', depth, text });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) { const cells = line.trim().slice(1, -1).split('|').map(inlineText).filter(Boolean); if (cells.length) result.push({ kind: 'p', text: cells.join(' · ') }); continue; }
    const pair = line.match(/^\s*(\*\*|__)([^*_]{1,40}?):?\1:?\s+(.+)$/);
    if (pair) { const label = inlineText(pair[2]); const text = inlineText(pair[3]); if (label && text) { result.push({ kind: 'pair', label, text }); continue; } }
    const text = inlineText(line);
    if (text) result.push({ kind: 'p', text });
  }
  return result;
}

// [x] and [X] are done; [-] is cancelled, which also counts as finished.
export function isDone(status) {
  return status === 'x' || status === 'X' || status === '-';
}

// Cut text to at most max characters at a word boundary, marking the cut.
export function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max - 1));
  const boundary = /\s/.test(text[cut.length]) ? cut.length : cut.lastIndexOf(' ');
  return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}
