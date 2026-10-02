# Curating Daily Bread

Daily Bread gives the reader one complete Scripture passage each day by default. Theme preferences narrow that passage's subject; they do not add more content to the display. Keep theme configuration to a single multi-select; internal tags and editorial notes do not add user-facing controls.

## Practical themes

| Theme | Editorial focus |
| --- | --- |
| Family & home | Marriage, parenting, care for relatives, generations and cultivating a home |
| Relationships | Friendship, listening, kindness, conflict, forgiveness and community |
| Work & purpose | Honest effort, skill, responsibility, perseverance and service, including unpaid work |
| Money & generosity | Contentment, priorities, possessions, integrity, giving and care for people in need |
| Decisions & direction | Wisdom, counsel, discernment, planning and use of time |
| Worry & rest | Anxiety, fear, weariness, peace, sleep and dependence on God |
| Hard times & loss | Lament, grief, suffering, discouragement, perseverance and hope |
| Joy & gratitude | Thanksgiving, celebration, worship, remembering and ordinary gifts |
| Faith & prayer | Prayer, dependence on Christ, spiritual growth and self-examination |

The collection currently contains 12 passages in each theme, 108 unique passages in each language. This is an initial balanced collection, not a requirement to fill quotas with weak selections. The importer supports different theme sizes when the editorial list grows.

## Editorial record

`content/selection.json` is the source of editorial decisions. Each entry has:

- `reference`: the canonical English passage range used to identify the selection across languages.
- `tags`: two or three specific situations or practices, used to review variety within a theme.
- `note`: why the passage belongs, its setting and any interpretation to avoid.

Each passage has exactly one primary theme. Internal tags can overlap, but never create duplicate entries in the reading cycle. Notes and tags are editorial aids, not Scripture, devotionals or additional user-facing settings; the importer leaves them out of the exported recipe.

## Selection and review

1. Identify an everyday situation the reader might recognize. Select a passage that actually addresses it in its original setting.
2. Read the passage in its chapter. Preserve complete thoughts and the verses needed for context, even when this makes a passage longer. Never edit or truncate Scripture for layout.
3. Record the reason for selection and useful tags. Check that each theme includes practical conduct as well as encouragement, and that it covers several situations rather than repeating one message.
4. Treat proverbs as wisdom, historical promises in their original setting, and future hope as future hope. Do not imply guaranteed wealth, promotion, health or freedom from suffering. Retain relevant paired instructions and conditions.
5. Update the editorial list first. Update French numbering overrides when Psalm ranges change, then explicitly run the importer for each language using its publisher archive. Review the generated text and source-specific references.
6. Run `pnpm check`, `pnpm test` and `pnpm build`. Inspect the longest passages in all four layouts and supported local device profiles, in both orientations. Complete text must remain visible without clipping or overlap.

The [2 October collection and language review](content-review.md) verified all 324 imported passage records against the publisher archives, reviewed localized references and interface wording, and identified specific editorial improvements. The user accepted the agent review for release; native-speaker feedback remains welcome. Local previews do not replace reviewing the imported recipe on a TRMNL account and physical device.

## Theme preferences

The exported TRMNL settings use the platform's native multi-select, labelled with one word per theme. An empty selection is the default and mixes every theme; one or several selections restrict the cycle to those themes. Installations that saved the earlier “All themes” value (`all`) keep the mix, and specific selections still take priority over it. Empty or entirely unrecognized values restore the mixed default. Unknown values alongside valid choices are ignored, without adding unwanted themes. Selection order and duplicate choices do not change the cycle.

The interleaved collection alternates among selected themes, with no repeated passage until the filtered cycle repeats. At the current collection size, one theme has a 12-slot cycle, two have 24, and all nine have 108. An hourly interval traverses the same collection faster; it does not increase the number of simultaneous passages.

Previous single-theme values remain supported: peace → Worry & rest; hope/strength → Hard times & loss; trust/prayer → Faith & prayer; wisdom → Decisions & direction; love → Relationships; gratitude → Joy & gratitude.

The [release browser review](release-layout-checks.json) records complete text and passage/reference bounds across 144 responsive and 1,224 curated captures, including the longest passages with QR display enabled and disabled. Its visual inspection record distinguishes reviewed images from missing pixel-comparison baselines.

The local preview uses a collapsed checkbox picker to make multiple selections easier. This is a simulation of the same filtering behavior; the TRMNL account form uses the platform's own multi-select UI.
