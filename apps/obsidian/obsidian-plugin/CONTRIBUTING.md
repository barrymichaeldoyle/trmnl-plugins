# Contributing

Thanks for helping with TRMNL Screens.

**Bugs and ideas:** open an issue here. Include your Obsidian version, desktop or mobile, which screen you use, and what the plugin's **Preview** shows for it (settings → TRMNL Screens → Preview). Leave out your webhook URL: it lets anyone write to your screen.

**Code:** this repository is exported from the [trmnl-plugins](https://github.com/barrymichaeldoyle/trmnl-plugins/tree/main/apps/obsidian) monorepo, where the TRMNL recipe, a demo vault, fixtures and tests live beside the plugin. Pull requests are welcome in either place; changes made here are copied back there before the next release.

**Releases:** bump the version in `manifest.json` and `versions.json`, describe the change in `release-notes.md`, and push a tag with the same version (for example `0.1.1`). The release workflow builds `main.js`, attests it and publishes the GitHub release.
