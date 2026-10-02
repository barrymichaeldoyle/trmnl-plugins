# Collection and language review

Reviewed by Codex on 2 October 2026. Scope: all 108 selections and their editorial notes; all 324 imported passage records; French and Spanish references, themes and labels; publisher attribution; and possible improvements to the collection. This is an editorial and source review, not a native-speaker certification or a physical-device check.

## Source fidelity

Downloaded the three attributed publisher HTML archives and explicitly reimported each into a temporary directory. All three archive SHA-256 hashes matched the stored provenance. After the correction below, all 108 passage records in each language match the importer output, including text, translation-specific references and chapter links. See [source-review.json](source-review.json) for the URLs, hashes and counts.

The review found a French extraction defect at superscript footnote boundaries. Five passages had joined words or missing word spacing: Matthew 5:44–45, 6:5–6, 6:19–21, 11:28–30 and Luke 12:15. The importer now preserves those boundaries while removing note text. French was explicitly regenerated from the same publisher archive; the selection, wording, punctuation and reference ranges remain intact. A regression test covers word joins, punctuation, apostrophes, ordinary inline emphasis and adjacent verses.

The [source-change browser review](source-layout-checks.json) records 168 successful local cases: those five corrected passages and the longest French passage in all four layouts, across three framework device profiles and both orientations, plus the longest passage with QR disabled. Complete text, references, passage bounds and image loading passed. This checks the extraction change; it does not resolve the already-known readability tradeoff in very small views or replace the user's final account/device polishing.

The existing eight French Psalm overrides correspond to the selected English/Spanish passages. Keep these translation-specific numbers. Psalm superscriptions and the Spanish “NUN.” at Psalm 119:105 occur within the source's numbered verses and are retained; they must not be mistaken for removable website headings. French words such as “charité” and “dispensateurs,” and Spanish spellings such as “á,” “ó,” “oir” and “dió,” belong to these historical editions. They are not modernized by this recipe.

The translations can differ in meaning at individual words or phrases; they are independently attributed publisher texts, not translations generated from the English collection. The original speech quotation marks can open or close outside an excerpt's verse range. Do not invent balancing quotation marks or change punctuation to make an excerpt look self-contained.

French and Spanish book names, references, theme labels and existing display messages were reviewed. The settings now include localized descriptions and attribution. The current language preference changes Scripture; TRMNL account locale controls which localized form descriptions appear. The user has accepted this agent review for release; external native-speaker review is optional future feedback rather than an outstanding prerequisite.

## Themes

Keep the nine themes and the mixed daily default. They match recognizable everyday situations and remain manageable in one multi-select. A passage can touch several subjects while retaining one primary theme and one place in the cycle. Add variety within the existing themes before adding controls or a tenth theme.

| Theme | Assessment | Useful improvement |
| --- | --- | --- |
| Family & home | Includes marriage, parenting, aging, caregiving and loyalty. The revised collection adds shared faith in the home. | Deuteronomy 6:4–7 replaces a repeated parent/child instruction. Belonging for isolated readers remains a useful direction for later expansion. |
| Relationships | Good range: affection, forgiveness, conflict, listening, hospitality and enemies. | Retain the range. Add reconciliation or companionship when expanding, rather than another generic love excerpt. |
| Work & purpose | Includes honest work and unpaid service, with four Proverbs passages rather than five. | Psalm 90:16–17 adds dependence on God; 1 Peter 4:10–11 completes the teaching on service. |
| Money & generosity | Keeps contentment, greed, uncertain wealth, integrity, giving and the poor together. | Retain the balance. Three passages from 1 Timothy 6 have distinct jobs; they are less repetitive than their shared chapter suggests. |
| Decisions & direction | Combines prayer, Scripture, counsel, character, time and gracious speech. | Keep it. “Wisdom & decisions” is a possible future label, but no rename is necessary for release. |
| Worry & rest | Several complementary responses: prayer, trust, sleep, Jesus' invitation and kind words. | Keep it. Distinguish peace/rest from grief rather than moving every comforting passage here. |
| Hard times & loss | Assurance and endurance now sit beside a full lament and practical accompaniment. | Psalm 13 and Romans 12:14–15 make room for grief and sharing another person’s sorrow. |
| Joy & gratitude | Good worship and practical thanksgiving, with less repetition. | Philippians 4:4–5 replaces the duplicated thanksgiving formula with joy and gentleness. |
| Faith & prayer | Prayer remains prominent; grace and faith now have a foundational passage. | Ephesians 2:8–10 holds grace, faith and good works together; 2 Corinthians 5:6–8 completes the statement on confidence. |

