# Obsidian Screens publication copy

Prepared 9 October 2026 for submission that night. Two listings go together: the TRMNL recipe, and the TRMNL Screens plugin in Obsidian's community directory. The recipe is useless without the plugin, so submit the plugin first.

## 1. Obsidian plugin: TRMNL Screens

**Published 9 October 2026** at [community.obsidian.md/plugins/trmnl-screens](https://community.obsidian.md/plugins/trmnl-screens) (icon `file-check` in green; categories Integrations, Automation, Tasks). The 0.1.1 review passes every check: the `main.js` attestation is verified, Obsidian rebuilt `main.js` byte for byte from the repository, and there are no suspicious network patterns, vulnerable dependencies or obfuscation. The one recommendation, vault enumeration, is inherent: due tasks, writing stats and resurfacing read across the whole vault, which the README explains.

**Repository:** [barrymichaeldoyle/obsidian-trmnl-screens](https://github.com/barrymichaeldoyle/obsidian-trmnl-screens), public, MIT. `manifest.json`, `README.md`, `LICENSE` and `CONTRIBUTING.md` sit at the root of `main`, with the npm lockfile. Pushing a version tag runs the release workflow, which builds `main.js` from source, attests `main.js` and `manifest.json`, and publishes the release; the tag must match the manifest version. After a release, select **Check for new releases** on the plugin's account page so the directory reviews it. The repository is exported from this monorepo with `pnpm --filter @trmnl/obsidian plugin:export` (writes `dist/obsidian-plugin-repo`, which is a checkout of that repository).

**ID and name:** `trmnl-screens`, "TRMNL Screens". Neither is taken among the 8,624 published plugins (checked 9 October 2026); the only TRMNL plugin is TRMNLcast (`trmnlcast`). The ID does not contain "obsidian".

**Description** (from `manifest.json`, 125 characters): Push today's tasks, due tasks, Dataview queries, resurfaced notes, writing stats or a pinned note to a TRMNL e-ink display.

**Submit:**

1. Sign in at [community.obsidian.md](https://community.obsidian.md) with your Obsidian account.
2. Link your GitHub account so the directory can verify you own the repository.
3. **Add a plugin or theme** → the repository above.
4. The automated review runs on submission. Fix anything it reports in this monorepo, bump the version in `obsidian-plugin/manifest.json` and `versions.json`, export, push, and publish a new release whose tag matches.

**Pre-checked against Obsidian's guidelines:** Obsidian's own linter (`eslint-plugin-obsidianmd` 0.4.2, recommended rules) reports no errors. Its seven warnings are deliberate:

- Sentence case on "TRMNL", "TRMNL+", "KB" and "Dataview" (five warnings): proper names and units, which the rule cannot tell from ordinary words.
- `prefer-setting-definitions`: the declarative settings API only adds the settings to Obsidian's settings search. Worth adopting in a later version.

Other guidelines met: `this.app` only, no `innerHTML`, `requestUrl` for network, `getFileByPath` with `normalizePath` for paths, no default hotkeys, no plugin ID or the word "command" in command IDs, cleanup through `register*`, errors-only logging unless debug logging is turned on, no Node or Electron APIs (`isDesktopOnly: false`), and no regular-expression lookbehind.

**Not yet tested on a phone.** The plugin avoids desktop-only APIs and declares mobile support. If the review or users report a mobile problem, set `isDesktopOnly: true` in a patch release.

## 2. TRMNL recipe: Obsidian Screens

**Submitted 9 October 2026** as Public from plugin 500911, now "Plugin in review". Before submitting: the `copyable_webhook_url` field Chef requires, `1bit:text--black` on completed tasks (a publishing tip), and larger TRMNL X layouts after AI Chef noted short lists leaving a third of the X screen empty. AI Chef's second pass repeated the X point (the largest title size is already used; daily tasks fill about 81% of X), and suggested plain text instead of `&#39;` and `<br>` in the bio, which TRMNL's sync and best practices themselves use, so it was submitted as is.

**Publish from:** private plugin 500911 ("Obsidian · Today"), which holds live data from the demo vault, so its featured image shows a filled task list. Rename it to "Obsidian Screens" before publishing; the recipe's name comes from the plugin's name.

**Name:** Obsidian Screens

**Short description** (`src/settings.yml`, within the linter's 35 characters): Your Obsidian vault on TRMNL

**Categories:** `productivity,personal`

**Author bio and Overview:** in the `about` field of `src/settings.yml` (179 words: the bio, then the Overview after `<br><br>`, as Daily Bread and AdMob Earnings do). It names the plugin, says how to install it, and states that the recipe is not affiliated with or endorsed by Obsidian. **Learn more** opens the plugin's setup guide.

**Icon:** [icon.png](../assets/icon.png), 512×512: a note page with a ticked checkbox on a deep green square. [icon-128.png](../assets/icon-128.png) and the [SVG source](../assets/icon.svg) sit beside it; re-render the PNGs after editing the SVG. It deliberately avoids Obsidian's gem logo and purple, as AdMob Earnings avoids Google's: the name says what the recipe works with. The device title bar uses the same note-and-tick drawing in black and white (`src/shared.liquid`). Upload the 512px PNG when the submission form asks for an icon.

**Screenshots:** `docs/screenshots/`, generated by `pnpm screenshots:obsidian` from the demo vault's fixtures: one full-screen image per screen, plus half horizontal, half vertical, quadrant and TRMNL X examples.

**GitHub Sync:** on for plugin 500911 since 9 October 2026, writing to `apps/obsidian/src/` as `trmnl-sync[bot]`. Pull before editing the recipe locally. The sync rewrites `settings.yml` in TRMNL's full format (plugin `id`, empty polling and OAuth defaults, booleans), which the checks accept.

**Chef hints at submission (9 October 2026):** "copyable_webhook_url is required for Webhook strategy plugins" was real and is fixed (the recipe's first custom field). The three remaining hints are false positives: `image-dither` on the title-bar icon and checkbox icons (TRMNL's guide reserves dithering for photos), `{% render 'title_bar' %}` (the guide and published recipes write the `title_bar` div directly), and "no layout class" (every view starts with `<div class="layout …">`; `shared.liquid` has none by design).

**Checked on TRMNL itself:** all six screens were pushed from Obsidian to six installs and rendered by TRMNL's own preview, matching the local review (9 October 2026).

## Name and trademarks

"Obsidian" is used only to say what the recipe works with, as AdMob Earnings names AdMob. Neither listing uses Obsidian's logo or colours, and both say they are not affiliated with Obsidian. The plugin's name, "TRMNL Screens", follows Obsidian's rule against putting "Obsidian" in plugin names.
