# Phase 6 — Playground Extraction Plan

Split the single oversized `rudderjs/playground` into **three** focused playgrounds — one per repo — so each monorepo can dogfood its own surface area without dragging in the others.

**Status:** DRAFT 2026-04-10.

**Repos affected:**
- `rudderjs` — playground slimmed to a pure framework demo (no panels, no pilotiq-pro)
- `pilotiq` — new `playground/` exercising free `@pilotiq/{panels,lexical,media,workspaces}` on top of the framework
- `pilotiq-pro` — new `playground/` exercising the full stack: framework + free pilotiq + `@pilotiq-pro/{ai,collab}`

**Depends on:** Phases 2, 3, 4, 5 (extraction + open-core seams + pro packages, all DONE 2026-04-10).

**Related memory:** `project_pilotiq_rebrand.md`, `project_claude_cwd_cutover.md`, `feedback_yjs_dedupe.md`, `feedback_panels_pages_parallel_copy.md`

---

## Goal

After this plan:

1. **`rudderjs/playground`** is a clean RudderJS framework demo — auth, routing, ORM, queue, mail, cache, storage, scheduling, broadcast, live, telescope/pulse/horizon, plus the existing non-panel pages (`users`, `todos`, `contact`, `live-demo`, `ws-demo`, `(auth)`). It has **zero** dependency on `@pilotiq/*` or `@pilotiq-pro/*`. Its prisma schema covers only framework concerns (User + Session + Job tables; no Article/Workspace/Media).
2. **`pilotiq/playground`** is a new minimal playground in the pilotiq monorepo. It boots free pilotiq end-to-end: `panels(...)` with one or two demo resources, `RichContentField` running in **local-only** mode (the `useYjsCollab` stub), `MediaField`, workspaces. **No AI, no collab.** Its purpose: prove free pilotiq stands alone without pro and without breaking when pro packages aren't installed.
3. **`pilotiq-pro/playground`** is a new full-stack playground in the pilotiq-pro monorepo. It boots the same panels as pilotiq's playground PLUS `AiServiceProvider`, `CollabServiceProvider`, `<AiUiProvider>`, `<CollabProvider>`, and the `.persist(['websocket','indexeddb'])` + `.ai([...])` field options. Its purpose: smoke-test the entire commercial stack and serve as the canonical reference for "what an app installing both pro packages looks like".
4. All three playgrounds share the same **cross-repo install model** — `pnpm.overrides` linking siblings at `link:../<repo>/packages/<name>` (the model already in use for pilotiq + pilotiq-pro builds).
5. The `claude-cwd-cutover` is unblocked: after Phase 6, the natural cwd for pilotiq work is `~/Projects/pilotiq`, and for pro work is `~/Projects/pilotiq-pro`. Memory migrates accordingly.

---

## Non-Goals

- **Publishing the playgrounds.** They stay private dev fixtures. No npm release, no Docker image, no deploy target.
- **Production hardening.** No CI for the playgrounds beyond `pnpm build`. No e2e Playwright suite migration in Phase 6 — see Open Question O3.
- **Replacing `playground/e2e`.** The existing `rudderjs/playground/e2e` Playwright suite stays put for now; it tests panels behavior so it physically belongs in `pilotiq/playground/e2e` long-term, but that migration is a separate follow-up.
- **One unified prisma schema.** Each playground gets its own minimal schema. No shared schema package.
- **Identical providers across the three playgrounds.** Each one only registers what it needs.
- **Backporting pilotiq-pro features into the rudderjs framework playground.** The framework playground deliberately loses AI/collab/panels demos.
- **Changing the framework, free pilotiq, or pro packages themselves.** Phase 6 is purely an app-level reorganization.

---

## Constraints

1. **Cross-repo dev model stays the same.** `pnpm.overrides` linking sibling clones on disk. No git submodules, no published packages.
2. **No new shared package.** Common pieces (e.g. an `AdminPanel.ts` factory) get copied across the two pilotiq-flavored playgrounds, not extracted into a shared package. Three playgrounds is small enough that DRY is not worth the abstraction cost.
3. **rudderjs/playground must keep working at every step.** The cutover happens by **adding** the new playgrounds first, verifying they boot, then **subtracting** the panels-specific surface area from rudderjs/playground. No window where any of the three is broken.
4. **Each playground gets its own port.** rudderjs:3000, pilotiq:3001, pilotiq-pro:3002 — so all three can run simultaneously during smoke tests. (Vite HMR ports 24678/24679/24680.)
5. **Each playground gets its own SQLite file** (`dev.db`). No shared database. The schemas don't overlap so there's no migration story to worry about.
6. **Existing rudderjs panels-specific commits must remain reachable.** No history rewrites. Files **move** via `git mv` where possible to preserve blame; outright copies into the other repos are fine because they're separate git histories anyway.
7. **No regression to the Phase 5.8 smoke test.** The pilotiq-pro playground must reproduce the title-field collab smoke that the rudderjs playground currently demonstrates.
8. **TypeScript stays strict.** Each playground inherits its repo's `tsconfig.base.json`.

---

## The three playgrounds

### Playground A — `rudderjs/playground` (slimmed framework demo)