## Completed editorial revision

The user authorized all six substitutions and both range extensions below. The editorial list was updated first, then all three languages were explicitly imported from the verified archives. Every theme retains twelve entries and the cycle retains 108 passages. The other 100 passage records per language are unchanged.

| Theme | Previous selection | Imported selection | Reason and context to retain |
| --- | --- | --- | --- |
| Family & home | Colossians 3:20–21 | [Deuteronomy 6:4–7](https://ebible.org/engwebp/DEU06.htm#V4) | Ephesians already covers children and fathers. Keep Israel's confession and love of God with the teaching of children, so “these words” has its context. |
| Work & purpose | Proverbs 10:4–5 | [Psalm 90:16–17](https://ebible.org/engwebp/PSA090.htm#V16) | Adds a prayer for the work of our hands amid a psalm about life's limits, rather than another diligence/wealth contrast. |
| Hard times & loss | Isaiah 41:10 | [Psalm 13:1–6](https://ebible.org/engwebp/PSA013.htm#V1) | Preserve the entire movement from “How long?” through petition to trust. It adds honest lament; it is not chosen because it is shorter. French uses Psaumes 13:2–6 for the equivalent complete lament; its separate superscription in verse 1 is outside that range. Spanish retains its superscription within verse 1. |
| Hard times & loss | Isaiah 40:31 | [Romans 12:14–15](https://ebible.org/engwebp/ROM12.htm#V14) | Adds blessing and accompaniment, including weeping with someone who weeps. Keeps a practical response to suffering beside the remaining assurances. |
| Joy & gratitude | 1 Chronicles 16:34 | [Philippians 4:4–5](https://ebible.org/engwebp/PHP04.htm#V4) | Keeps Psalm 107:1's thanksgiving formula and adds joy, gentleness and the Lord's nearness. Philippians 4:6–7 remains in Worry & rest; these ranges do not overlap. |
| Faith & prayer | Psalm 55:16–17 | [Ephesians 2:8–10](https://ebible.org/engwebp/EPH02.htm#V8) | Keeps the morning prayer in Psalm 5 while adding salvation by grace, faith and the resulting good works in one passage. |

Both range extensions were applied:

- **[1 Peter 4:10–11](https://ebible.org/engwebp/1PE04.htm#V10), instead of 4:10:** the previous French selection ended in a comma. Verse 11 completes the concrete examples of speech and service and their purpose of glorifying God.
- **[2 Corinthians 5:6–8](https://ebible.org/engwebp/2CO05.htm#V6), instead of 5:6–7:** the previous French selection ended in a comma, and Spanish verse 7 is parenthetical. Verse 8 completes the surrounding statement about confidence, bodily life and being with the Lord.

Deuteronomy book names were added to the English importer and French/Spanish locale maps. The obsolete Psalm 55 override was replaced by the Psalm 13 override, leaving eight French Psalm mappings. Scripture retains publisher wording and complete ranges; no passage was trimmed to retain its previous font size.

The [editorial browser review](editorial-layout-checks.json) records 1,152 successful cases: all eight revised passages in each of the three languages, all four layouts, all three framework device profiles, both orientations, and QR enabled/disabled. Complete text, references, passage bounds and image loading passed. The French Psalm 13 is now the longest French passage (610 characters). Some small views fit the complete text at 8–10 px; local clipping checks do not establish comfortable reading on physical hardware. The user’s account/device polishing remains deferred.

## Editorial safeguards

Internal notes are helpful for selection, but readers see Scripture without those notes. A note cannot repair an excerpt that omits its necessary context. Keep complementary instructions together where they form one thought, preserve conditions attached to assurances, and give laments space before reassurance.

Proverbs remain welcome; avoid stacking so many effort/wealth proverbs that the Work theme sounds like a promise of promotion or a judgment on unavoidable poverty. The Money theme's notes already handle this distinction well. Psalm 103's praise of healing is retained as the psalmist's worship, not described in marketing as a guaranteed individual medical outcome.

The balanced 108-passage collection is a useful starting point. Expand only when an entry adds a new situation, genre or perspective. A single-theme daily cycle currently repeats after twelve days; the mixed cycle repeats after 108 days. Never advertise a year of unique readings until that coverage actually exists.
