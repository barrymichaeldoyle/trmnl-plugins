# Baby Buddy: plan and status

## Status

10 October 2026: **specified, not started.** The recipe will live in `apps/baby-buddy` and follow the AdMob Earnings layout of the workspace (polling recipe, transform, four views, synthetic fixtures, review suites). Nothing has been built or uploaded.

| Step | State |
| --- | --- |
| 1. Workspace, synthetic fixtures, transform, views, tests, root scripts | Not started |
| 2. Confirm the instance is reachable from TRMNL's servers over HTTPS, record a scrubbed real response | Not started; see [Hosting](#hosting) |
| 3. Private plugin on TRMNL, first refresh, device check | Not started |
| 4. Live with it for a week, adjust the Today tiles and the history | Not started |
| 5. Publish the recipe (listing, icon, categories) | Not started |

## Goal

A TRMNL recipe that shows, for one child in a self-hosted [Baby Buddy](https://github.com/babybuddy/babybuddy) instance:

1. **Today**, first and largest: how many of everything so far, the last of each, and anything running right now.
2. **The last seven days**, a visual history of feeds, sleep, nappies and pumping, the view the app's dashboard offers and the one we look at most.

It reads with the user's API key. No hosted middle service, no OAuth: TRMNL polls Baby Buddy directly and a transform turns the entries into the numbers the views need.

Baby Buddy was chosen over Momcozy because Momcozy has no API.

## How we log, and what the recipe must not assume

Our logging through the iOS app, at four weeks old, as of 10 October 2026:

- **Child** is picked once when the app is set up, so every entry carries a child. The recipe shows one child per install; a second child is a second install with its own child setting, the way Obsidian Screens installs once per screen.
- **Feeding** by type. Breastfeeding: side (left, right or both) and the time taken; "both" is one entry with the total time. Bottle: amount in ml. Both carry when. The app cannot say whether a bottle held breast milk or formula, so the recipe ignores Baby Buddy's `type` field for bottles.
- **Timers** are used: a feed or sleep is started as a timer and saved as the entry when it ends. So at any moment there may be a running timer, and the screen should show it ("Feeding since 14:02", "Asleep since 13:40").
- **Pumping**: when, how long, side, amount in ml. Baby Buddy's pumping entry has no side field (`amount`, `start`, `end`, `notes`, `tags`), so the app probably writes the side into notes or tags, or drops it. The recording in step 2 settles this; the recipe shows a side only when it finds one.
- **Nappies**: wet, dirty or mixed, and when. In Baby Buddy a nappy is `wet` and `solid` flags; mixed is both.
- **Sleep**: lay-down time and wake time. No nap category is set, so Baby Buddy decides `nap` itself from its nap window (sleep starting in daytime is a nap). The recipe uses that flag for "naps" and "night" but never depends on it.
- **Not used**: medication, milestones, tummy time, notes, measurements. All optional on screen.

The recipe is for everyone, so each element appears only when the installer logs that thing. See [Adapting to how people log](#adapting-to-how-people-log).

Terminology: Baby Buddy says "diaper change"; the views say **nappy**, with a setting to switch to "diaper".

## What the screen shows

### Full (800×480 and the other full sizes)

Title bar: an inline SVG icon (never an emoji), the child's first name and age ("Ada · 4 weeks 2 days"), and "Updated 13:20" on the right. Relative times are as of the refresh, so that time matters. Age is days under two weeks, weeks and days under six months, months and weeks under two years, then years and months.

**Top band: Today.** A row of equal tiles, one per live feature, each with a count as the large value, a detail line, and a "last" line that becomes a "now" line while a timer runs:

| Tile | Large value | Detail line | Last or now line |
| --- | --- | --- | --- |
| Feeds | 8 | "3 breast · 1h 10m, 5 bottle · 420 ml" (only the parts used today) | "Last 1h 20m ago · Right breast 12 min", "Last 40m ago · Bottle 90 ml", or "Feeding since 14:02" while a feeding timer runs |
| Nappies | 7 | "4 wet · 1 dirty · 2 mixed" | "Last 2h 05m ago · Wet" |
| Sleep | 4h 10m | "3 sleeps · longest 1h 25m" and, when the nap flag splits them, "naps 2h 40m · night 1h 30m" | "Asleep since 13:40" while a sleep timer runs, else "Woke 45m ago · slept 1h 25m" |
| Pumping | 240 ml | "3 sessions · 48 min" with sides when known | "Last 3h ago · 90 ml", or "Pumping since 15:10" |
| Tummy time | 12 min | "2 sessions" | "Last 10:30", or "Tummy time since 16:00" |

A timer's tile is decided by its name (contains "feed", "sleep" or "nap", "pump", "tummy"); an unnamed timer, which Baby Buddy allows, shows as "Timer since 14:02" in the first tile that has nothing running. When the baby is asleep by timer, the sleep tile's value is inverted (`bg--black` on the tile) so the state is visible across the room.

Four tiles fit comfortably across 800 px with the value in `value--large`; with five live features the tiles use the next size down; with two or three they widen. Relative times round to "35m ago", "1h 20m ago", "1d 4h ago"; over 36 hours the clock time and day appear instead ("Tue 09:15"), which also flags a lapse in logging.

**Bottom band: Last 7 days.** Three column charts side by side (Chartkick with Highcharts from TRMNL's CDN, the framework's documented chart setup, with pattern fills for 1-bit screens), seven columns each, labelled by weekday initial, today on the right in a lighter pattern, the value printed above each column so the numbers can be read as a table:

| Chart | Columns | Second series |
| --- | --- | --- |
| Feeds per day | count | none; the bottle volume for the day is printed under the count when any bottle was logged ("8 / 420") |
| Sleep hours per day | total hours, split at midnight like Baby Buddy's dashboard | stacked naps and night when the nap flag is in use |
| Nappies per day | count, stacked wet, dirty, mixed | |

When pumping is live it takes a fourth chart (ml per day) and the four share the width; when tummy time is live and pumping is not, tummy minutes take that slot. With fewer than three live features the charts widen.

### Half horizontal (800×240)

The Today tiles only, value and detail line, with the "now" line kept when a timer runs and the "last" line dropped. The history does not fit at this height.

### Half vertical (400×480)

The Today tiles stacked two per row (value plus detail, "now" line when a timer runs), then one chart: feeds per day with sleep hours as a line on a second axis, since this is the pair we compare most. Nappies and pumping history are left to the full view.

### Quadrant (400×240)

Today's counts only: "8 feeds · 7 nappies · 4h 10m sleep · 240 ml pumped", one per row, in `value--small` with labels. A running timer replaces the label of its row ("Asleep since 13:40").

### Adapting to how people log

Baby Buddy users differ: some breastfeed with no amounts, some bottle-feed, some never start a timer, some log pumping or tummy time daily, some never. The screen must look complete for all of them, so every element is conditional on what has been logged, and nothing says "Not logged yet" for a feature that is simply not used.

Rules, applied by the transform:

- **A feature is live when it has an entry in the last 14 days.** Feeds, nappies and sleep are expected; pumping and tummy time join when live. A brand-new child with no entries shows the `no_data` message. Tiles and charts show only live features, and the layout widens to fill the row.
- **Feed detail shows the methods used today.** Breastfeeds show count and total minutes, bottles count and total ml; a day with only one method shows only that part. Baby Buddy's `type` is ignored for bottles because apps do not reliably set it.
- **Sides** ("L 2 · R 1 · both 1") appear in the feed tile only when a breast method was logged today.
- **"Now" lines** appear only while a timer runs. Without timers every tile shows its last entry, which is still correct, and the listing explains that starting a timer in Baby Buddy turns the tile into a live indicator.
- **Naps against night** appear only when today's sleeps carry both flag values; otherwise the tile shows the total and the count. The nap flag is usually set by Baby Buddy's nap window, so this works even when nobody sets it by hand.
- **Pumping sides** appear only when a side can be read from the entry's tags or notes (`left`, `right`, `both`), case-insensitive.
- **Units** are a setting (ml by default, fl oz, or none) because Baby Buddy stores amounts without a unit. "None" prints the bare number.

### Appearance

Light by default. A Dark setting follows the Daily Bread convention: the shared script switches the full-size view to screen dark mode, and the charts invert their pattern fills with it. Framework classes only; no `<style>`, no inline styles, no emojis. The chart scripts are the framework's documented ones.

### Statuses

The transform never throws; it returns a `status` the views explain in large type:

| Status | When | Message |
| --- | --- | --- |
| `setup` | Base URL or API key empty | "Enter your Baby Buddy address and API key in this plugin's settings." |
| `auth` | Baby Buddy answers 401 or 403 | "Baby Buddy rejected the API key. Copy it from User Settings → API in Baby Buddy." |
| `unreachable` | Non-JSON or empty response | "Could not reach {host}. It must be reachable from the internet over HTTPS." |
| `no_child` | Children list empty, or the chosen child not found | "Add a child in Baby Buddy, then choose them here." |
| `no_data` | Child exists but has no entries | "Nothing logged for Ada yet." |
| `ok` | At least one live feature | |

## How it works on TRMNL

### Strategy

`polling`, verb `GET`, several URLs (one per line in `polling_url`), which TRMNL hands to the transform as `IDX_0`, `IDX_1` and so on. The local tooling already handles this (`packages/plugin-tools/src/plugin.js`). Refresh interval 15 minutes, TRMNL's floor, since "ago" and "since" values age with every minute.

### Requests

All relative to the Base URL. The API key goes in the headers: `polling_headers: authorization=Token {{ api_key }}`. Baby Buddy answers 403 to a missing or wrong key.

Each list asks for the last eight days with Baby Buddy's range filters, so the seven-day history is complete in any time zone and the eighth day covers midnight splits. `since` is Liquid in the URL, rendered by TRMNL in UTC, which AdMob Earnings already relies on in its polling body:

```liquid
{{ "now" | date: "%s" | minus: 691200 | date: "%Y-%m-%dT%H:%M:%SZ" }}
```

| Index | URL | Why |
| --- | --- | --- |
| `IDX_0` | `/api/profile/` | The Baby Buddy user's `timezone`, used for "today" and clock times, matching what the app shows |
| `IDX_1` | `/api/children/?limit=10` | Name and birth date; the first child is the default |
| `IDX_2` | `/api/feedings/?limit=300&ordering=-start&start_min={{ since }}` | Feeds: today's tile and seven-day counts and volumes |
| `IDX_3` | `/api/sleep/?limit=100&ordering=-start&end_min={{ since }}` | Sleep: today's tile and seven-day hours; `end_min` keeps a sleep that started before the window |
| `IDX_4` | `/api/changes/?limit=300&ordering=-time&date_min={{ since }}` | Nappies: today's tile and seven-day stacked counts |
| `IDX_5` | `/api/pumping/?limit=100&ordering=-start&start_min={{ since }}` | Pumping: tile and history |
| `IDX_6` | `/api/tummy-times/?limit=100&ordering=-start&start_min={{ since }}` | Tummy time: tile and history |
| `IDX_7` | `/api/timers/?limit=10` | Running timers; Baby Buddy deletes a timer when an entry is saved from it, so the rows present are the running ones |

A newborn's eight days is roughly 100 feeds and 80 nappies, about 50 KB in total; the transform returns a few hundred bytes of merge variables. No request filters by child: TRMNL documents `{{ keyname }}` substitution in polling URLs but not `{% if %}`, so the transform filters by child, and a sibling's entries only cost payload. With two children the limits still hold (300 feeds covers two newborns for eight days).

Every list response is `{ count, next, previous, results: [...] }`. Entry fields the transform reads:

- Feeding: `child`, `start`, `end`, `duration` ("HH:MM:SS"), `method` (`bottle`, `left breast`, `right breast`, `both breasts`, `parent fed`, `self fed`), `amount` (float, unit undefined).
- Sleep: `child`, `start`, `end`, `duration`, `nap`.
- Change: `child`, `time`, `wet`, `solid`.
- Pumping: `child`, `start`, `end`, `duration`, `amount`, `notes`, `tags`.
- Tummy time: `child`, `start`, `end`, `duration`.
- Timer: `child`, `name` (nullable), `start`. A timer with no child counts for every child.
- Child: `id`, `first_name`, `slug`, `birth_date`.

### Day rules

The transform works in the profile's time zone and copies Baby Buddy's dashboard rules (`dashboard/templatetags/cards.py`), so the numbers agree with the app:

- "Today" starts at local midnight in the profile time zone; the seven days are today and the six before it.
- A feed belongs to the day its `end` falls on. Bottle volume sums `amount`, treating a missing amount as zero; breast minutes sum `duration` of breast methods.
- Sleep crossing midnight is split at midnight: the part before counts towards the earlier day. (Baby Buddy's nap card counts a nap on both days it touches; the split is used for both kinds here.)
- A nap is a sleep with `nap` true.
- Tummy time and pumping belong to the day they end.
- A mixed nappy counts once, as mixed. (Baby Buddy's seven-day card counts it as both wet and solid.)
- A running timer counts towards nothing until it is saved; the tile shows it as "since".

### Settings (custom fields)

| Keyname | Type | Notes |
| --- | --- | --- |
| `base_url` | `string` | "https://baby.example.com", no trailing slash |
| `api_key` | `password` | From Baby Buddy → User Settings → API. Stored by TRMNL, never in the repository |
| `child` | `string`, optional | The child's first name, slug or ID, matched case-insensitively; blank means the first child. Install the recipe once per child to show several. A dynamic dropdown was considered: TRMNL's server-side `remote:` block documents only `{{ oauth_access_token }}` substitution, and the client-side `endpoint:` option calls the URL from the installer's browser with a POST and a CSRF header, which Baby Buddy would refuse and which would put the API key in a browser request |
| `amount_unit` | `select` | ml (default), fl oz, none |
| `nappy_word` | `select` | Nappy or diaper |
| `appearance` | `select` | Light or dark |
| `about` | `author_bio` | Listing copy, as in the other recipes (Overview after `<br><br>`) |

### Transform

`src/transform.js`, default JavaScript runtime, `transform(input)`. A plain module with no imports, so tests and a possible push script (see Hosting) load the same file.

1. Read settings; return `setup` when the URL or key is blank.
2. Detect failure: any `IDX_n` that is not an object with `results` (profile excepted). A `detail` string mentioning credentials or token is `auth`; otherwise `unreachable`.
3. Resolve the child: match the `child` setting against first name, slug and ID, else the first child; `no_child` when none. Filter every list to that child's ID; timers with no child are kept.
4. Establish "now" (poll time) and the seven local day boundaries in the profile time zone with `Intl`, falling back to `trmnl.user.time_zone_iana` and then `trmnl.user.utc_offset`, the chain AdMob Earnings uses.
5. Bucket every entry by the day rules above into seven days; today's bucket feeds the tiles, all seven feed the charts.
6. Decide live features, assign running timers to tiles by name, and build the tile and chart sets.
7. Write display strings in the transform, not Liquid: durations, amounts with the unit, relative and clock times, the age string, the detail lines. Views only place text and pass the chart arrays to Chartkick with `| json`.
8. Return `{ status, child: { name, age }, updated, tiles: [...], charts: [...] }`.

### Views

`full.liquid`, `half_horizontal.liquid`, `half_vertical.liquid`, `quadrant.liquid`, with `shared.liquid` for the title-bar icon capture, the chart script tags and the dark-mode script. Tiles use the framework's `layout` and `item` classes, value sizes picked in the transform from the longest string so tiles match. Charts follow the template guide's chart section: no title, no credits, no legend (the stacked series are explained by a row of pattern swatches with labels under each chart), data labels on, axes trimmed to weekday initials, and `pattern-fill.js` for the stacked series. Verify every size in the browser with the review suites, including a seven-day stretch with a 14-hour sleep day and a zero day, and check that data labels never overlap the columns.

A tooling check for step 1: confirm the local preview and review capture load the TRMNL CDN chart scripts, and that the review tool's clipping checks cope with SVG charts.

## Hosting

Baby Buddy has no hosted service of its own and no official iOS app. Every install is a server somebody runs, and the iOS apps people use are clients that take that server's URL and an API key. So the instance already has an address: it is the server URL in the iOS app's settings. If that address works on mobile data without a VPN, TRMNL can reach it too and step 2 is only the recording. If it only works at home or over Tailscale, it needs one of the options below.

How people run it, roughly in order of how common it is: Docker on a home server or Raspberry Pi behind a reverse proxy with HTTPS (Caddy, Nginx Proxy Manager, Traefik); the same behind a Cloudflare Tunnel or Tailscale Funnel when they do not want to open a port; a managed host such as [ElfHosted](https://docs.elfhosted.com/app/babybuddy/) or [PikaPods](https://www.pikapods.com); a one-click VPS image such as [Hostinger's](https://www.hostinger.com/uk/applications/baby-buddy). Managed hosts and VPS installs are public already. The listing says only "reachable from the internet over HTTPS", with a line pointing home-server users at a tunnel. TRMNL publishes its polling IPs at `https://trmnl.com/api/ips` for anyone who wants to allow only those.

If the instance cannot be exposed at all: switch the recipe to the `webhook` strategy and run a small Node script on the home server every 15 minutes that polls Baby Buddy locally, runs the same `transform.js`, and posts the result to the plugin's webhook URL. The views stay identical. This is the Obsidian Screens shape and costs an extra script and a cron entry, so it is the fallback, not the plan.

## Repository plan

```
apps/baby-buddy/
  package.json            @trmnl/baby-buddy: dev, review:check, screenshots, build, fixtures, fetch
  plugin.config.json      fixtures with poll times, preview fields, review cases with expected text
  README.md               what it shows, how it works, GitHub Sync notes once a plugin exists
  PRIVACY.md              data stays between TRMNL and the installer's instance
  docs/listing.md         recipe listing copy
  assets/icon.png         512px listing icon (a bottle or a cot, nothing resembling Baby Buddy's logo)
  fixtures/               synthetic responses, one JSON file per IDX per case
  scripts/generate-fixtures.js   deterministic eight-day histories
  scripts/fetch.js        records a real instance into .cache/ (ignored); --scrub replaces names, notes and tags
  src/settings.yml, shared.liquid, full.liquid, half_horizontal.liquid, half_vertical.liquid, quadrant.liquid, transform.js
  test/transform.test.js  one test per status, per day rule, per live-feature rule, timer assignment, the age string and midnight splits
```

Root `package.json` gains `dev:baby`, `review:baby`, `review:baby:check`, `screenshots:baby` and `build:baby`; `pnpm check`, `pnpm test` and `pnpm build` pick the app up through the `apps/*` filters. `AGENTS.md` gets a Baby Buddy paragraph once the plugin exists on TRMNL (plugin ID, GitHub Sync, never commit the API key or a real child's data).

### Fixtures

All synthetic, built by the generator so no real child's data is committed:

| Fixture | Covers |
| --- | --- |
| `ours` | Four-week-old: breast and bottle on the same days, pumping with sides in tags, mixed nappies, sleeps with Baby Buddy's nap flag, one sleep crossing midnight, a sleep timer running |
| `feeding-timer` | The same child with a feeding timer running and no sleep timer |
| `breastfed` | Breast only, no amounts anywhere, naps and night both present, an unnamed timer |
| `bottle` | Bottles only, every feed with an amount, no pumping, no tummy time, no timers |
| `everything` | All five features live, so the five-tile and four-chart layout is exercised |
| `lapse` | Last entries 40 hours ago: every "last" line shows a clock time and day, today's counts are zero |
| `midnight` | Poll at 00:10 in Johannesburg with the last feed before midnight and the UTC date still yesterday |
| `two-children` | Chosen child is the second one, the sibling's entries and a sibling's timer in every list |
| `first-day` | Child born today, one feed, nothing else: one tile, one chart with one column |
| `empty`, `auth`, `no-child`, `unreachable` | No entries, a 403 body, an empty children list, an HTML login page |

Review cases follow the AdMob pattern with `expect` and `expect_by_view` strings for each.

## Publishing

Categories: `family` and `health` (confirm the names in TRMNL's category list). The listing says that the installer needs a Baby Buddy instance reachable over HTTPS and an API key, that the recipe is read-only (GET only), that one install shows one child, and that nothing is sent anywhere but the installer's own instance. Not affiliated with Baby Buddy.

## Decisions (10 October 2026)

- **Today first, then seven days.** The full view is a Today band over a Last-7-days band; smaller views keep Today and drop history as space runs out.
- **Timers are first-class.** A running timer turns its tile's "last" line into a "since" line, and a sleep timer inverts the sleep tile. Unnamed timers are still shown.
- **One child per install.** The child setting picks by name; several children mean several installs.
- **Units**: ml by default, fl oz and none as options.
- **Bottle contents are not distinguished.** The iOS app cannot set breast milk against formula, so Baby Buddy's `type` is ignored for bottles.
- **Pumping side** is read from tags or notes when present; the API has no side field.
- **Nap against night** uses Baby Buddy's nap flag, which the server sets from its nap window when the app leaves it blank, and is shown only when both kinds occur.
- **Adaptive display**: every tile and chart follows what is logged in the last 14 days.
- **Child picker**: a plain optional name field, not a dynamic dropdown, for the reasons in the settings table.
- **Day boundary**: Baby Buddy's dashboard rules, midnight in the profile time zone, so the screen agrees with the app.
- **Hosting**: the iOS app's server URL is the address.

## Open questions

- Whether TRMNL passes a non-JSON body (an HTML login page from a misconfigured proxy) to the transform or logs an error and keeps the previous screen. Decides whether the `unreachable` status can ever render; test in step 3.
- Where the iOS app puts the pumping side, if anywhere, and what names it gives timers. Settled by the step 2 recording.
