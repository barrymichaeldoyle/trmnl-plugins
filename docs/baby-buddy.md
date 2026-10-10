# Baby tracker on TRMNL: on hold

## Status

**On hold since 10 October 2026.** No code is in the repository. The goal stands: a baby tracker screen on our TRMNL, and an easy, free setup that other parents can use too. What blocked it is the data source, not the display.

The original Baby Buddy plan (what the screen shows, the day rules, the views, the Decisions) is in this file at commit `6022cb0`; read it from there when work resumes (`git show 6022cb0:docs/baby-buddy.md`). The display design in it still applies whichever tracker supplies the data.

## What happened

1. **Momcozy** was ruled out first: no API.
2. **Baby Buddy** was chosen next, and a full recipe was built and verified on 10 October 2026: polling settings, transform, four views with seven-day charts, 13 synthetic fixtures, tests, and both review suites passing with baselines. It was then removed, because:
   - The open-source [Baby Buddy](https://github.com/babybuddy/babybuddy) needs a server you host. We have no always-on machine at home and did not want to pay for hosting. ElfHosted offers it for about $9 a month; PikaPods does not offer it.
   - The iPhone app we had installed, "Baby Buddy - Track & Chat" by Scott Catterall, is unrelated: it is a cloud app that shares by invite code, with no server address, no API and no export. The app that works with a self-hosted server is "Baby Buddy Companion" by Kurtis Guy.
   - A recipe for self-hosters only reaches people who already run a server, which does not meet the "easy for others" goal.
3. **Huckleberry** was investigated and judged the best option today. A Huckleberry recipe was started (a shared display core and a refactor) and then removed when the project was paused.
4. **Nara Baby** was checked as a less pushy alternative.

## Findings to reuse

### Commercial trackers have no APIs

Huckleberry, Nara, Momcozy and the like keep data in their own cloud with no developer access. Only self-hosted, open-source trackers (Baby Buddy, [babytracker](https://github.com/mbentancour/babytracker), [Nestling](https://github.com/jfchenier/nestling)) expose one, and they all need a server.

### Huckleberry (best option found)

- **Price**: the free tier covers everything the screen needs: sleep, feeds with a two-sided breastfeeding timer, bottles, nappies, pumping, activities including tummy time, growth, several children and caregiver sync. Plus and Premium add SweetSpot predictions, reports and AI chat, and the app pushes a paid trial that can be dismissed. Checked against the App Store listing on 10 October 2026.
- **Access**: unofficial. The community [Home Assistant integration](https://github.com/Woyken/huckleberry-homeassistant) (MIT, active, several forks) uses the [`huckleberry-api`](https://pypi.org/project/huckleberry-api/) library (version 0.4.3), which signs in with the user's email and password through Firebase's `accounts:signInWithPassword`, then reads Firestore over REST (project `simpleintervals`).
- **Data model**: per child, documents `sleep/{child}`, `feed/{child}`, `diaper/{child}`, `pump/{child}`, `activities/{child}` and `health/{child}`, each with an `intervals` subcollection. Interval `start` and `duration` are in seconds, and `offset` is the minutes from UTC in JavaScript's sign convention (negative east of UTC). Breastfeeds carry `leftDuration` and `rightDuration`; bottles `amount`, `units` (ml or oz) and `bottleType`; nappies `mode` (pee, poo, both or dry); pumping `entryMode` (leftright or total) with left and right amounts; activities a `mode` such as `tummyTime`. Live timers sit on the parent document's `timer` field with `active` and `paused`. Sleep timers store their start in milliseconds, feed timers in seconds. Some intervals are packed several to a document (`multi: true`) and cannot be filtered by date, so they are fetched whole.
- **How it fits TRMNL without a server**: TRMNL's serverless transform runtime (`async run(input)`, `fetch`, a 5-second limit) can sign in and query directly, keeping the long-lived refresh token in `trmnl_state` (8 KB) so it does not sign in with the password on every refresh. Nothing to host, and free for users.
- **Unknowns to test first**: whether the serverless runtime runs on schedule for a polling recipe; whether password fields reach the transform; whether a long history of packed `multi` documents fits in 5 seconds; and whether the account has an email-and-password login at all (an account made with Sign in with Apple or Google may not).
- **Risk**: it uses Huckleberry's private backend, which they can change at any time, and their terms very likely do not allow it. Acceptable for a private plugin; ask Huckleberry before publishing a public recipe.

### Nara Baby

Free, with no paid tier in its listing, and also Firebase-based. The only known access (a reverse-engineered Python wrapper, copied by [Nestling](https://github.com/jfchenier/nestling), a project created on 9 October 2026) signs in with email and password, then downloads the family's entire history through a Cloud Function (`/family/trackz/sync2`) with no date filter. That gets slower every week and may not fit TRMNL's 5-second limit. A weaker fit than Huckleberry.

### Tooling notes for the display

These were built for the removed recipe and are worth rebuilding:

- Framework 3.4 ships `TRMNLCharts`, which resolves pattern fills per bit depth and rebuilds charts on dark mode. Chartkick's Highcharts adapter cannot do per-point fills or mixed column and line series, so use Highcharts directly.
- Review captures block other origins, so the chart scripts need serving from a local cache (`packages/plugin-tools/src/framework.js`).
- Measure each chart container after `document.fonts.ready` and before any chart renders, or the charts overflow on TRMNL X.
- Highcharts draws no stack label for an empty stack; print stacked totals from an invisible series.
- The official linter requires `animation: false` and the `append_random` filter in Highcharts markup.

## When this resumes

1. Have the family try Huckleberry on the free tier, and confirm the account has an email-and-password login.
2. Build a private Huckleberry recipe on the serverless runtime. Rebuild the display from the design at commit `6022cb0` and the notes above, and test the unknowns against the real account first.
3. Email Huckleberry before publishing: say what the recipe does with a user's own data, and ask whether they approve or would offer proper access.
4. Longer term, if it gets traction: our own free tracker app that stores data in the family's iCloud and pushes to TRMNL's webhook (the Obsidian Screens pattern), and exposes data for Home Assistant and similar. This fills a gap nobody serves today. The Huckleberry recipe would then become a legacy option, with a transition period to move people over.
