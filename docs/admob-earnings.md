# AdMob Earnings: design and repository plan

## Status

8 October 2026: **built offline; waiting for Google credentials.** [`apps/admob-earnings`](../apps/admob-earnings/README.md) contains the complete recipe: settings with the OAuth provider, polling request and account picker; the transform; all four views; synthetic fixtures for every state; tests; listing copy; and screenshots. The shared tooling now supports polling recipes, so `pnpm dev:admob`, `pnpm review:admob`, `pnpm check`, `pnpm test` and `pnpm build` cover it. The responsive and curated review suites pass on all 24 screens (288 captures), with visual review of the contact sheets.

| Step | State |
| --- | --- |
| 1. Workspace, tooling, fixtures, transform, views, tests | Done |
| 2. Private plugin on TRMNL, OAuth connected, first refresh | In progress: Google project, consent screen (in production) and web client created 8 October 2026; TRMNL private plugin 499984 imported. Waiting for the client ID and secret to be entered in TRMNL and the first Connect |
| 3. Real-response fixture, transform and layout adjustments | Needs a token; `pnpm --filter @trmnl/admob-earnings fetch` is ready |
| 4. Device check across a month boundary, compare with AdMob console | Not started |
| 5. Publish the recipe | Not started; listing draft in `apps/admob-earnings/docs/listing.md`. Google verification is optional (see Google setup) |

Design changes made while building, which supersede the text below where they differ:

