# pilotiq-demo — public demo at demo.pilotiq.io

**Status:** plan (repo not created yet)
**Decided 2026-06-05:** SQLite in prod · shared-credentials login screen · pro = AI + collab (`@pilotiq-pro/workspaces` is stale and gets deleted from the pro repo, not installed here)

## Goal

A separate repo, `pilotiq-demo`, that is two things at once:

1. **The marketing demo** — a polished blog product: pilotiq admin panel for editors + a public, server-rendered blog frontend on rudder routes/views. Deployed at `demo.pilotiq.io`, linked from pilotiq.io.
2. **A continuous install-test of the published artifacts** — open-source `@pilotiq/*` from npm, pro `@pilotiq-pro/{ai,collab}` from the private verdaccio registry, `@rudderjs/*` from npm. No workspace links, no yalc. If a tarball, peer range, or registry config breaks, this repo breaks first — before a customer does.

## Stack

- Scaffolded with **`create-rudder`** (Native DB at the database prompt) — dogfoods the exact path a new user walks.
- **Native engine, SQLite** (`engine: 'native'`, `driver: 'sqlite'`, file db). Resets are file-cheap; switching to pg later is a config change by design — worth saying so on the demo page itself.
- Pinned published versions, bumped deliberately (renovate or manual): `@pilotiq/pilotiq@^0.28`, `@pilotiq/tiptap@^3.10`, `@pilotiq/codemirror@^3.2`, `@pilotiq/recharts@^3.1`.
- `.npmrc` scoping `@pilotiq-pro` to the verdaccio registry (see Blockers).

## Domain model (blog)

| Model | Showcases |
|---|---|
| `Article` | tiptap rich text (collab + AI), Builder content blocks, soft deletes, slug field, SEO fields, statuses, scheduled publish |
| `Category` | self-referential tree, nested nav |
| `Tag` | belongsToMany + TagsInput, color badges |
| `Comment` | morphTo polymorphic, nested Replies (depth-2 relation managers), moderation actions |
| `User` (editors) | authorization tiers (admin / editor / viewer), avatar FileUpload |
| `Subscriber` | import/export actions, editable cell columns, bulk actions |

## Admin panel — feature map

Dashboard: StatsOverview + recharts Chart + TableWidget (recent comments) + ActivityFeed View widget. Resources wired to hit every flagship feature once, not everything everywhere: table groups + QueryBuilderFilter + saved filter persistence (Articles), card listing + responsive stack (Subscribers), infolist detail pages (Article view), wizard create (Subscriber campaign?), clusters (Content vs Settings), global search, theme editor (databaseThemeStorage), database notifications + broadcast bell, render hooks for a "demo mode" banner.

**Pro:** AI field suggestions + review mode + meta-model chat on Articles; collab presence + live tiptap co-editing (open the same article in two tabs — the demo page should literally suggest this).

## Public frontend (rudder routes/views)

Server-rendered, intentionally simple — the story is "rudder is a real full-stack framework, the admin is one route group":

- `/` blog index (latest + featured), `/articles/:slug`, `/categories/:slug`, `/tags/:slug`
- Comment form (rate-limited, honeypot) → shows up in admin moderation
- Tiptap JSON → HTML rendering server-side for article bodies
- RSS feed — cheap and demos `@rudderjs/view` non-HTML responses

## Guardrails (public demo)

- **Auth:** real `@rudderjs/auth` login screen with credentials printed on it (`demo@pilotiq.io / demo`). Two extra seeded accounts (editor / viewer) so visitors can compare authorization tiers — the login screen lists all three.
- **Policies:** `can*` statics block user editing, force-delete, theme reset abuse; demo banner render-hook explains the sandbox.
- **Reset:** cron (hourly) — stop accepting writes for a beat, swap in a fresh seeded db file (`migrate:fresh` + `db:seed` into `next.db`, atomic rename). Visitors' graffiti lives ≤1h.
- **AI caps:** demo-scoped gateway key with a hard daily budget + per-session rate limit; pre-flight 402 path already exists (meta-model Phase F). When exhausted → graceful "demo budget reached" notice, not an error.
- **Misc:** `noindex` on `/admin`, rate-limit comment POSTs, no outbound mail (Mail.fake or log driver).

## Seeding

`db:seed` console command (routes/console.ts) with hand-written content — ~12 real articles about pilotiq/rudder itself (the demo content doubles as docs-marketing), categories/tags/comments that make the table features look alive. Tiptap JSON bodies authored once in the panel, exported to fixtures.

## Deploy

- Forge server (same box as verdaccio), node service behind nginx, `demo.pilotiq.io` DNS + LetsEncrypt.
- `vike build` + `node dist/server/index.mjs` under a process manager; deploy via Forge git hook.
- CI (GitHub Actions): install from real registries (this IS the test) → typecheck → build → boot smoke (curl /, /admin login page, one article). Optional Playwright pass later.
- Secrets: pro registry token, AI gateway demo key, APP_KEY.

## Phases

- **A — repo + scaffold:** create-rudder, native sqlite, pin published deps, `.npmrc` pro scope, CI skeleton. *Exit: green install+build from clean clone on registries only.*
- **B — blog admin:** models/migrations/resources per the feature map, seeding. *Exit: full admin walkthrough locally.*
- **C — public frontend:** routes/views, tiptap rendering, RSS, comment intake. *Exit: blog readable end-to-end.*
- **D — pro:** install `@pilotiq-pro/{ai,collab}` from verdaccio, AI caps, collab WS. *Exit: AI suggestion + two-tab co-edit work.*
- **E — guardrails + deploy:** auth/policies/reset cron/banner, Forge, DNS, smoke in prod. *Exit: demo.pilotiq.io live.*

A → B → C ship without pro; D depends on the verdaccio host.

## Blockers / dependencies

1. **Verdaccio on Forge (registry plan item F)** — blocks Phase D and the `.npmrc` part of Phase A. Phases A–C proceed regardless.
2. **pilotiq-pro native-db migration** — in flight on the other machine; demo installs pro versions published *after* that lands (and after workspaces is deleted).

## Out of scope (v1)

Per-visitor sandboxes, Postgres, workspaces (package being deleted upstream), media library (archived — FileUpload + localUpload covers the demo), i18n.
