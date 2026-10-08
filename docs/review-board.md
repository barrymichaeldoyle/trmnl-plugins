# Visual regression review board

The local board starts with the shortest, a middle-length and the longest passage
across the complete multilingual library. Each uses its original language and
publisher text. Both QR states give six cases, each with all 24 combinations of
four layouts, three device profiles and two orientations. Every case is expanded
on a scrollable page.

Readable previews are the default: two layout columns per device/orientation on
desktop, one on mobile. Large increases preview height. Overview shows all 24 in
a compact matrix. Source renders always stay at native dimensions.

## Open the board

After `pnpm install`, install the screenshot browser once:

```sh
pnpm review:install
pnpm review
```

Open <http://127.0.0.1:4567/review>. The same route is available from `pnpm dev`,
so use an existing preview server instead of starting another on port 4567.
**Single preview** returns to the original workbench.

Previews capture as they enter the page, with four browser workers. **Check entire
suite** captures all cases. Optional sample links jump down the page; scrolling
shows everything without switching settings. Every case starts expanded. Search is optional and matches languages,
themes, and references. Open **Checks** under a thumbnail for measurements,
errors, a native render, the screenshot, and any baseline/difference image.

Length sampling sorts the 324 complete passages by Unicode character count, with
a stable reference ID tie-break. The middle example is the upper middle passage
(rank 163); it is reproducible across runs. Samples are recomputed from current
content. The current examples are 1 Corinthians 16:14 (English, 36 characters),
Salmos 145:18–19 (Spanish, 172), and Hébreux 4:14–16 (French, 473).

Choose **Curated regression suite** for broader coverage: 51 cases and 1,224
captures, including each language's median and longest, defaults, shortest
passages, longest passages in every theme, multiple-theme selections, QR disabled,
longest references, and missing-content recovery, in all three languages.
Rotation intervals and timezone boundaries remain covered by behavioral tests.

Cases use the actual collections and filtering transform. A fixed timestamp and
UTC offset select the intended publisher passage through normal rotation logic.
Recovery cases use isolated local data; they do not modify the exported recipe.

## Agent and CI reports

```sh
pnpm review:responsive
pnpm review:check
pnpm review:check --scenario fr-shortest
pnpm review:check --limit 24
pnpm review:check --shard 2/4 --workers 4
```

The runner starts its own temporary server and closes it afterward; no existing
browser or dev server is needed. Reports are written to
`apps/bible-verses/dist/review/responsive/` for the quick suite,
`apps/bible-verses/dist/review/curated/` for broader coverage, or a shard-specific
directory:

- `index.html`: an offline board with screenshots, failed/changed cases first.
- `summary.json`: compact coverage, pass/fail/change/baseline counts, sample
  references and lengths, contact-sheet paths, and actionable failures. No full
  Scripture or per-render successful measurements are repeated.
- `typography` in `summary.json` (also printed by the runner): a screen × case
  matrix of fitted font size and the share of layout height the Scripture fills,
  such as `20px 97%`. It compares devices without opening images; contact-sheet
  tiles are scaled to fit their cells, so their apparent sizes are not comparable.
