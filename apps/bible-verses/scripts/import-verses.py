"""Import curated passages from an explicitly downloaded eBible HTML archive.

Usage: python3 scripts/import-verses.py /path/to/engwebp_html.zip
       python3 scripts/import-verses.py /path/to/fraLSG_html.zip fr
       python3 scripts/import-verses.py /path/to/spaRV1909_html.zip es
No network calls. Review generated content before committing an update.
"""
import hashlib
import json
import re
import sys
import zipfile
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOKS = {
    "JHN": "John", "PHP": "Philippians", "ISA": "Isaiah", "MAT": "Matthew",
    "PSA": "Psalm", "1PE": "1 Peter", "COL": "Colossians", "2TH": "2 Thessalonians",
    "PRO": "Proverbs", "ROM": "Romans", "LAM": "Lamentations", "HEB": "Hebrews",
    "2CO": "2 Corinthians", "REV": "Revelation", "EPH": "Ephesians",
    "2TI": "2 Timothy", "GAL": "Galatians", "1CO": "1 Corinthians", "JAS": "James",
    "MIC": "Micah", "1JN": "1 John", "LUK": "Luke", "1TH": "1 Thessalonians",
    "1CH": "1 Chronicles", "JER": "Jeremiah",
    "RUT": "Ruth", "1TI": "1 Timothy", "ECC": "Ecclesiastes", "DEU": "Deuteronomy",
}


class ChapterParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.verses = {}
        self.current = None
        self.suppressed = 0
        self.stack = []
        self.language = None
        self.note_boundary = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html":
            self.language = attrs.get("lang", "").split("-")[0]
        classes = attrs.get("class", "").split()
        if "verse" in classes:
            self.current = int(attrs["id"][1:])
            self.verses[self.current] = []
            self.note_boundary = False
        blocked = bool(set(classes) & {"verse", "notemark", "popup", "tnav", "footnote", "copyright", "s", "s1", "s2", "ms", "mr", "r", "chapterlabel"})
        if tag not in {"meta", "link", "hr", "br", "img", "input"}:
            self.stack.append((tag, blocked, "notemark" in classes))
            self.suppressed += blocked
        if tag in {"div", "p", "br"} and self.current and not self.suppressed:
            self.verses[self.current].append(" ")

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1][0] == tag:
            _, blocked, note = self.stack.pop()
            self.suppressed -= blocked
            if note and self.current is not None and not self.suppressed:
                self.note_boundary = True
        if tag in {"div", "p"} and self.current and not self.suppressed:
            self.verses[self.current].append(" ")

    def handle_data(self, data):
        if self.current is not None and not self.suppressed:
            # A superscript note can be the publisher's only word boundary.
            # Removing it must not turn "et [note] priez" into "etpriez".
            if self.note_boundary and data:
                previous = "".join(self.verses[self.current])
                if previous and data[0].isalnum() and (previous[-1].isalnum() or previous[-1] in ",;:!?."):
                    self.verses[self.current].append(" ")
                self.note_boundary = False
            self.verses[self.current].append(data)


def main():
    archive_path = Path(sys.argv[1])
    language = sys.argv[2] if len(sys.argv) > 2 else "en"
    locales = json.loads((ROOT / "content/locales.json").read_text())
    if language not in locales:
        raise ValueError(f"Unsupported language: {language}")
    locale = locales[language]
    selection = json.loads((ROOT / "content/selection.json").read_text())
    references = [entry["reference"] for entries in selection.values() for entry in entries]
    if not selection or any(not entries for entries in selection.values()):
        raise ValueError("Each theme needs at least one curated passage")
    if len(set(references)) != len(references):
        raise ValueError("Each passage must have one primary theme; duplicate references are not allowed")
    for entries in selection.values():
        for entry in entries:
            if not entry.get("tags") or not entry.get("note", "").strip():
                raise ValueError("Each editorial selection needs tags and a context note")
    overrides_path = ROOT / f"content/selection.{language}.json"
    overrides = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
    if set(overrides) - set(references):
        raise ValueError("Reference overrides must match the editorial selection")
    chapters = {}
    categorized = {}
    with zipfile.ZipFile(archive_path) as archive:
        for theme, refs in selection.items():
            categorized[theme] = []
            for entry in refs:
                canonical_ref = entry["reference"]
                ref = overrides.get(canonical_ref, canonical_ref)
                book, passage = ref.split()
                chapter, span = passage.split(":")
                bounds = list(map(int, span.split("-")))
                first, last = bounds[0], bounds[-1]
                digits = 3 if book == "PSA" else 2
                filename = f"{book}{int(chapter):0{digits}d}.htm"
                if filename not in chapters:
                    parser = ChapterParser()
                    parser.feed(archive.read(filename).decode("utf-8-sig"))
                    if parser.language != language:
                        raise ValueError(f"Expected {language} text, found {parser.language} in {filename}")
                    chapters[filename] = parser.verses
                parts = [" ".join("".join(chapters[filename][v]).split()) for v in range(first, last + 1)]
                if not all(parts):
                    raise ValueError(f"Missing text for {ref}")
                categorized[theme].append({
                    "id": canonical_ref.lower().replace(" ", "-").replace(":", "-"),
                    "theme": theme,
                    "reference": f"{locale.get('books', BOOKS)[book]} {chapter}:{span.replace('-', '–')}",
                    "text": " ".join(parts),
                    "source": f"{locale['translation']['source']}{filename}#V{first}",
                })
    # Interleave themes: mixed rotation is balanced without randomness or state.
    verses = [categorized[theme][i]
              for i in range(max(map(len, categorized.values())))
              for theme in selection if i < len(categorized[theme])]
    payload = {
        "translation": locale["translation"],
        "provenance": {"imported_on": date.today().isoformat(), "archive_sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest()},
        "themes": [{"id": t, "name": locale["themes"][t]} for t in selection],
        "verses": verses,
    }
    if language != "en":
        payload["labels"] = locale["labels"]
    output = "verses.json" if language == "en" else f"verses.{language}.json"
    (ROOT / "content" / output).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"Imported {len(verses)} passages; longest is {max(len(v['text']) for v in verses)} characters")


if __name__ == "__main__":
    main()
