"""Import curated passages from an explicitly downloaded publisher archive.

Usage: python3 scripts/import-verses.py /path/to/archive.zip <translation-id>
       python3 scripts/import-verses.py /tmp/web/engwebp_html.zip web
       python3 scripts/import-verses.py /tmp/ntbt/NTBT-usfm.zip ntbt
Translation IDs, archive URLs and formats are listed in content/translations.json.
No network calls. Review the content diff before committing an update.
"""
import hashlib
import json
import re
import sys
import unicodedata
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
# Typesetting marks that some publishers set inline as plain text. They are not
# wording, so a translation's catalogue entry opts in to removing them by name.
HEBREW_LETTERS = "Aleph|Beth|Gimel|Daleth|He|Vau|Zain|Cheth|Teth|Jod|Caph|Lamed|Mem|Nun|Samech|Ain|Pe|Tsade|Koph|Resch|Schin|Thau"
LAYOUT_MARKS = {
    # The King James paragraph sign.
    "pilcrow": re.compile(r"¶\s*"),
    # A "(4:3)" cross-reference to the edition's original Psalm numbering.
    "psalm-numbering": re.compile(r"^\(\d+:\d+\)\s*"),
    # A Hebrew acrostic letter, as "Tsade." opening Psalm 34:17.
    "acrostic-labels": re.compile(rf"^(?:{HEBREW_LETTERS})\.\s+(?=[A-Z])"),
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
        blocked = bool(set(classes) & {"verse", "notemark", "popup", "tnav", "footnote", "copyright", "s", "s1", "s2", "ms", "mr", "r", "rq", "chapterlabel"})
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


# Paragraph, poetry and character markers carry no wording. Headings, titles,
# acrostic labels, notes and cross-references are not part of the verse.
USFM_DROPPED_LINES = {"id", "usfm", "ide", "rem", "h", "toc1", "toc2", "toc3", "mt", "mt1", "mt2", "mt3", "ms", "ms1", "ms2", "mr", "s", "s1", "s2", "s3", "sr", "r", "d", "qa", "cl", "sp"}
USFM_NOTES = re.compile(r"\\(f|fe|x|ef)\s.*?\\\1\*", re.S)


def parse_usfm(source):
    """Map {chapter: {verse: text}} for one book of USFM."""
    chapters, chapter, verse = {}, None, None
    for line in USFM_NOTES.sub("", source).splitlines():
        marker = re.match(r"\\(\w+)\s?(.*)", line.strip())
        if not marker:
            if verse is not None and line.strip():
                chapters[chapter][verse].append(line)
            continue
        name, rest = marker.groups()
        if name == "c":
            chapter, verse = int(rest.split()[0]), None
            chapters[chapter] = {}
        elif name == "v":
            number, _, text = rest.partition(" ")
            verse = int(re.match(r"\d+", number).group())
            chapters[chapter][verse] = [text]
        elif name in USFM_DROPPED_LINES:
            continue
        elif verse is not None:
            chapters[chapter][verse].append(rest)
    return {c: {v: re.sub(r"\\\+?\w+\*?", "", " ".join(parts)) for v, parts in verses.items()} for c, verses in chapters.items()}


def slug(name):
    """Reader URL slug: "1 Pedro" -> "1pedro", "Isaías" -> "isaias"."""
    plain = "".join(c for c in unicodedata.normalize("NFD", name.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"^(\d) ", r"\1", plain).replace(" ", "-")


def clean(text, marks=()):
    text = " ".join(text.split())
    for mark in marks:
        text = LAYOUT_MARKS[mark].sub("", text)
    return text.strip()


def main():
    archive_path = Path(sys.argv[1])
    translation_id = sys.argv[2] if len(sys.argv) > 2 else "web"
    catalogue = {entry["id"]: entry for entry in json.loads((ROOT / "content/translations.json").read_text())}
    if translation_id not in catalogue:
        raise ValueError(f"Unknown translation: {translation_id}. Add it to content/translations.json first.")
    entry = catalogue[translation_id]
    if set(entry.get("layout_marks", [])) - set(LAYOUT_MARKS):
        raise ValueError(f"Unknown layout marks for {translation_id}")
    language = entry["language"]
    locale = json.loads((ROOT / "content/locales.json").read_text())[language]
    books = locale.get("books", BOOKS)
    selection = json.loads((ROOT / "content/selection.json").read_text())
    references = [item["reference"] for items in selection.values() for item in items]
    if not selection or any(not items for items in selection.values()):
        raise ValueError("Each theme needs at least one curated passage")
    if len(set(references)) != len(references):
        raise ValueError("Each passage must have one primary theme; duplicate references are not allowed")
    for items in selection.values():
        for item in items:
            if not item.get("tags") or not item.get("note", "").strip():
                raise ValueError("Each editorial selection needs tags and a context note")
    overrides_path = ROOT / f"content/selection.{translation_id}.json"
    overrides = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
    if set(overrides) - set(references):
        raise ValueError("Reference overrides must match the editorial selection")
    edition = None
    cache = {}
    with zipfile.ZipFile(archive_path) as archive:
        def chapter_text(book, chapter):
            nonlocal edition
            if entry["format"] == "usfm":
                if book not in cache:
                    source = archive.read(f"{book}.usfm").decode("utf-8-sig")
                    cut = re.search(r"^\\rem (\S+)", source, re.M)
                    if cut:
                        if edition and edition != cut.group(1):
                            raise ValueError(f"{book}.usfm comes from edition {cut.group(1)}, not {edition}")
                        edition = cut.group(1)
                    cache[book] = parse_usfm(source)
                url = entry["chapter_url"].format(slug=slug(books[book]), chapter=chapter)
                return cache[book][chapter], url, url
            digits = 3 if book == "PSA" else 2
            filename = f"{book}{chapter:0{digits}d}.htm"
            if filename not in cache:
                parser = ChapterParser()
                parser.feed(archive.read(filename).decode("utf-8-sig"))
                if parser.language != language:
                    raise ValueError(f"Expected {language} text, found {parser.language} in {filename}")
                cache[filename] = {v: "".join(parts) for v, parts in parser.verses.items()}
            url = f"{entry['source']}{filename}"
            return cache[filename], url, url + "#V{first}"

        categorized = {}
        for theme, items in selection.items():
            categorized[theme] = []
            for item in items:
                canonical = item["reference"]
                book, passage = overrides.get(canonical, canonical).split()
                chapter, span = passage.split(":")
                bounds = list(map(int, span.split("-")))
                first, last = bounds[0], bounds[-1]
                verses, _, link = chapter_text(book, int(chapter))
                parts = [clean(verses.get(v, ""), entry.get("layout_marks", [])) for v in range(first, last + 1)]
                if not all(parts):
                    raise ValueError(f"Missing text for {book} {passage}")
                categorized[theme].append({
                    "id": canonical.lower().replace(" ", "-").replace(":", "-"),
                    "theme": theme,
                    "reference": f"{books[book]} {chapter}{locale['separator']}{span.replace('-', '–')}",
                    "text": " ".join(parts),
                    "source": link.format(first=first),
                })
    # Interleave themes: mixed rotation is balanced without randomness or state.
    passages = [categorized[theme][i]
                for i in range(max(map(len, categorized.values())))
                for theme in selection if i < len(categorized[theme])]
    translation = {key: entry[key] for key in ["id", "language", "name", "abbreviation", "edition", "license", "source", "attribution"] if key in entry}
    provenance = {"imported_on": date.today().isoformat(), "archive": entry["archive"], "archive_sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest()}
    if edition:
        provenance["edition_cut"] = edition
    payload = {
        "translation": translation,
        "provenance": provenance,
        "themes": [{"id": t, "name": locale["themes"][t]} for t in selection],
        "labels": locale["labels"],
        "verses": passages,
    }
    (ROOT / "content/verses" / f"{translation_id}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"Imported {len(passages)} {translation_id} passages; longest is {max(len(v['text']) for v in passages)} characters")


if __name__ == "__main__":
    main()