- **One polling URL and an account picker.** The two-URL plan could not work: the report URL needs the publisher ID at fetch time, so it cannot come from an accounts response in the same poll. The report header already carries the currency and reporting time zone. The publisher ID is an `xhrSelect` field whose server-side `remote:` block calls `GET /v1/accounts` with `{{ oauth_access_token }}`, so installers still pick their account rather than copy an ID, and the `GET`-versus-`POST` question disappears.
- **No `show_today` field.** Three settings (account, comparison style, appearance) keep the form short; the quadrant already omits the month tiles.
- **No `render_key`.** Unchanged figures should not produce a new image; any change in the amounts changes the merge variables.
- **The transform writes the comparison sentences and chooses value sizes.** It reads `comparison_style`, so the views need no Liquid partials (TRMNL's `{% template %}` tag does not exist in the local renderer). One size per view, picked from the widest amount and the measured tile widths, replaces the framework's per-element fit, which sized tiles inconsistently and let long values overflow.
- **Narrower scope.** The recipe asks for `admob.report` (reports and account basics) instead of `admob.readonly`, which also covers inventory and mediation settings. The API discovery document lists both scopes for `accounts.list`, `accounts.get` and `networkReport.generate`.
- **"Today" uses the report's time zone.** The transform uses `Intl` with the header's `reportingTimeZone` when available, then the TRMNL user's offset, and a row dated later always wins.

The rest of this document is the original plan, kept for its reasoning and references.

## Goal

A public TRMNL marketplace recipe that shows the same at-a-glance AdMob numbers as the AdBoard phone app, in the account's reporting currency:

| Tile | Primary figure | Comparison |
| --- | --- | --- |
| Today | Earnings so far today | None (AdMob reports today as partial and estimated) |
| Yesterday | Yesterday's earnings | Same weekday last week |
| This month | Month to date | Same number of days into last month |
| Last month | Previous full month | The month before it |

Installers sign in with Google and choose their account from a list. No API key, no publisher ID to copy, no hosted service. Everything runs inside TRMNL's polling, OAuth and transform features.

## How it works on TRMNL

### Strategy

`polling`, verb `POST`, with OAuth2 enabled. TRMNL stores the installer's Google refresh token and refreshes the access token itself. Recipes can tick **Share OAuth credentials with recipe installers?**, so installers use the author's Google OAuth app without seeing its secret.

### OAuth settings (entered in the TRMNL plugin UI, never committed)

| Field | Value |
| --- | --- |
| Provider | Google template from TRMNL's provider library, or manual |
| Authorization URL | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token URL | `https://oauth2.googleapis.com/token` |
| Scopes | `https://www.googleapis.com/auth/admob.report` |
| Custom auth params | `access_type=offline`, `prompt=consent` (needed to receive a refresh token) |
| PKCE | Yes |
| Client ID / secret | From the Google Cloud project, see Google setup |
| Share credentials with installers | Yes, once the Google app is in production (verification optional) |

The redirect URL shown by TRMNL goes into the Google OAuth client's authorised redirect URIs.

### Requests

Two polling URLs, one per line, both sent with the header below. The responses arrive as `IDX_0` and `IDX_1`.

```
Authorization: Bearer {{ oauth_access_token }}
```

1. `GET`-shaped account lookup is not possible because the plugin verb applies to every URL, so the account list is fetched as a POST-tolerant call only if Google accepts it. If it does not, the publisher ID becomes a one-time form field (see Open questions). Preferred: `https://admob.googleapis.com/v1/accounts` returns `publisherId`, `currencyCode` and `reportingTimeZone`.
2. `https://admob.googleapis.com/v1/accounts/{{ publisher_id }}/networkReport:generate` with the body below.

The body asks for daily earnings over the last 93 days, which always covers the current month and the two full months before it, regardless of month length. Liquid computes the dates at fetch time. `"now"` is evaluated in UTC on TRMNL's servers, so the end date is pushed one day ahead; AdMob simply returns no row for a date it does not have yet.

```liquid
{% assign start = "now" | date: "%s" | minus: 8035200 %}
{% assign end = "now" | date: "%s" | plus: 86400 %}
{"reportSpec":{"dateRange":{"startDate":{"year":{{ start | date: "%Y" }},"month":{{ start | date: "%-m" }},"day":{{ start | date: "%-d" }}},"endDate":{"year":{{ end | date: "%Y" }},"month":{{ end | date: "%-m" }},"day":{{ end | date: "%-d" }}}},"dimensions":["DATE"],"metrics":["ESTIMATED_EARNINGS"],"sortConditions":[{"dimension":"DATE","order":"ASCENDING"}],"maxReportRows":100}}
```

Earnings come back as `microsValue` per row inside a header, row, footer array. Report dates are in the account's reporting time zone, so "today" means the AdMob day, which is what AdBoard shows too.

### Transform

`src/transform.js` runs after every poll and returns the merge variables the templates use. It must stay small and defensive because a failed transform leaves the previous image on the screen.

- Parse `IDX_1` rows into `{ date, micros }`, ignoring the header and footer entries.
- Derive the AdMob "today" as the latest date present, capped at the UTC date plus one. Days with no row count as zero.
- Compute the four tiles and their comparison values, each with `amount`, `compare`, `delta_percent` and `direction` (`up`, `down`, `flat`, `none`).
- Format amounts in the account currency. The transform runtime has no reliable `Intl`, so a small formatter uses a symbol table for common codes (USD, EUR, GBP, ZAR, AUD, CAD, JPY, INR, BRL) and falls back to the ISO code. Grouping and decimals follow the currency; JPY has no decimals.
- Emit `account` (`publisher_id`, `currency`, `time_zone`), `updated_at` and a `status` of `ok`, `no_account`, `no_data` or `auth`. The templates render a recovery message for anything other than `ok` instead of a blank screen.
- Add a `render_key` combining the report's latest date and today's micros so TRMNL does not skip an unchanged payload.

### Custom form fields

Keep configuration minimal, as with Daily Bread.

| Keyname | Type | Purpose |
| --- | --- | --- |
| `comparison_style` | select: Percent, Amount, Both | How the delta is shown. Default Percent. |
| `show_today` | boolean | Hide the partial figure for people who find it noisy. Default on. |
| `appearance` | select: Light, Dark | Same convention as Daily Bread. |
| `author_bio` | author_bio | Marketplace listing section. |

Refresh interval defaults to 60 minutes with 15 minutes allowed. AdMob reporting lags by hours, so faster polling adds API calls without new numbers. The recipe's **Fastest Refresh Rate** is set to 15 minutes.

### Layouts

Framework classes only, no `<style>` blocks, no inline styles, no emojis. The same review rules that apply to Daily Bread apply here; see `AGENTS.md`.

- **Full (800x480)**: a 2x2 grid of tiles. Each tile has a label, the amount in the largest value size, and a comparison line such as "vs last Wed · +12.4%". Title bar shows the plugin name, the currency and the latest report date.
- **Half horizontal (800x240)**: the four tiles in one row with smaller value text; comparison lines shorten to the delta only.
- **Half vertical (400x480)**: tiles stacked two by two with the comparison beneath each amount.
- **Quadrant (400x240)**: Today and Yesterday only, side by side, with This month in the title bar description.
- Direction is shown with text arrows from the framework's label variants, not icons or emojis. Dark appearance uses screen dark mode in full views and `inverse` tokens in mashup views, the same way Daily Bread does.
- Long values (for example seven-digit JPY or INR totals) must be verified for clipping on all 24 device, orientation and layout combinations.

## Repository fit

The monorepo already anticipates this app. The README mentions an AdMob dashboard as a future workspace and describes the layout every app follows.

```text
apps/
  admob-earnings/
    plugin.config.json      Slug admob-earnings, strategy polling, fixture paths
    README.md               Install, Google setup, how the numbers are computed
    docs/listing.md         Marketplace title, description, screenshots
    assets/icon.svg|png     Listing icon
    fixtures/               Recorded AdMob responses, anonymised, for preview and tests
      accounts.json
      network-report.json
      network-report-empty.json
    src/
      settings.yml          name, strategy, polling_url, polling_verb, polling_body,
                            polling_headers, refresh_interval, custom_fields
      transform.js          Report parsing, comparisons, currency formatting
      shared.liquid         Tile macro and status handling
      full.liquid, half_horizontal.liquid, half_vertical.liquid, quadrant.liquid
    test/
      transform.test.js     Comparison maths, month boundaries, missing days, currencies
      settings.test.js      Rendered polling body is valid JSON with correct dates
```

The Google client ID, secret and the TRMNL plugin ID are entered in the TRMNL UI or passed as environment variables to the upload script. They are never written to `settings.yml`, fixtures or docs. `.gitignore` already excludes `dist/` and caches; add `.env*` if an upload helper needs one.

### Changes to `packages/plugin-tools`

The shared tooling currently rejects anything but `static` recipes. The additions below keep Daily Bread untouched and give the new app the same preview, review and build workflow.

All seven were implemented on 8 October 2026. Differences: fixtures are configured per name with their recording time; the dev server uses a generic fixture preview page (`preview-fixtures.html`); the live fetch script records to `.cache/` and can scale earnings; and review cases are declared with expected text per view.

1. **Plugin loader** (`src/plugin.js`): accept `strategy: polling`. When `plugin.config.json` names `fixtures`, load them and expose them as `IDX_0`, `IDX_1` (or as the root object for a single URL) so the preview and tests feed the transform the shape production delivers.
2. **Polling simulation**: render `polling_url` and `polling_body` through Liquid with the same `trmnl` context the markup gets, split URLs on line breaks, and assert the body parses as JSON. This is a check, not a live fetch; the dev server never calls Google.
3. **Optional live fetch**: a `pnpm --filter @trmnl/admob-earnings fetch` script that calls the AdMob API with a locally supplied access token and writes anonymised fixtures. Useful before the OAuth flow exists on TRMNL. Reads the token from an environment variable only.
4. **Check** (`checkPlugin`): keep the framework-only markup rules, add polling validation, and require a `status` recovery path to render in every view.
5. **Build**: export `settings.yml` with the polling keys instead of `static_data`. The flat ZIP format is unchanged. If the TRMNL importer ignores OAuth or `polling_body` keys, the README tells the installer which fields to paste manually.
6. **Review board**: the responsive review currently selects passages by length. Generalise the case selector so an app provides its own cases: here, short, typical and very long currency values plus every status.
7. **Root scripts**: today's root `package.json` scripts hard-code the Bible app. Add `--filter` variants (`pnpm dev:admob`, `pnpm build:admob`) and make `pnpm check`, `pnpm test` and `pnpm build` run every workspace. CI uploads a review artifact per app.

Tests use the Node test runner already wired at the root. The transform tests are the most important: month rollover on the 1st, a 31-day month compared with a 30-day one, February, the first week of data for a new account, and an account with no earnings.

## Google setup (done 8 October 2026)

- **Project** `trmnl-admob-earnings` ("TRMNL AdMob Earnings") with the AdMob API enabled.
- **Branding:** app name "AdMob Earnings for TRMNL", support email barrydoyle18@gmail.com (Google only offers addresses on the signed-in account), developer contact barry@barrymichaeldoyle.com. Home page is the app README on GitHub; the privacy policy is [`apps/admob-earnings/PRIVACY.md`](../apps/admob-earnings/PRIVACY.md). Authorized domains: `github.com`, `trmnl.com`. No logo, because a logo triggers verification.
- **Audience:** External, **In production**. Testing mode would expire every sign-in after seven days.
- **Data access:** `https://www.googleapis.com/auth/admob.report`, which Google classes as **non-sensitive**.
- **Client:** web application "TRMNL AdMob Earnings" with redirect URIs `https://trmnl.com/plugin_settings/private_plugin/oauth/redirect` (the same for every TRMNL private plugin) and `http://localhost:4567/oauth/callback` (for `trmnlp serve`). The ID and secret live only in TRMNL and the Google console.

**Verification is not needed.** With only a non-sensitive scope, Google's publish dialog asks for verification only if the app adds a logo or more than ten domains. The audience page states the 100-user lifetime cap applies only to unapproved sensitive or restricted scopes, so there is no cap and no "unverified app" warning for this recipe. Full verification would anyway be impossible: TRMNL's settings note that it requires owning trmnl.com, which hosts the redirect URI. Without brand verification, Google may show less branding on the consent screen. A third-party plugin with its own server and domain would only be worth it for full branding or sensitive scopes.

**TRMNL import findings:** the ZIP kept the authorization URL, token URL, scope and auth params. It did not set **Enable PKCE?**, so set it to Yes by hand. Importing also adds the plugin to the device playlist.

## Build order

1. Scaffold the workspace and tooling changes with recorded fixtures, so templates and transform can be developed and reviewed offline.
2. Create the private plugin on TRMNL, enable OAuth, connect the owner account, and confirm the rendered polling body with the **Parse** button and a **Force Refresh**. This step settles the open questions below before any markup is finalised.
3. Write the transform against the real response, then the four views, and run the review board for clipping.
4. Import the built ZIP, verify on a device for a few days across a month boundary, and compare figures with AdBoard and the AdMob console.
5. Publish as a recipe once the Google app is in production; set the fastest refresh rate and listing copy from `docs/listing.md`. Verification is optional.

## Open questions, researched 8 October 2026

Nothing here needs the account owner. Each answer says how sure it is; the first refresh on TRMNL confirms them all at once.

- **Liquid in the polling body: yes (high confidence).** TRMNL's help centre says form-field values work in the polling URL, body and headers, and that the whole Liquid library is available. TRMNL's open-source implementations render the body with full Liquid: `trmnlp`, which states it mirrors the hosted service (`Config::Plugin#polling_body`, with the OAuth variables), and LaraPaper (`Plugin::resolveLiquidVariables($this->polling_body)`). Neither exposes `trmnl.*` to the request, so the body uses `"now"` in UTC rather than the user's offset.
- **An end date one day ahead: accepted (medium-high confidence).** The API's only documented date rules are "both dates are inclusive" and the end date "must be greater than or equal to the start date" (discovery document). Google's error guide lists no date error for 400 responses: only a bad account ID, too many rows and incompatible metrics. Google's PHP sample ends its range on the server's local date, which can be ahead of the account's day. If the first refresh fails with a date error anyway, change `plus: 86400` to `plus: 0` in `polling_body`. That is a one-line change, and the transform already shows "No earnings reported yet" while today's row is missing.
- **The account picker: documented by TRMNL (high confidence).** TRMNL's template guide documents `xhrSelect` with a `remote:` block that TRMNL calls server-side with `{{ oauth_access_token }}`, `response_path` for the array, and a `label_field` that accepts a Liquid template. AdMob's `accounts.list` returns the array under `account`, with `publisherId` and `currencyCode` on each entry. The list is paginated, but publishers rarely have more than one account.
- **OAuth keys in the import ZIP: kept (high confidence).** `trmnlp push` uploads the same archive format to `plugin_settings/:id/archive`, and its README says the hosted service stores the flat `oauth_*` keys from `settings.yml`. Daily Bread's exported `settings.yml` contains them too. The client ID and secret are never in the file and are pasted in TRMNL.
- **`Intl` time zones in the transform: not needed.** TRMNL's default runtime documents standard built-ins only. Without `Intl`, the transform uses the TRMNL user's offset, and a row dated later always wins. The hosted serverless Node 20 runtime also calls `transform(input)`, and has full time zone data if wanted.
- **Currency in the report header: likely present, handled if not.** The API says the header's `localizationSettings` are "identical to the settings in the report request", and the recipe sends none. Google's examples always show a currency, but no public response confirms the default. If it is missing, amounts show without a symbol and the title bar shows only the date. A first refresh settles it; the fix would be a currency field sent as `localizationSettings.currencyCode`.
- **Sensitive scope: shown at setup.** Google's public scope list does not mark AdMob scopes, and AdMob describes them as excluding payments. The consent screen labels them when the scope is added. Either way the recipe works unverified (see Google setup).
- Resolved earlier: the API returns no row for a day without activity; the transform counts missing days as zero and reports today as "No earnings reported yet" when its row is absent. Google answers an unknown publisher ID with 400 "Invalid account information", which the transform maps to the account-access message.

## References

- TRMNL OAuth2 for custom plugins: <https://trmnl.com/blog/oauth2-plugins>
- TRMNL private plugin settings, including the OAuth fields: <https://trmnl.com/integrations/private-plugin>
- TRMNL dynamic polling URLs: <https://help.trmnl.com/en/articles/12689499-dynamic-polling-urls>
- TRMNL OAuth provider templates: <https://github.com/usetrmnl/oauth2-providers>
- AdMob network report: <https://developers.google.com/admob/api/reference/rest/v1/accounts.networkReport/generate>
- AdMob accounts: <https://developers.google.com/admob/api/reference/rest/v1/accounts>
- Google OAuth verification FAQ: <https://support.google.com/cloud/answer/13463817>
- Google app audience, Testing mode and the seven-day token expiry: <https://support.google.com/cloud/answer/15549945>
- AdMob API discovery document (scopes per method, date range rules): <https://admob.googleapis.com/$discovery/rest?version=v1>
- AdMob API common errors: <https://developers.google.com/admob/api/v1/errors>
- TRMNL custom plugins, dynamic values in polling URL, body and headers: <https://help.trmnl.com/en/articles/9510536-custom-plugins>
- LaraPaper polling implementation: <https://github.com/usetrmnl/larapaper/blob/main/app/Models/Plugin.php>