**Stays:**
- `bootstrap/{app,providers}.ts` minus panels, AiServiceProvider, CollabServiceProvider
- `config/*` minus the panel-only config keys (none currently — config is already framework-level)
- `app/{Models,Services,Controllers,Commands,Events,Listeners,Mail,Middleware,Notifications,Jobs,Modules,Providers,Requests}` — all framework-flavored
- `app/Agents/` — uses `@rudderjs/ai` directly (framework-level AI primitive), unrelated to panels-AI. **Keep.**
- `routes/{web,api,console}.ts`
- `pages/{(auth),contact,index,live-demo,todos,users,ws-demo,_error,+config.ts,+Layout.tsx}`
- `prisma/schema.prisma` minus Article/Workspace/Media tables (User + Session stay)
- `vite.config.ts` minus `@pilotiq/*` dedupe + optimizeDeps + ssr externals for pilotiq pages

**Goes (deleted from rudderjs/playground; copied into pilotiq + pilotiq-pro playgrounds as needed):**
- `app/Panels/` (entire subtree — currently `Admin/AdminPanel.ts` + resources)
- `pages/(panels)/` (entire subtree — vendored panel pages + local overrides)
- `prisma` Article/Workspace/Media models (move to pilotiq + pilotiq-pro schemas)
- `lang/en/pilotiq.json` (move)
- `package.json` deps: `@pilotiq/panels`, `@pilotiq/lexical`, `@pilotiq/media`, `@pilotiq/workspaces`, `@pilotiq-pro/ai`, `@pilotiq-pro/collab`, `lexical`, `@lexical/*`, `yjs`, `y-websocket`, `y-indexeddb`, `@lexical/yjs`, `recharts`, `shiki`, `dnd-kit-sortable-tree`, `@dnd-kit/*`, `@base-ui*`, `motion`, `radix-ui`, `sonner`, `lucide-react`, `lucide-static` (audit each — keep only what non-panel pages still use)
- `vite.config.ts` panels-specific entries

**Result:** `rudderjs/playground` becomes the canonical answer to "what does a pure RudderJS app look like" — closer to a Laravel skeleton app than to a CMS demo.

---

### Playground B — `pilotiq/playground` (free pilotiq dogfood)

**New monorepo location:** `~/Projects/pilotiq/playground/`. Update `pilotiq/pnpm-workspace.yaml` to add `playground` to the `packages:` glob.

**Scope:** boot free `@pilotiq/{panels,lexical,media,workspaces}` on the framework. **No** `@pilotiq-pro/*`. Local-only collab fallback (`useYjsCollab` stub from `@pilotiq/lexical`). The `<CollabProvider>` and `<AiUiProvider>` wrap is **absent** — apps without pro see the panel tree without those providers.

**Bootstrap:**
- `bootstrap/app.ts` mirroring rudderjs/playground's, minus AI/collab providers
- `bootstrap/providers.ts` includes: log, database, session, hash, cache, auth, queue, events, mail, storage, localization, scheduler, notifications, broadcasting, live, ai (framework `@rudderjs/ai`), boost, telescope, pulse, horizon, **panels([adminPanel])**, AppServiceProvider
- **Excluded providers:** AiServiceProvider, CollabServiceProvider (both are pro-only)

**Resources:**
- A minimal `ArticleResource` — title (TextField, **no** `.persist(['websocket'])`, **no** `.ai([...])`), slug, body (`RichContentField` running local-only), status, publishedAt
- Optionally a `WorkspaceResource` to exercise workspaces
- One `MediaResource` to exercise media uploads with `MediaField`

**Pages:**
- `pages/+Layout.tsx` — minimal app shell
- `pages/index/+Page.tsx` — landing with link to `/admin`
- `pages/(panels)/@panel/+Layout.tsx` — vendored from `@pilotiq/panels` via `pnpm rudder vendor:publish --tag=pilotiq-pages`. **No** static imports of `@pilotiq-pro/*`. The vendored Layout from `@pilotiq/panels/pages/@panel/+Layout.tsx` works as-is (the long comment block at the top documents the recipe; with no pro installed, the tree just renders without the pro Provider wraps).
- `pages/(panels)/@panel/_register-{media,workspaces}.ts` — panel field plugin registrations

**Prisma schema:**
- User + Session (auth)
- Article (id, title, slug, body, status, publishedAt) for ArticleResource
- Workspace + Member if testing workspaces
- Media (the panels media schema)

