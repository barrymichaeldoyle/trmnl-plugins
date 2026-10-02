import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('publisher footnote removal preserves word boundaries, punctuation and inline text', () => {
  const importer = fileURLToPath(new URL('../scripts/import-verses.py', import.meta.url));
  const script = `
import json, runpy, sys
Parser = runpy.run_path(sys.argv[1])['ChapterParser']
note = '<a class="notemark">d<span class="popup">Lu 23:34.</span></a>'
cases = [
    ('et' + note + '<span>priez</span>', 'et priez'),
    ('dis:' + note + '<span>Aimez</span>', 'dis: Aimez'),
    ('pries,' + note + '<span>entre</span>', 'pries, entre'),
    ('mot' + note + ', autre', 'mot, autre'),
    ('l’' + note + 'Éternel', 'l’Éternel'),
    ('con' + '<em>fiance</em>', 'confiance'),
    ('et ' + note + ' priez', 'et priez'),
    ('fin.' + note + '<span class="verse" id="V2">2</span>Début', 'fin.'),
]
results = []
for html, expected in cases:
    parser = Parser()
    parser.feed('<html lang="fr"><p><span class="verse" id="V1">1</span>' + html + '</p></html>')
    actual = ' '.join(''.join(parser.verses[1]).split())
    assert actual == expected, (actual, expected)
    results.append(actual)
print(json.dumps(results, ensure_ascii=False))
`;
  const result = spawnSync('python3', ['-c', script, importer], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(JSON.parse(result.stdout).length, 8);
});
