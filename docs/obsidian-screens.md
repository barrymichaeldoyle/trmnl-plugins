# Obsidian Screens: plan and status

## Status

9 October 2026: **running end to end with the demo vault.** Obsidian pushes all six screens to six installs on the device; mobile and publishing remain. [`apps/obsidian`](../apps/obsidian/README.md) holds both halves: the TRMNL Screens Obsidian plugin and the Obsidian Screens webhook recipe, with a demo vault that doubles as test data. `pnpm check`, `pnpm test` and `pnpm build` cover it. The responsive and curated review suites pass on all 24 screens (456 captures, with expected text per view), and the contact sheets have been inspected; no visual baselines are recorded yet.

| Step | State |
| --- | --- |
| 1. Collectors for all six screens, fixtures from the demo vault, tests | Done |
| 2. Recipe views for every screen at all four sizes, both orientations, OG and X | Done; baselines not yet recorded (`pnpm review:obsidian:check --update-baselines` after a final look) |
| 3. Obsidian plugin runtime: scheduler, push budget, secrets, settings, status bar, commands | Done; tested with a fake Obsidian API (`test/runtime.test.js`) |
| 4. Load the plugin in Obsidian with the demo vault | Done 9 October 2026: Obsidian 1.14.4 on macOS, all six screens connected through secrets and pushed from Obsidian (20:25 to 20:41). The Dataview screen shows its install message until Dataview is added to the vault |
| 5. Import the recipe on TRMNL, push each screen, check on the device | 9 October 2026: private plugin 500911 created with `pnpm --filter @trmnl/obsidian upload`, on the device playlist. A daily-tasks payload built by the collector was written through the account API (`POST /api/plugin_settings/500911/data`); TRMNL's own preview renders all four sizes as the local review does. The other five screens followed the same way as plugins 500917 (Due), 500918 (Projects, from the demo's Dataview stand-in), 500919 (Resurfaced), 500920 (Writing) and 500921 (Focus), each renamed "Obsidian · …" and on the device playlist. Each is connected to its screen in Obsidian |
| 6. Mobile check (iOS or Android Obsidian) | Skipped for now: the plugin avoids desktop-only APIs and declares mobile support, but has not run on a phone |
| 7. Publish: recipe on TRMNL, plugin in Obsidian's community directory | Plugin published 9 October 2026 at [community.obsidian.md/plugins/trmnl-screens](https://community.obsidian.md/plugins/trmnl-screens); release 0.1.1 is built and attested by GitHub Actions and passes the directory's review, including a byte-for-byte rebuild. The recipe was submitted for TRMNL's review as Public on 9 October 2026 from plugin 500911 (\"Plugin in review\"), after fixes for Chef and AI Chef; see [apps/obsidian/docs/listing.md](../apps/obsidian/docs/listing.md) |

## Where this differs from the original spec

The spec came from a conversation with another model. These decisions supersede it:

- **One recipe, not six private plugins.** Every push carries `screen`, and one set of four Liquid views switches on it. Installing the recipe once per screen still gives each screen its own webhook and push budget, but there is one recipe to review, ship and publish instead of 24 pasted templates. The "copy template" commands are gone.
- **No emoji on the display.** The spec kept emoji in task text; TRMNL renders them as empty boxes and its rules forbid them, so collectors strip them along with Tasks signifiers. Checkboxes and the title-bar icon are inline SVG.
- **Secrets in Obsidian's secret storage.** Obsidian 1.11.4 added `SecretStorage` and `SecretComponent`, so webhook URLs are stored there instead of a hand-made `secrets.json` or an external file. Settings keep only the secret's name; push budgets are keyed by a hash of the URL. `minAppVersion` is 1.11.4.
- **The webhook field takes the URL TRMNL shows**, or the bare UUID.
- **Writing stats send the last 14 days each time** with the default merge strategy. `deep_merge` would grow TRMNL's stored history without bound, and 14 numbers fit easily.
- **Daily note settings are read directly** from the core Daily Notes plugin or Periodic Notes rather than through `obsidian-daily-notes-interface`, which pulls in a second copy of moment and Obsidian internals.
- **JavaScript, not TypeScript**, to match the rest of the repository. esbuild bundles the plugin; the collectors are plain modules that run in Node, so tests and the fixture generator use the same code as Obsidian.
- **Screens are a list**, not six fixed slots, so a vault can have two pinned notes or two queries.
- **Due tasks look ahead seven days by default** (the spec said today only), so the screen has an upcoming section.
- **Fit to the byte limit by dropping whole items.** Text is never cut mid-word to fit; per-item text is clipped at a word boundary with an ellipsis before that.

## Framework findings

Two things in TRMNL framework 3.4 shaped the views and are worth reporting upstream:

- On TRMNL X the screen is `transform: scale(1.8)`. The overflow engine's budget comes from `getBoundingClientRect` (scaled) but is compared with `scrollHeight` (unscaled), so long lists are under-trimmed and spill out of single columns. Each view caps its list at what fits on X; on OG the engine still trims and counts the rest.
- The clamp engine measures the width of the nearest flex or grid child. A clamped span that shrinks to its text (inside `flex--left`, say) is measured at its own width and cut early; clamped spans here are `w--full`.

The shared review tools gained two things for this recipe: `review.allow_line_clamp`, so text shortened by the framework's clamp engine is not reported as clipped, and line-box comparison (already used for tiles) in the clipping and view checks, so glyph overhang is not reported as clipping.

## Open questions

- Whether TRMNL counts a request that it rejects (4xx) against the hourly budget. The plugin counts every request it sends.
- The listing icon and title-bar icon are a note page with a tick, not the gem used during development, so nothing resembles Obsidian's logo.
