# Collection and language review

Reviewed on 2 October 2026. The release collection contains 108 unique passages in each of English, French and Spanish, with twelve entries in each of nine themes. The mixed daily default, user timezone, optional chapter QR code and complete Scripture text are preserved.

## Source fidelity

All 324 passage records match an explicit reimport from the attributed publisher HTML archives into a separate temporary directory, including complete text, localized references and chapter URLs. The three archive SHA-256 hashes match both the stored provenance and the previous collection. See [source-review.json](source-review.json) for the archive URLs, hashes, changed IDs and counts.

There are 25 newly selected passage records and 83 byte-identical retained records per language compared with the previous committed collection. Twenty-six editorial positions changed: Colossians 4:2–4 was retained in the final collection at a different position within Faith & prayer. The editorial list was updated before all three explicit imports; no Scripture wording or punctuation was edited by hand.

The publisher's Psalm superscriptions and the Spanish “NUN.” stanza label are embedded within numbered verses. English speech quotation marks can open or close outside a selected range. The release resolves these display issues by selecting other complete passages, rather than stripping source text or inventing punctuation. The final selections contain no orphaned double quotation marks or embedded Psalm titles/stanza labels.

The seven [French Psalm numbering overrides](../content/selection.fr.json) preserve equivalent passages across translations. In particular, English/Spanish Psalm 55:22 corresponds to Psaumes 55:23; the unused Psalm 13 and Psalm 46:1 overrides were removed as their selections changed. Historical French vocabulary and Spanish spelling remain as published.

The importer preserves word boundaries when removing publisher footnote markers. Its existing regression test covers word joins, punctuation, apostrophes, inline emphasis and adjacent verses. French and Spanish are independently attributed publisher texts, not generated translations of the English collection. Interface descriptions follow the TRMNL account locale; the language preference selects Scripture.

## Release curation

Each passage has one primary theme, two or three internal tags and a context note in [selection.json](../content/selection.json). These editorial aids are excluded from the exported recipe. The following table records the final changes from the previous committed selection.

