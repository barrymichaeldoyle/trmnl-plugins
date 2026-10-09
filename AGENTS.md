# TRMNL plugin workspace

<!-- @bufferapp/cli skill — managed -->
!buffer context
<!-- /@bufferapp/cli skill — managed -->

Read the official local [.agents/skills/trmnl/SKILL.md](.agents/skills/trmnl/SKILL.md) before TRMNL work. Its references are upstream material; do not edit them to accommodate a plugin. Source revision and license live beside the skill.

This is a pnpm monorepo. Plugins live in `apps/*`; reusable tools live in `packages/*`. Daily Bread is a static Liquid recipe, not a hosted web app. `pnpm dev` runs local development tooling. `pnpm build` creates an importable ZIP; it does not deploy or publish anything.

Preserve the existing Formula 1 News app in its other repository. The README can link to it later. Keep unrelated applications independent; share tooling when a concrete need emerges.

For Daily Bread, preserve one English translation, curated passages, a mixed-theme daily default, user timezone handling, and the prominent cross. Prioritize other languages if translation support expands. Scripture must match the attributed publisher source; never invent, paraphrase, shorten, or truncate it for layout. Update the editorial list first, then use the explicit importer and review the resulting text.

Use TRMNL framework classes in exported markup. No custom CSS, inline styles or emojis; TRMNL's recipe reviewer treats any `<style>` block as a critical finding, so do not reintroduce one. Scripture sits in a reading column with the chapter QR code and the cross stacked in a second column (a row beneath the text in narrow portrait views); all typography, spacing and image sizes use framework classes. The shared script only switches full views to screen dark mode, measures the reading column for Fit Value, and moves the reference into the title bar when it would crowd the passage. The local preview shell may use CSS. Production supplies screen/view wrappers; those belong only in local preview tooling. Verify every changed layout in the browser, including long passages, and inspect for clipping.

AdMob Earnings (`apps/admob-earnings`) is a polling recipe with Google OAuth. Its status and the steps that need credentials are in `docs/admob-earnings.md`; update that status table as work lands. GitHub Sync commits TRMNL saves to `apps/admob-earnings/src/` as `trmnl-sync[bot]` (plugin 499993); pull first, keep comments and a top-level `recipe_overview` out of `settings.yml` (the sync drops both; the Overview goes in the author bio after `<br><br>`), and never push a `trmnlp pull` copy, whose blank polling body and headers would wipe the live request. Never commit the OAuth client ID or secret, access tokens, real publisher IDs or unscaled revenue; recorded responses go to the ignored `.cache/` unless scaled with `--scale`. The same framework-only markup rules apply. Amount sizes come from the transform's measured `ROOM` widths, so remeasure them if tile markup changes, and verify with `pnpm review:admob` and `pnpm review:admob:check`.

Run `pnpm check`, `pnpm test`, and `pnpm build` for changes affecting plugin behavior or packaging. `dist/`, local framework caches, and dependencies are generated and ignored. Do not commit secrets, account IDs, or API keys. Ask before publishing a recipe, uploading to an account, or sending messages. Reversible workspace work is authorized; avoid destructive commands.

For visual review, start with `pnpm review:responsive`: it selects the shortest, a middle-length, and the longest complete passage across all translations, with both QR states and all 24 screen combinations. Read `apps/bible-verses/dist/review/responsive/summary.json` first, starting with its `typography` matrix and `warnings`, then inspect the six labeled `contact-sheets/*.png`; use native screenshots or full `results.json` for individual findings. A clean summary covers automated checks; visual judgment still requires the images, and missing baselines remain unreviewed. The `/review` page shows every case expanded with readable previews. Use `pnpm review:check` for broader theme/language/recovery coverage and `pnpm review:exhaustive` for every passage. See `docs/review-board.md` for bounds and baseline handling.
