# TRMNL plugins

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
TRMNL Liquid recipes, in a pnpm monorepo with reusable Node.js development tools. The user approved a self-contained recipe without a hosted backend.

## Users
Christians who want useful Scripture for everyday life on a TRMNL e-ink display.

## Product Purpose
The first app, Daily Bread, displays carefully selected Bible passages rather than random verses from the entire Bible. The repository will accommodate other plugins, including possible dashboards, with shared tooling.

## Capabilities and Constraints
One translation per language: World English Bible in English (default), Louis Segond 1910 in French, and Reina Valera 1909 in Spanish. Nine practical themes with multi-select preferences, a mixed daily default, and configurable verse rotation. One passage at a time keeps the reading experience quiet; editorial tags and notes are not user-facing. Preserve complete publisher passages and their translation-specific references, including Psalm numbering differences. The existing Formula 1 News app stays in the Grand Prix Picks monorepo; a README link can be added later.

## Brand Commitments
A prominent cross should make the Bible display distinctive. The verse remains the primary reading content. The name Daily Bread is a working implementation choice, open to revision.

## Product Principles
- Prefer meaningful, contextual passages to random fragments.
- Keep user configuration small.
- Use local data for reliable, low-maintenance operation.
- Share development tools without coupling unrelated apps.