| Theme | Previous selection | Release selection | Context |
| --- | --- | --- | --- |
| Family & home | COL 3:18-19 | GAL 6:2 | Carrying one another's burdens describes everyday care within a household; keep the link to the law of Christ. |
| Family & home | 1TI 5:3-4 | 1PE 4:8 | Peter's call to earnest love among believers applies to daily life at home; love that covers wrongs, not one that ignores harm. |
| Family & home | 1TI 5:8 | 1CO 16:14 | A closing instruction that frames ordinary household tasks; complete as a single verse. |
| Family & home | PSA 127:3-5 | PSA 127:3 | Children as a gift; verse 3 stands alone. The French numbering matches. |
| Family & home | PRO 17:6 | PRO 14:26 | Wisdom about the shelter a parent's reverence gives a family; a proverb, not a guarantee of outcomes. |
| Relationships | JHN 13:34-35 | ROM 13:8-10 | Paul connects love of neighbors with the commandments; keep the examples and the conclusion that love does no harm. This is not financial advice about borrowing. |
| Relationships | LUK 6:31 | ROM 12:15-16 | Share others' joy and sorrow and associate with the humble; keep the paired instructions about harmony and resisting conceit. |
| Relationships | PRO 17:17 | ECC 4:9-10 | The Preacher's observation on companionship; keep both verses so the image of lifting a fallen friend is complete. |
| Work & purpose | PRO 22:29 | COL 3:23-24 | Paul addresses workers' motivation; keep verse 24 so the reward and service to Christ remain. |
| Work & purpose | ECC 9:10 | 1CO 15:58 | The conclusion of the resurrection chapter gives labour lasting meaning; complete sentence. |
| Work & purpose | 1TH 4:9-12 | HEB 6:10 | Encouragement that God remembers faithful work done in love, including unpaid service to others. |
| Work & purpose | 2TH 3:11-12 | MAT 5:16 | Jesus on visible good works that point to the Father, not to the worker. |
| Money & generosity | PRO 11:24-25 | PHP 4:11-13 | Paul's learned contentment in need and plenty; keep verse 13 within this setting rather than as a promise of success. |
| Money & generosity | MAT 6:19-21 | PRO 23:4-5 | A wisdom warning against exhausting oneself for uncertain riches; keep the image of wealth taking flight, without discouraging necessary work. |
| Decisions & direction | JAS 1:5-8 | JAS 1:5 | The invitation to ask God for wisdom is complete in verse 5. |
| Decisions & direction | PSA 119:105 | PSA 119:130 | The psalmist praises God's words for giving light and understanding; a complete statement without the publisher's alphabetic stanza label. |
| Worry & rest | PSA 23:1-3 | PSA 55:22 | Entrusting burdens to God occurs amid betrayal and distress; sustaining the righteous is not a promise that they will escape suffering. |
| Hard times & loss | ROM 12:14-15 | MAT 5:4 | A beatitude for those who mourn; comfort is promised without minimizing grief. |
| Hard times & loss | PSA 13:1-6 | PSA 94:17-19 | The psalmist recalls near despair, a slipping foot and anxious thoughts amid oppression; retain the acknowledgment of distress with God's sustaining comfort. |
| Hard times & loss | PSA 46:1 | 2CO 1:3-4 | Paul praises God for comfort in affliction that equips believers to comfort others; retain both suffering and the call to shared care. |
| Hard times & loss | JAS 1:2-4 | ISA 41:10 | God's assurance to his people in exile; present it as reassurance of his presence, not freedom from hardship. |
| Joy & gratitude | PSA 103:1-5 | PSA 145:8-10 | Praise names God's compassion and goodness and leads to thanksgiving; keep these attributes with the response of God's works and faithful people. |
| Joy & gratitude | EPH 5:18-21 | COL 3:15 | Peace ruling in a community, closing with the call to be thankful. |
| Faith & prayer | MAT 6:5-6 | COL 4:2-4 | Steadfast prayer and thanksgiving lead into prayer for Paul to speak of Christ while imprisoned; keep the whole request. |
| Faith & prayer | COL 4:2-4 | HEB 11:1 | The opening definition of faith in Hebrews 11; complete as a single verse. |
| Faith & prayer | 2CO 5:6-8 | ROM 15:13 | Paul's benediction of hope, joy and peace through the Holy Spirit. |

Keep complementary instructions and conditions together. Proverbs express wisdom, not guaranteed wealth, promotion or health. Assurances of God's presence do not deny suffering; the collection includes mourning, shared sorrow, anxious thoughts and comfort offered to others. Philippians 4:11–13 retains Paul's contentment in need and plenty around the often isolated verse 13. Prayer retains thanksgiving and the request to speak of Christ in Colossians 4:2–4.

## Browser and release validation

The release browser review uses the current source fingerprint and TRMNL framework 3.4.0. The responsive suite covers the shortest, median and longest complete passages across all languages, with both QR states in all 24 layout/device/orientation combinations. The broader curated suite covers themes, languages, longest passages, theme combinations and recovery. See [release-layout-checks.json](release-layout-checks.json) for final coverage, warning counts and visual inspection evidence.

Documentation and listing screenshots were regenerated through the checked browser pipeline; their [manifest](screenshots.json) references current selections. The listing keeps Matthew 11:28–30, and the theme examples now use Colossians 3:23–24. The longest French passage is Hébreux 4:14–16 at 473 characters; the longest English and Spanish passages are 431 and 405 characters respectively. Font fitting preserves all text and references.

The listing icon uses the existing dimensional cross in a square monochrome asset. A small embedded SVG cross is included in every title bar. Publication files and copy are described in [listing.md](listing.md).

`pnpm check`, `pnpm test` and `pnpm build` validate settings, Liquid, language consistency, complete rendered text, timezone/rotation behavior and the self-contained ZIP import round trip. Local browser profiles simulate devices; account and physical-device appearance remain part of the final submission review. Visual baselines have not been recorded, so screenshots with clean layout assertions remain labelled unreviewed for pixel regression comparison. Native-speaker feedback remains welcome.
