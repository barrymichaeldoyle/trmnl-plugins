# TRMNL plugins

A pnpm monorepo for independent [TRMNL](https://trmnl.com) plugins and the tools they share.

| Plugin | Purpose | Status |
| --- | --- | --- |
| [Daily Bread — Bible Verses](apps/bible-verses/README.md) | Daily Scripture in English, French and Spanish, with nine practical themes | Importable recipe MVP |

The Formula 1 News plugin remains in the Grand Prix Picks monorepo. Add a link here when its public repository or recipe URL is ready. Future apps, such as an AdMob dashboard, can share the tooling without moving existing projects.

## Quick start

Requires Node.js 22+, pnpm 11, and Ruby 4.0.7 (pinned in `.ruby-version`) with Bundler for linting.
Activate the pinned Ruby version with your version manager before installing gems or running checks.
Python 3 is also required for the Scripture importer and its regression test.

```sh
pnpm install
bundle config set --local path .cache/gems
bundle install
pnpm dev
```

Open [the local preview](http://127.0.0.1:4567). Choose a language, one or several themes, rotation, layout, and simulated time. **Next interval** advances to the next rotation boundary. The first preview caches TRMNL's official CSS, JavaScript, and fonts locally; an internet connection is needed for that initial download. The plugin itself has no external data dependency.

```sh
pnpm check
pnpm test
pnpm build
```

`pnpm lint` runs the official [`trmnlp lint`](https://github.com/usetrmnl/trmnlp#commands) checks against Daily Bread's source. Its gem version and dependencies are pinned in `Gemfile` and `Gemfile.lock`. `pnpm check` includes linting plus our static-recipe, framework-style, render, and packaging checks. CI installs both dependency sets and runs check, test, and build on pushes and pull requests. The existing `allowed_style_blocks` declaration remains enforced by our custom checks.

`pnpm verify` runs check, test, and build together. Git hooks in `.githooks` are installed automatically by `pnpm install`; run `pnpm hooks:install` to reinstall them. Before a commit, the hook checks staged whitespace and runs `pnpm check`. Before a push, it runs `pnpm verify`. Validation uses the current working tree, so include all related changes in your commit. Hooks require the same Node, pnpm, and Ruby environment as manual checks.

The installer preserves an existing `core.hooksPath`. To switch deliberately to this repo's hooks, run `git config --local core.hooksPath .githooks` and `pnpm hooks:install`. Hook installation is skipped in CI and source archives. GitHub Actions runs validation independently of local hooks, cancels superseded runs on the same ref, and limits each job to 15 minutes. Require the **Check plugins / check** status in GitHub branch protection when the repository is hosted there.

The [visual regression review board](docs/review-board.md) opens with the shortest, a middle-length, and the longest passage across the whole library, with both QR states and all 24 device/orientation/layout combinations on one expanded, scrollable page. Readable previews are the default; Overview keeps a compact matrix. Run `pnpm review:install` once, then `pnpm review`, or visit `/review` on the existing dev server. `pnpm review:responsive` produces a quick 144-render report with six contact sheets and a compact `summary.json` for agents. `pnpm review:check` runs the broader 51-case suite; both export HTML, native screenshots, and full JSON under `apps/bible-verses/dist/review/<suite>/`. `pnpm review:exhaustive` covers every passage and both QR settings. CI runs both quick and curated browser suites and retains their report artifacts. Read the guide before recording visual baselines.

Import `apps/bible-verses/dist/daily-bread.zip` using **Plugins → Private Plugin → Import new** on TRMNL. [TRMNL's import guide](https://help.trmnl.com/en/articles/10542599-importing-and-exporting-private-plugins) describes the supported ZIP format. The package contains settings, the entire curated collection, and all four view templates.

## Repository structure

```text
apps/
  bible-verses/
    content/          Curated references and publisher-sourced Scripture
    src/              TRMNL settings and Liquid templates
    scripts/          Explicit content import tools
    test/             Rotation, timezone, and content checks
packages/
  plugin-tools/       Shared preview, validation, and ZIP export tools
.agents/skills/
  trmnl/              Official TRMNL agent skill and references
```

Each plugin owns its content and settings. Shared tooling currently supports static recipes; add polling or hosted integrations when an app needs them. There is no backend, database, or account system for Daily Bread.

## Adding another recipe

Create an `apps/<name>` workspace with `plugin.config.json`, a JSON data file, and `src/{settings.yml,shared.liquid,full.liquid,half_horizontal.liquid,half_vertical.liquid,quadrant.liquid}`. Set the data path and export slug in the config. Use the same `@trmnl/plugin-tools` workspace dependency and scripts as the Bible app. Builds inline shared Liquid into each view and create TRMNL's flat ZIP format.

Root scripts currently target Daily Bread. Add app-specific commands or workspace filters when the second app arrives; avoid premature orchestration layers.

## Agent guidance

The official [TRMNL agent skill](https://github.com/usetrmnl/trmnl-agent-skills) is vendored under `.agents/skills/trmnl`, with its MIT license and source revision. It will be discoverable on the next agent turn. See [AGENTS.md](AGENTS.md) for project conventions.