- `warnings` in `summary.json`: non-failing legibility and spacing signals. A
  passage below its legibility floor is flagged. The floor is 16px (the
  framework's smallest value size) unless `plugin.config.json` sets
  `review.min_font_size` per view; Daily Bread accepts 10px in the quadrant,
  where the longest passages cannot fit larger without truncation. Text is also
  flagged when fitting shrank it while it fills under 45% of the layout, which usually
  means reserved space is wasted. Shrinking forced by a long word is not flagged.
- `contact-sheets/`: one labeled PNG per captured case, with all 24 screens and a
  provenance JSON sidecar. Tile captions show the same font size and fill, and
  warned tiles are outlined. Missing captures are explicit, including partial runs.
- `results.json`: case inputs, expected and actual passage/reference, measurements,
  errors, screenshot paths, source fingerprint, browser environment, and coverage.
- `screenshots/`: native PNGs and difference images.
- `baselines/`: reference images used by this run, when present.

For agents, read `summary.json` first: the typography matrix and warnings show
sizing problems across devices in one table. Then inspect the six responsive contact sheets,
then open native screenshots for any ambiguous small text or layout issue. Use
`results.json` only when detailed measurements are needed. A clean automated
summary does not replace looking at the images. This avoids hundreds of individual
image reads and a large JSON dump. The live board offers **Agent summary** at
`/review/summary?mode=responsive`; it summarizes captures made by that server.

Contact sheets are generated for responsive and curated suites by default.
`--no-contact-sheets` skips them; `--contact-sheets` enables them for exhaustive
or full-settings runs. Their scaling does not affect the native layout checks.

Open `index.html` directly in a browser. Reports from limited or sharded runs mark
uncaptured tiles explicitly. `--output <directory>` changes the report location;
paths are relative to the plugin directory unless absolute.

Captures wait for fonts, images, and TRMNL fitting to settle. Assertions check the
complete Scripture against its collection, the expected reference and chapter
link, visible text fragments, clipping ancestors, view bounds, rendered lines
overlapping the QR code or cross (line boxes, not the paragraph box), images,
recovery instructions, and browser/asset errors. Screenshots render at native
pixel dimensions and are scaled only in the report. Device profiles simulate the
framework; physical-device appearance still needs a device check.

CI installs Chromium, runs the quick responsive and complete curated suites, and
uploads the HTML, contact sheets, compact summaries, full JSON,
and screenshots as the `daily-bread-review` artifact, including failed runs. Local
Git hooks keep their existing fast checks, tests, and ZIP build; they do not start
this browser suite.

## Visual baselines

Without a baseline, a capture is labeled **No baseline** even when its layout
checks pass. This is distinct from a screenshot comparison passing. Layout/render
failures and changes from an existing baseline make the runner exit nonzero.

Inspect the output before recording reference images explicitly:

```sh
pnpm review:check --update-baselines
pnpm review:check --require-baselines
```

References live in `apps/bible-verses/review-baselines/<environment>/`. Keep these
under version control after review. The environment key includes the Chromium
version, operating system, architecture, and pixel ratio. Generate and compare
baselines in the same environment; macOS captures cannot substitute for Linux CI
baselines. See [Playwright's environment guidance](https://playwright.dev/docs/test-snapshots).

Baselines are never silently replaced. `--update-baselines` updates only cases
that pass layout checks. `--require-baselines` also fails for missing references;
add it to CI after reviewing the initial Linux baseline set. Pixel comparison
ignores small antialiasing differences using pixelmatch's 0.1 threshold; every
remaining changed pixel is reported.

Successful captures are cached in the plugin's ignored `.cache/review/`, keyed by
source and browser environment. Each run keeps the current fingerprint and the two
most recent others, deleting older ones; report screenshots and contact sheets are
rebuilt on every run, so files from earlier sample sets do not linger. The source fingerprint covers templates, data,
settings, transform, config, and renderer/checker code. Repeated runs resume cached
work. `--fresh` forces recapture. Failed captures retry on the next run. The live
board notices source changes and asks for **Reload source**, so old captures cannot
silently represent new templates. Saved reports remain tied to their recorded
fingerprint.

## Exhaustive coverage

Choose **Every passage · Exhaustive** in the board, or run:

```sh
pnpm review:exhaustive
pnpm review:exhaustive --shard 1/8 --limit 240
```

This covers all 108 passages in each language, both QR states, and every screen:
648 cases and 15,552 captures. Use sharding and limits to divide large reviews.

Full settings coverage is a separate explicit option:

```sh
pnpm review:check --all-settings --shard 1/32 --limit 10000
```

At a fixed timestamp it covers all language, theme-subset, interval, QR, layout,
device, and orientation combinations. The current product has 294,912 captures,
including empty theme selection. `--all-settings` requires a positive `--limit`;
shards select disjoint case indices before applying that limit. Use enough of a
limit to complete each shard when collecting a full report. Arbitrary timestamps
and offsets cannot be literally exhausted; boundary tests cover their behavior.

The shared tooling's current review adapter expects the Daily Bread Scripture
schema and `reading_pool` transform contract. Other plugins can reuse the server,
capture pool, reporting, and device geometry after adding their own scenario and
assertion adapter.

## Documentation and listing images

`apps/bible-verses/docs/screenshots.json` declares each README and listing image
by file, passage, language, screen and QR state. Run `pnpm screenshots` after a
layout change. It renders through the review pipeline at native size, selects
each passage through normal rotation, and refuses to write an image whose render
fails the layout checks.

## Apps with declared review cases

Apps without a Scripture collection, such as AdMob Earnings, list their cases in
`plugin.config.json` instead of having them sampled from passages:

```json
"review": {
  "min_font_size": { "quadrant": 12, "default": 16 },
  "cases": [
    { "id": "jpy-both", "name": "Seven-digit yen · both", "fixture": "jpy",
      "fields": { "comparison_style": "both" }, "utc_offset": 32400,
      "suites": ["responsive", "curated"],
      "expect": [], "expect_by_view": { "full": ["¥36,342,382"] } }
  ]
}
```

Each case renders a recorded fixture at the time it was recorded, with the given
fields. `suites` chooses where it runs (`pnpm review:admob` is the responsive
suite, `pnpm review:admob:check` the curated one); `--exhaustive` runs every
case. Beyond the shared view, image and title-bar checks, a declared case fails
when any `expect` text (plus the view's `expect_by_view` text) is not visible,
when text leaves the view, is clipped or spills out of its `[data-tile]`, when
tiles overlap, or when an amount (`[data-amount]`) overflows its box. The
typography matrix reports the smallest amount size and the share of the layout
the tiles fill. Documentation images name a case instead of a passage in
`docs/screenshots.json`.
