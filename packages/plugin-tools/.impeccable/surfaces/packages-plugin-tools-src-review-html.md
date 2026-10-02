---
version: 1
slug: "packages-plugin-tools-src-review-html"
primary_target: "packages/plugin-tools/src/review.html"
related_targets: ["packages/plugin-tools/src/review-ui.js","packages/plugin-tools/src/review.css"]
---

# Review board

Mode: Operate. Extend the existing local preview with readable, expanded previews and a quick three-passage review, retaining curated regression and exhaustive modes.

## Direction contract

THESIS: Judge complete short, middle-length and long passages across all supported screens by scrolling, with no configuration switching.

OWN-WORLD: Inherit the workbench's muted green accent, pale neutral background, dark text, Georgia headings and system UI labels. Dense labeled matrices and square white screen previews carry the task.

STORY: Open the board, see scope and progress, inspect labeled screenshots, and follow failed or changed cases into full-resolution evidence. Agents start from a compact summary and six labeled contact sheets; native screenshots and full JSON provide detailed evidence.

FIRST VIEWPORT: A compact title and navigation bar, suite/reload/scale actions, progress, length-sample links and the first device/orientation group with large previews. Readable is the default: two layout columns on desktop and one on mobile. Every scenario and all 24 screens are expanded down the page. Overview retains the six-row by four-column matrix.

FORM: Precisely specified extension, inherited visual world; no concept-seed required. Native-size captures scale only after rendering. Mobile stacks readable previews; Overview keeps the matrix scrollable and labels readable.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