**Vite config:**
- `dedupe: ['react', 'react-dom', '@pilotiq/panels', '@pilotiq/lexical']` — same as today minus the pro entries
- `optimizeDeps.include` mirrors playground's panels-only entries (Lexical, base-ui, dnd-kit, sonner, recharts, motion, etc.)
- **No** `@pilotiq-pro/*` in include
- **No** yjs/y-websocket/y-indexeddb/@lexical/yjs in dedupe (no second yjs instance because pro collab isn't installed)
- `ssr.external: ['@anthropic-ai/sdk', 'openai', '@google/generative-ai']` — keep, in case framework `@rudderjs/ai` imports them server-side via the panels playground

**`pnpm.overrides`:** `pilotiq/package.json` already overrides `@rudderjs/*` to sibling clones. The playground inherits those overrides automatically because it lives inside the pilotiq workspace.

**Port:** 3001. Vite HMR 24679.

**Purpose:** prove free pilotiq is a complete admin/CMS without any pro packages. Catches any seam where free silently depends on pro.

---

### Playground C — `pilotiq-pro/playground` (full-stack pro dogfood)

**New monorepo location:** `~/Projects/pilotiq-pro/playground/`. Update `pilotiq-pro/pnpm-workspace.yaml` to add `playground` to the `packages:` glob.

**Scope:** the full stack — framework + free pilotiq + `@pilotiq-pro/{ai,collab}`. This is the closest descendant of today's `rudderjs/playground`; in many ways Phase 6 is "lift today's playground from rudderjs/playground to pilotiq-pro/playground, then trim down".

**Bootstrap:**
- Identical to today's `rudderjs/playground/bootstrap/providers.ts` post-Phase-5.8 — every provider, including AiServiceProvider + CollabServiceProvider in front of `panels([adminPanel])`

**Resources:**
- `ArticleResource` with all the bells: `.persist(['websocket','indexeddb'])` on title + body, `.ai(['rewrite','shorten','expand','fix-grammar'])`, the slow_search smoke-test PanelAgent, etc. (Direct copy of today's `playground/app/Panels/Admin/resources/ArticleResource.ts`.)
- WorkspaceResource, MediaResource, any other current playground resources

**Pages:**
- `pages/(panels)/@panel/+Layout.tsx` — same locally-overridden Layout as today's `rudderjs/playground` (static imports of `AiUiProvider` + `CollabProvider`, the long comment about why dynamic imports don't work in the browser)
- All other `(panels)/_components`, `_hooks`, `_lib` mirrors

**Prisma schema:**
- User + Session
- Article + ArticleVersion (if any)
- Workspace + Member
- Media
- AI agent run/session tables (whatever `@pilotiq-pro/ai` requires — confirm in Phase 6.1 audit)
- Anything else today's `playground/prisma/schema.prisma` includes

**Vite config:**
- Identical to today's `rudderjs/playground/vite.config.ts` post-Phase-5.8 — including the yjs dedupe block from `feedback_yjs_dedupe.md`, the `@pilotiq-pro/{ai,collab}` `optimizeDeps.include`, the panels exclude entries

**`pnpm.overrides`:** `pilotiq-pro/package.json` already overrides `@rudderjs/*` AND `@pilotiq/*` to sibling clones. The playground inherits those — meaning **no** explicit `link:` deps in `playground/package.json`; just `@pilotiq/panels: workspace:*` style references that the overrides resolve.

**Port:** 3002. Vite HMR 24680.

**Purpose:** end-to-end smoke test for the commercial stack; canonical "install both pro packages" reference; the place where all four open-core seams (panels + lexical + collab + ai) light up at once.

---

## Phase plan

The cutover order is **add new, verify, then subtract** — never leave a broken state.

### Phase 6.0 — Inventory + decisions ✅ DONE 2026-04-10

#### Subtree labels

| Path | Label | Notes |
|---|---|---|
| `app/{Models,Services,Controllers,Commands,Events,Listeners,Mail,Middleware,Notifications,Jobs,Providers,Requests,Exceptions}` | **framework** | Pure RudderJS — User/Article/Category/Todo models, no panels imports |
| `app/Agents/ResearchAgent.ts` | **framework** | Uses `@rudderjs/ai` directly, no panels. Per O1 → keep. |
| `app/Modules/Todo/` | **framework** | Self-contained module: TodoServiceProvider, TodoService, TodoSchema, Todo.prisma, Todo.test.ts. Uses `@rudderjs/{core,router}`, no panels. Per O2 → keep in framework. |
| `app/Panels/Admin/{AdminPanel.ts,resources,pages,globals}` | **panels-needed** | Full → pilotiq-pro; slimmed copy → pilotiq |
| `routes/{api,web,console,channels}.ts` | **framework** (audit pending) | Confirm in 6.1 sub-step that they don't register panels-aware endpoints |
| `pages/{(auth),contact,index,live-demo,todos,users,ws-demo,_error,+config.ts,+Layout.tsx}` | **framework** | Confirmed: 0 `@pilotiq` imports across all 74 hits — every match is inside `pages/(panels)/` |
| `pages/(panels)/` (74 files) | **panels-needed** | Vendored panel pages, `_components/`, `_hooks/`, `_lib/`, `_register-{media,workspaces}.ts` |
| `prisma/schema/auth.prisma` | **framework** | User + Session |
| `prisma/schema/base.prisma` | **framework** | Cache, jobs, etc. |
| `prisma/schema/live.prisma` | **framework** | `@rudderjs/live` snapshot tables |
| `prisma/schema/notification.prisma` | **framework** | Notifications + DB channel |
| `prisma/schema/app.prisma` | **mixed** | Todo (framework) + Article + Category (panels-needed). **Action:** split during 6.3 — Todo stays as `app.prisma`, Article+Category move to a new `articles.prisma` in both pilotiq playgrounds |
| `prisma/schema/panels.prisma` | **panels-needed** | Vendored panels schema (resource state, audit log, etc.) |
| `prisma/schema/media.prisma` | **panels-needed** | Vendored media schema |
| `prisma/schema/workspaces.prisma` | **panels-needed** | Vendored workspaces schema |
| `lang/{ar,en,es}/messages.json` | **framework** | App-level i18n |
| `lang/{ar,en,es}/pilotiq.json` | **panels-needed** | Panels translation overrides |
| `e2e/{collaborative,dialogs,forms,list-demo,media,sections,tables,tabs,admin-home}.spec.ts` (9 specs) | **panels-needed** → pilotiq-pro | All test `/admin` routes |
| `e2e/live-demo.spec.ts` | **framework** | Tests `/live-demo` page |
| `src/components/{animate-ui,app-sidebar.tsx,AppShell.tsx,nav-main.tsx,nav-projects.tsx,nav-user.tsx,team-switcher.tsx}` | **panels-needed** (audit pending) | shadcn/animate-ui components used by AdminLayout. 6.3 dep audit must grep importers — some may also serve framework pages |
| `src/components/ui/` | **audit pending** | shadcn primitives, likely shared by both framework and panel pages |
| `src/{BKSocket.ts,hooks,lib,index.css}` | **audit pending** | Need importer grep to label. Likely shared infra. |
| `config/{ai,media}.ts` | **panels-needed** | AI + media config |
| `config/{app,auth,cache,database,hash,horizon,live,log,mail,pulse,queue,server,session,storage,telescope}.ts` | **framework** | Standard framework configs |
| `prisma/dev.db` | **per playground** | Each gets its own |
| `public/{logo.svg,storage}` | **framework** (logo) + **shared** (storage symlink) | |
| `playwright.config.ts`, `components.json`, `tsconfig.json`, `env.d.ts` | **framework infra** | Each playground will have its own copy |

#### Open question resolutions

- **O1 — `app/Agents/`**: KEEP in framework playground. Demonstrates raw `@rudderjs/ai` without panels chrome.
- **O2 — `app/Modules/Todo/`**: KEEP in framework playground. Self-contained, framework-only deps, has its own `.prisma` + test. Excellent demo of the modular pattern.
- **O3 — e2e**: SPLIT — `live-demo.spec.ts` stays in framework playground; the other 9 specs → `pilotiq-pro/playground/e2e/`. Pilotiq playground gets no e2e initially.
- **O4 — panel slug**: both `/admin`, port disambiguates.
- **O5 — DB**: SQLite, separate `dev.db` per playground.
- **O6 — `create-rudderjs-app` templates per playground**: out of scope; deferred follow-up.

#### Surprise findings

1. **No monolithic `prisma/schema.prisma`** — already a multi-file `prisma/schema/` directory with one file per concern. Splitting is "delete files and references" rather than surgical model-by-model edits. Big win for 6.3.
2. **`app.prisma` is the only mixed file** — Todo (framework) + Article/Category (panels). Will be split into two files at cutover.
3. **`app/Modules/Todo/Todo.prisma`** lives inside the module, separately from `prisma/schema/`. RudderJS modules ship their own schemas — that's a clean pattern. Framework playground keeps this whole subtree intact.
4. **`src/components/`** is partly panels-only (animate-ui, app-sidebar, nav-*) and partly potentially shared (the `ui/` shadcn primitives). Phase 6.3's dep audit must grep importers carefully — likely some shadcn primitives are still used by `pages/contact`, `pages/users`, etc.

#### Tighter cutover sequencing (refined from inventory)

- **6.1 (pilotiq-pro)** is mostly a `cp -r` since it's the full descendant of today's playground
- **6.2 (pilotiq)** is mostly a `cp -r` from 6.1 + drop pro-specific lines (no new file authoring)
- **6.3 (slim rudderjs)** is mostly **deletions**: `rm -rf app/Panels pages/(panels) lang/*/pilotiq.json prisma/schema/{panels,media,workspaces}.prisma`, plus splitting `app.prisma`, plus dep audit, plus deleting panels-only `src/components/*`
- **Routes audit** — small new sub-step in 6.1: `grep -n '@pilotiq' routes/*.ts` to confirm they're framework-clean
- **`src/components/` audit** — small new sub-step in 6.3: grep each top-level file in `src/components/` for non-panel importers; delete the ones used only by `pages/(panels)/`

#### Port allocation (confirmed)

| Playground | Vike port | HMR port |
|---|---|---|
| `rudderjs/playground` | 3000 | 24678 |
| `pilotiq/playground` | 3001 | 24679 |
| `pilotiq-pro/playground` | 3002 | 24680 |

### Phase 6.1 — Bootstrap `pilotiq-pro/playground` (the easy one)

Do pilotiq-pro **first** because it's the closest sibling of today's playground — least transformation, highest confidence. If something goes wrong here, the cause is cross-repo wiring, not refactoring noise.

1. `mkdir ~/Projects/pilotiq-pro/playground`
2. `git mv` (or copy, since it's a different repo) the entire `rudderjs/playground/` subtree to `pilotiq-pro/playground/`. This includes: `app/`, `bootstrap/`, `config/`, `routes/`, `pages/`, `prisma/`, `lang/`, `vite.config.ts`, `tsconfig.json`, `package.json`, `playwright.config.ts`, `e2e/`, `public/`, `src/`, `components.json`, `env.d.ts`.
3. Edit `pilotiq-pro/playground/package.json`:
   - Rename `"name": "forge-playground"` → `"pilotiq-pro-playground"` (or similar)
   - Drop the `link:../../pilotiq*` entries — replace with `workspace:*` for `@pilotiq/{panels,lexical,media,workspaces}` (overrides resolve them) and `workspace:*` for `@pilotiq-pro/{ai,collab}` (sibling packages in this repo)
   - Drop the `link:../../pilotiq-pro/*` entries similarly
   - All `@rudderjs/*` deps stay as-is — overrides resolve them to `../rudderjs/packages/<name>`
4. Update `pilotiq-pro/pnpm-workspace.yaml` to include `playground` in the `packages:` glob.
5. `pnpm install` from `pilotiq-pro/` root. Resolve any version skew between the playground's existing deps and what the overrides provide. Expect a few minor adjustments.
6. `pnpm build` from `pilotiq-pro/playground/`. Vike + Vite should produce the same `dist/` it did in rudderjs.
7. `pnpm dev` from `pilotiq-pro/playground/` on port 3002. Open `/admin`, edit the Article title field — verify the Phase 5.8 collab smoke still works. Verify the AI chat sidebar renders. Verify a `.ai(['rewrite'])` quick action runs.
8. **Do not delete the rudderjs playground yet.** Both must coexist until 6.3.

**Deliverable:** `pilotiq-pro/playground` is a working full-stack demo. Commit + push pilotiq-pro.

### Phase 6.2 — Bootstrap `pilotiq/playground` (the slimmed pro-free copy)

1. `mkdir ~/Projects/pilotiq/playground`
2. Copy the relevant subset of `pilotiq-pro/playground/` (now the canonical pre-trim version) into `pilotiq/playground/`:
   - `bootstrap/`, `config/`, `app/Models`, `app/Services`, `app/Providers`, `app/Panels` (minimal version), `routes/`, `pages/`, `prisma/`, `lang/`, `vite.config.ts`, `tsconfig.json`, `package.json`, `public/`, `env.d.ts`
3. Strip pro from the copy:
   - `bootstrap/providers.ts` — drop `AiServiceProvider`, `CollabServiceProvider`, the comment block about boot order
   - `app/Panels/Admin/resources/ArticleResource.ts` — drop `.persist(['websocket','indexeddb'])`, `.ai([...])`, the slow_search PanelAgent, any sub-agent tooling
   - `pages/(panels)/@panel/+Layout.tsx` — re-vendor from `@pilotiq/panels` via `pnpm rudder vendor:publish --tag=pilotiq-pages` (the canonical comment-only Layout, no static pro imports)
   - `package.json` — drop `@pilotiq-pro/*` deps, drop `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`, `yjs`, `y-websocket`, `y-indexeddb`, `@lexical/yjs` (collab is local-only via the stub)
   - `vite.config.ts` — drop the yjs dedupe block, drop `@pilotiq-pro/*` from `optimizeDeps.include`, keep the panels-related entries
   - `prisma/schema.prisma` — drop AI agent tables (if any)
4. Update `pilotiq/pnpm-workspace.yaml` to include `playground` in the `packages:` glob.
5. `pnpm install` from `pilotiq/` root.
6. `pnpm build` from `pilotiq/playground/`.
7. `pnpm dev` on port 3001. Open `/admin`. Verify:
   - The panel tree renders without `<AiUiProvider>` or `<CollabProvider>`
   - Editing the Article title works (no collab, no debounced WS, just local form state)
   - `RichContentField` works in local-only mode (the `useYjsCollab` stub returns `isCollab: false`, the editor still functions)
   - **No** AI chat sidebar, **no** `✦` standalone field actions
   - `Field.persist(['websocket'])` is not called anywhere — if you call it, the framework throws the helpful "install @pilotiq-pro/collab" error, which is the correct behavior

**Deliverable:** `pilotiq/playground` is a working free-pilotiq demo. Commit + push pilotiq.

### Phase 6.3 — Slim down `rudderjs/playground`

Now that the other two playgrounds exist and are verified, strip rudderjs/playground.

1. Delete from `rudderjs/playground/`:
   - `app/Panels/`
   - `pages/(panels)/`
   - `lang/en/pilotiq.json`
   - `prisma/schema.prisma` Article/Workspace/Media models (keep User + Session + framework demo tables)
2. Update `rudderjs/playground/bootstrap/providers.ts`:
   - Drop `panels([adminPanel])`
   - Drop `AiServiceProvider`
   - Drop `CollabServiceProvider`
   - Drop the import lines + the boot-order comment block
3. Update `rudderjs/playground/package.json` deps:
   - Drop `@pilotiq/{panels,lexical,media,workspaces}`
   - Drop `@pilotiq-pro/{ai,collab}`
   - Drop `lexical`, `@lexical/*`, `yjs`, `y-websocket`, `y-indexeddb`, `@lexical/yjs`
   - Audit and drop UI deps that only existed for panels (`recharts`, `shiki`, `dnd-kit-sortable-tree`, `@dnd-kit/*`, `@base-ui*`, `radix-ui`, `sonner`, `lucide-static`, `motion`, `react-grid-layout`, `three`, `@react-three/*` — confirm none are used by the kept non-panel pages first)
4. Update `rudderjs/playground/vite.config.ts`:
   - Remove `@pilotiq/*` and `@pilotiq-pro/*` from `dedupe`
   - Remove yjs dedupe block (no second yjs instance now)
   - Remove `@pilotiq-pro/{ai,collab}` from `optimizeDeps.include`
   - Remove `@pilotiq/{panels,lexical}` from `optimizeDeps.exclude`
   - Remove all the Lexical / base-ui / dnd-kit entries from `optimizeDeps.include`
   - Keep `ssr.external` for `@anthropic-ai/sdk` etc. only if `app/Agents/` still uses them
5. `pnpm install` from `rudderjs/` root.
6. `pnpm build` from root — all 47 packages including the slimmed playground.
7. `cd playground && pnpm dev` on port 3000. Verify:
   - `/users`, `/todos`, `/contact`, `/live-demo`, `/ws-demo`, `(auth)` all still work
   - **No** `/admin` route (gone with the panels)
   - The Rudder CLI (`pnpm rudder`) still resolves bootstrap/app.ts and lists framework commands
8. Verify the prisma schema is consistent: regenerate with `pnpm exec prisma generate` and check the dev.db reset path doesn't try to drop tables that no longer exist (may need a fresh `dev.db` — manual delete + `prisma db push`).

**Deliverable:** `rudderjs/playground` is a clean framework demo with **zero** pilotiq references. Commit + push rudderjs.

### Phase 6.4 — Cross-repo verification (all three running)

1. From three separate terminals:
   - `cd ~/Projects/rudderjs/playground && pnpm dev` (port 3000)
   - `cd ~/Projects/pilotiq/playground && pnpm dev` (port 3001)
   - `cd ~/Projects/pilotiq-pro/playground && pnpm dev` (port 3002)
2. All three boot without port collisions, without prisma client conflicts (each has its own `dev.db`), without TypeScript errors.
3. Touch a file in `rudderjs/packages/core/src/`. Verify HMR propagates to all three playgrounds (they all link `@rudderjs/core` to the same on-disk source).
4. Touch a file in `pilotiq/packages/panels/src/`. Verify HMR propagates to pilotiq + pilotiq-pro playgrounds (and **not** to rudderjs/playground, which doesn't import panels).
5. Touch a file in `pilotiq-pro/packages/ai/src/`. Verify HMR propagates to pilotiq-pro/playground only.

This three-way cross-repo HMR check is the critical validation that the dev loop didn't regress.

**Deliverable:** the dev loop works across all three repos simultaneously.

### Phase 6.5 — Documentation

1. Update `~/Projects/rudderjs/CLAUDE.md`:
   - Replace the "Playground Structure" section with "Playgrounds" pointing at all three
   - Update commands section: `cd playground` runs the framework demo; mention pilotiq + pilotiq-pro paths for the other two
2. Add `~/Projects/pilotiq/playground/README.md` — short, what it demos, how to run
3. Add `~/Projects/pilotiq-pro/playground/README.md` — same
4. Update `~/Projects/pilotiq/README.md` package table to mention `playground/`
5. Update `~/Projects/pilotiq-pro/README.md` package table to mention `playground/`
6. Add to `~/Projects/pilotiq-pro/docs/development.md` (creating it if missing) the canonical "three playgrounds" cross-repo dev recipe — what to run where, port allocation, HMR caveats
7. Migrate `feedback_panels_pages_parallel_copy.md` to point at `pilotiq-pro/playground` instead of `rudderjs/playground` (the vendor:publish target moves)

**Deliverable:** docs reflect the new three-playground reality.

### Phase 6.6 — Memory cutover (the long-deferred CWD move)

Per `project_claude_cwd_cutover.md`, after Phase 6 the natural CWD for pilotiq work is `~/Projects/pilotiq` and for pro work is `~/Projects/pilotiq-pro`.

1. Migrate `~/.claude/projects/-Users-sleman-Projects-rudderjs/memory/` content into the equivalent paths under `pilotiq` and `pilotiq-pro` cwds. Most memories are repo-agnostic; some (`feedback_panels_pages_parallel_copy.md`, `feedback_panels_dist_rebuild.md`, `reference_playground_smoke_tests.md`) are panels/pro-specific and belong in pilotiq or pilotiq-pro memory.
2. Update `MEMORY.md` index entries to absolute paths or per-repo split.
3. Decide: do we keep a slim `rudderjs` memory dir for framework-only work, or merge everything into pilotiq-pro (the most "complete" cwd)? **Recommendation:** keep three small memory dirs, one per cwd, with framework-only memories in rudderjs, pilotiq-only in pilotiq, and pro/cross-cutting in pilotiq-pro.
4. Delete the obsolete `project_claude_cwd_cutover.md` entry, or mark it DONE.

**Deliverable:** CWD cutover complete; future claude sessions launch from the most-relevant repo.

---

## Risks

### R1 — Cross-repo prisma client generation

**Risk:** each playground has its own `prisma/schema.prisma` and generates its own `@prisma/client` into its own `node_modules/.prisma`. If pnpm hoists Prisma to the root and only one schema is used, the wrong client gets resolved.

**Mitigation:** `prisma generate` writes to the **invoking** package's `node_modules/.prisma`, not the workspace root, when run with `pnpm exec prisma generate` inside the playground dir. Each playground also has its own `prisma.config.ts` (or `package.json#prisma`) so the schema path resolves locally. Verify in Phase 6.1 by checking that `pilotiq-pro/playground/node_modules/.prisma/` exists and has the right tables.

### R2 — Vite optimizeDeps cache leakage between playgrounds

**Risk:** `node_modules/.vite/` is per-package, but if pnpm hoists Vite + plugins to the workspace root, the cache might end up shared.

**Mitigation:** Vite caches into `<package>/node_modules/.vite/` regardless of where Vite itself is hoisted. Each playground gets its own cache. If a playground misbehaves after a sibling rebuild, `rm -rf node_modules/.vite` is the standard reset.

### R3 — Prisma binary download per playground

**Risk:** three playgrounds × one Prisma engine binary each = three downloads on first install, slowing things down.

**Mitigation:** acceptable cost. Prisma binaries are ~30MB; pnpm dedupes the binary download via its content-addressable store. Net impact ≈ zero.

### R4 — `app/Agents/` uses `@rudderjs/ai` and might still pull in OpenAI/Anthropic SDKs

**Risk:** if rudderjs/playground keeps `app/Agents/`, its `package.json` still needs `@anthropic-ai/sdk` + `openai` + `zod`. The framework playground stops being "minimal" if those stay.

**Mitigation:** acceptable. `@rudderjs/ai` is a framework feature and demonstrating it requires a model client. If the user wants a truly minimal framework demo, the agents can move to a separate `examples/agents/` or be deleted. **Decision deferred to Phase 6.0 inventory.**

### R5 — `e2e/` Playwright suite was written against panels-specific routes

**Risk:** the existing `playground/e2e/` suite tests `/admin` flows. Those tests no longer apply to rudderjs/playground.

**Mitigation:** move `e2e/` to `pilotiq-pro/playground/e2e/` in Phase 6.1 (it's part of the full-stack copy). rudderjs/playground gets no e2e for now — that's fine, it didn't have framework-level e2e coverage anyway.

### R6 — `vendor:publish --tag=pilotiq-pages` target dir

**Risk:** the rudder CLI's vendor:publish writes to the **invoking** app's pages dir. After Phase 6 there are two valid targets — `pilotiq/playground` and `pilotiq-pro/playground`. Running it from the wrong one overwrites the wrong file.

**Mitigation:** `feedback_panels_pages_parallel_copy.md` already documents the re-publish caveat. Update it in Phase 6.5 to mention "from the playground you're targeting", and verify `pnpm rudder vendor:publish --tag=pilotiq-pages` resolves the cwd correctly. Both playgrounds need their own `vendor:publish` invocation when panels source changes.

### R7 — Three pages dirs with the same vendored Layout drift apart

**Risk:** `pilotiq/playground/pages/(panels)/@panel/+Layout.tsx` and `pilotiq-pro/playground/pages/(panels)/@panel/+Layout.tsx` both come from the same upstream (`@pilotiq/panels`). Once they diverge (the pro one has the static pro-import patch; the free one doesn't), a re-vendor in either direction will clobber the local override.

**Mitigation:** same issue as today. Document the patch as a code comment at the top of each Layout file, and re-apply after every `vendor:publish`. Same as Phase 5.8 already does in rudderjs/playground.

### R8 — Memory cutover loses context mid-work

**Risk:** Phase 6.6 splits memory across three cwds. If I'm mid-task when a memory move happens, I might lose context.

**Mitigation:** do Phase 6.6 in a dedicated session with no other work in flight. Make a backup of the rudderjs memory dir first. The split should be largely mechanical — most memories are about framework + panels concerns and obviously sort into one bucket.

### R9 — `pnpm rudder` command tooling reaches across the playground/framework boundary

**Risk:** the CLI needs to find `bootstrap/app.ts` to register commands. If the playground moves repos but the CLI tooling assumes a fixed path, commands break.

**Mitigation:** `pnpm rudder` already cd-relatives to the invoking dir. The CLI finds `bootstrap/app.ts` from `process.cwd()`. Each playground will have its own `bootstrap/app.ts` and the CLI will Just Work. Verify in Phase 6.1 by running `pnpm rudder list` inside `pilotiq-pro/playground`.

---

## Open Questions

### O1 — Does `app/Agents/` stay in rudderjs/playground?

It demonstrates `@rudderjs/ai` (framework, not panels). Keeping it means rudderjs/playground keeps `@anthropic-ai/sdk`, `openai`, `zod`, and a few API key env vars. Removing it makes the framework playground truly minimal but loses the "here's how to use raw AI without panels" example.

**Recommendation:** keep it. The framework playground is a demo, and `@rudderjs/ai` is a first-class framework feature.

### O2 — Does `app/Modules/` stay in rudderjs/playground?

Need to audit what `app/Modules/` contains first. If it's panels-specific, move; if framework-level, keep.

**Recommendation:** decide in Phase 6.0 inventory.

### O3 — Migrate `playground/e2e/` Playwright suite?

Move to `pilotiq-pro/playground/e2e/` (since that's where the panels routes the suite tests now live).

**Recommendation:** yes — move alongside the rest of the playground in Phase 6.1.

### O4 — Should `pilotiq/playground` and `pilotiq-pro/playground` share the same panel slug (`/admin`)?

If yes, both demos have the same URL for muscle memory. If no, e.g. `pilotiq:/admin` and `pilotiq-pro:/admin-pro`, they're disambiguated when running side-by-side.

**Recommendation:** both `/admin`. The port disambiguates them already (3001 vs 3002). Slug uniformity is more valuable than disambiguation.

### O5 — What does `pilotiq/playground` use as its database?

Same SQLite as today, separate file. Or PostgreSQL via docker-compose for parity with prod-like setups.

**Recommendation:** SQLite. Zero-setup, matches today's behavior. PostgreSQL parity is a follow-up.

### O6 — Do we ship a `create-rudderjs-app` template per playground?

`@rudderjs/cli`'s `create-app` scaffolder currently mirrors today's monolithic playground. After Phase 6 there are three templates: bare framework, free pilotiq, full pro.

**Recommendation:** out of scope for Phase 6. Track as a follow-up. Phase 6 ships the playgrounds; the templates can come later when the playgrounds settle.

---

## File-level extraction map (high-level)

| From | To | Notes |
|---|---|---|
| `rudderjs/playground/app/Panels/Admin/` | `pilotiq-pro/playground/app/Panels/Admin/` (full) + `pilotiq/playground/app/Panels/Admin/` (slimmed) | Slim version drops .persist/.ai and the slow_search agent |
| `rudderjs/playground/pages/(panels)/` | `pilotiq-pro/playground/pages/(panels)/` (full incl. local Layout override) + `pilotiq/playground/pages/(panels)/` (re-vendored Layout, no override) | Two divergent copies of the vendored Layout |
| `rudderjs/playground/lang/en/pilotiq.json` | both pilotiq playgrounds | Identical |
| `rudderjs/playground/prisma/schema.prisma` Article/Workspace/Media models | both pilotiq playgrounds | Pro adds AI agent tables |
| `rudderjs/playground/bootstrap/providers.ts` AI/Collab/Panels providers | pilotiq-pro full / pilotiq slimmed (no AI/Collab) | |
| `rudderjs/playground/vite.config.ts` panels + pro entries | pilotiq-pro full / pilotiq slimmed (no yjs dedupe, no pro optimizeDeps) | |
| `rudderjs/playground/e2e/` | `pilotiq-pro/playground/e2e/` | |
| `rudderjs/playground/package.json` panels + pro deps | pilotiq-pro `workspace:*` / pilotiq `workspace:*` minus pro | |
| `rudderjs/playground/app/{Models,Services,Controllers,Commands,Events,...}` | stays in rudderjs/playground | Framework-level, untouched |
| `rudderjs/playground/pages/{(auth),contact,index,live-demo,todos,users,ws-demo}` | stays in rudderjs/playground | Framework demos |
| `rudderjs/playground/app/Agents/` | stays in rudderjs/playground (per O1) | Uses `@rudderjs/ai` directly |

---

## Verification checklist

Before declaring Phase 6 done:

- [ ] `cd ~/Projects/rudderjs && pnpm build` → 47/47 packages including the slimmed `playground`
- [ ] `cd ~/Projects/pilotiq && pnpm build` → 4 packages + new `playground`
- [ ] `cd ~/Projects/pilotiq-pro && pnpm build` → 2 packages (`ai`, `collab`) + new `playground`
- [ ] `cd ~/Projects/rudderjs/playground && pnpm dev` → port 3000, framework pages render, no `/admin`
- [ ] `cd ~/Projects/pilotiq/playground && pnpm dev` → port 3001, `/admin` renders without AiUiProvider/CollabProvider, RichContentField works in local-only mode
- [ ] `cd ~/Projects/pilotiq-pro/playground && pnpm dev` → port 3002, `/admin` renders with full AI + collab, title field two-tab sync works
- [ ] All three running simultaneously without port/HMR conflicts
- [ ] HMR cross-repo: editing `rudderjs/packages/core/src/` triggers HMR in all three playgrounds
- [ ] HMR cross-repo: editing `pilotiq/packages/panels/src/` triggers HMR in pilotiq + pilotiq-pro playgrounds only
- [ ] `grep -rn '@pilotiq\|@pilotiq-pro' rudderjs/playground/` returns nothing
- [ ] `grep -rn '@pilotiq-pro' pilotiq/playground/` returns nothing
- [ ] `pnpm rudder list` works inside each playground that has commands
- [ ] CLAUDE.md, both READMEs, `pilotiq-pro/docs/development.md` updated
- [ ] Memory cutover (Phase 6.6) done, `MEMORY.md` indexes split per cwd, `project_claude_cwd_cutover.md` marked DONE

---

## What this plan does NOT change

- The `@rudderjs/*`, `@pilotiq/*`, `@pilotiq-pro/*` package source code itself
- The cross-repo `pnpm.overrides` mechanism (already proven by Phases 2-5)
- `vendor:publish` semantics (just runs from a different cwd)
- Any framework, free pilotiq, or pro pilotiq APIs

---

## Estimated effort

| Phase | Estimated cost | Notes |
|---|---|---|
| 6.0 inventory | ~30 min audit | Walk playground/, label each subtree |
| 6.1 bootstrap pilotiq-pro/playground | ~1-2 sessions | Largest single chunk; mostly file moves |
| 6.2 bootstrap pilotiq/playground | ~1 session | Slimmed copy of 6.1 output |
| 6.3 slim rudderjs/playground | ~1 session | Mostly deletions + dep audit |
| 6.4 cross-repo verification | ~30 min | Manual smoke test |
| 6.5 docs | ~1 session | CLAUDE.md, READMEs, dev.md |
| 6.6 memory cutover | ~30 min | Mechanical move + index update |

**Total:** roughly 4-5 focused sessions. Largest single risk is dep auditing in 6.3 — the panels stack pulled in a long tail of UI deps and disentangling which ones the framework pages still need is the slow part.

---

## Sequencing relative to other open threads

- **Panels AI 5.2 suggestions plan** — independent, can happen before or after Phase 6. Slight preference for after, so the suggestions plan can use `pilotiq-pro/playground` as its smoke-test surface.
- **Rudder+CLI top-3 cleanups** — independent, can happen anytime. They don't touch playgrounds.
- **CWD cutover** — gated on Phase 6 completion (Phase 6.6 *is* the cutover).

Recommended next session after Phase 6: drafting the Panels AI 5.2 suggestions plan, with `pilotiq-pro/playground` as the canonical smoke-test target.
