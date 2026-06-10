# CLAUDE.md

Guidance for Claude Code when working in this repository. Deep, package-specific notes live in `packages/<name>/CLAUDE.md` and are auto-loaded when working in that subtree.

---

## Project Overview

**Pilotiq** is an open-source admin panel builder for RudderJS — a polished, schema-driven admin runtime for the Node.js ecosystem.

- **Monorepo:** pnpm workspaces + Turborepo
- **Language:** TypeScript (strict, ESM, NodeNext)
- **npm scope:** `@pilotiq/*`
- **Status:** Early development
- **Pro extensions:** `@pilotiq-pro/{ai,collab}` in the `pilotiq-pro` repo (licensed per project — one runtime token per deployed website/domain)

### Packages

| Package | Description |
|---|---|
| `@pilotiq/pilotiq` | View-based admin panel using `@rudderjs/view` controller routes. Auto-generates Vike pages via Vite plugin. **The active product** — see `packages/pilotiq/CLAUDE.md`. |
| `@pilotiq/tiptap` | Tiptap rich-text adapter — `RichTextField` with custom blocks, mention/merge tags, slash menu. |
| `@pilotiq/codemirror` | CodeMirror 6 adapter — `CodeEditorField` for syntax-highlighted code input. |
| `@pilotiq/recharts` | Recharts widget adapter — `Chart` element for the dashboard / resource header / footer slots. |

---

## Commands

All commands run from the **repo root**:

```bash
pnpm build        # Build all packages via Turbo
pnpm dev          # Watch mode for all packages
pnpm typecheck    # Type-check all packages
pnpm clean        # Remove all dist/ directories
```

Running the playground:
```bash
cd playground      # pilotiq demo
pnpm dev                   # vike dev on :3003 (HMR :24680 — conflicts with pilotiq-pro if both are up)
```

Database (native engine — run from `playground/`):
```bash
pnpm rudder migrate              # apply database/migrations/ + regen schema types
pnpm rudder migrate:status       # ran / pending
pnpm rudder migrate:fresh --seed # drop all tables + re-run + seed demo CMS content
pnpm rudder db:seed              # run database/seeders/DatabaseSeeder (skips when users exist)
pnpm rudder schema:types         # regen .rudder/types/models.d.ts only
pnpm rudder db:show --counts     # inspect the live database
pnpm rudder providers:discover   # regen bootstrap/cache/providers.json (machine-local, gitignored)
```

> The playground runs on rudder's **native database engine** (`@rudderjs/database`, `engine: 'native'` in `config/database.ts`) — no Prisma/Drizzle. Schema lives in `database/migrations/*.ts`; models bind generated column types via `Model.for<'table'>()`. Migrated off `@rudderjs/orm-prisma` 2026-06-05 (old sqlite data preserved in `dev.db.prisma-bak`). Generated type registries live in the **committed** `.rudder/types/` dir (`models.d.ts` / `routes.d.ts` / `views.d.ts`, since the 2026-06-06 rudder releases) and `.rudder/**/*` is in the tsconfig `include` (dot-dirs are invisible to `**/*` globs).
>
> **Gotcha — `Cannot resolve "db" from the DI container` on any `rudder` command:** core's built-in provider registry only knows `orm-prisma`; the native `NativeDatabaseProvider` resolves through `bootstrap/cache/providers.json`, which is machine-local + gitignored. Run `pnpm rudder providers:discover` once per clone (or after adding/removing `@rudderjs/*` packages).

---

## Cross-Repo Wiring

`@rudderjs/*` packages are consumed **from npm** with caret specs (the old `link:../rudder` overrides were dropped when pilotiq started publishing). The rudder repo is still a sibling clone on disk for reading source / filing upstream plans — never direct-edit it (the rudder agent owns it; file a plan in `~/Projects/rudder/docs/plans/` instead).

```
~/Projects/
├── rudder/         # Framework
├── pilotiq/        # This repo (open-source admin panel)
└── pilotiq-pro/    # Pro extensions (AI, collab)
```

---

## Playgrounds

| Playground | Port | HMR | Purpose |
|---|---|---|---|
| `rudderjs/playground` | 3000 | 24678 | Framework demo — zero pilotiq deps |
| `pilotiq/playground` | 3003 | 24680 | Starter-shaped CMS demo — two panels: `/admin` (session login at `/login`, `admin@example.com` / `password`, via `Pilotiq.guard()`) and `/guest` (no guard — anonymous guests). Posts / pages / categories / comments / users + themeEditor |
| `pilotiq-pro/playground` | 3002 | 24680 | Full stack — framework + pilotiq + AI + collab |

**Providers** (`playground/`): log, native database (`@rudderjs/orm` + `@rudderjs/database`), session, cache, pilotiq.

No AI / live / queue / mail / monitoring — those are framework demos in `rudderjs/playground`.

> **Archived:** the legacy `@pilotiq/panels` resource builder + its companion `@pilotiq/lexical` rich-text adapter + `@pilotiq/media` library + the panels playground (port 3001) were removed in 2026-05. The full tree lives on the `archive/legacy-panels` branch — `git checkout archive/legacy-panels -- packages/panels` to recover any file.

---

## TypeScript Conventions

- All packages extend `../../tsconfig.base.json`
- `experimentalDecorators: true` + `emitDecoratorMetadata: true`
- `module: "NodeNext"` — use `.js` extensions in all imports
- `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`

---

## Common Pitfalls (cross-cutting)

- **Stale `dist/`:** Run `pnpm build` from the pilotiq root. Per-package: `pnpm -F <name> build` or `cd packages/<name> && pnpm dev` for watch mode.
- **Native-engine writes from app code:** better-sqlite3 only binds primitives. Declare `static casts` on the model for anything richer — `'boolean'` (0/1), `'datetime'` (Date ↔ ISO string), `'json'` (object ↔ JSON string). Casts serialize on write AND revive on read, and `rudder schema:types` (orm ≥ 1.16.1) folds them into the generated registry types (sweeps `app/Models/**`; models elsewhere must `ModelRegistry.register()` in a provider). Pilotiq form fields REQUIRE this: `DateTimePicker` coerces to `Date` and `RichTextField` to a parsed object before `Model.update` — without the cast the save 500s with "SQLite3 can only bind numbers, strings…". Raw query-builder writes (no model) still need ISO strings by hand.
- **Port in use:** `lsof -ti :24680 -ti :3003 | xargs kill -9`.
- **Pilotiq-specific pitfalls** (Vite plugin, page generation, layout persistence, Tailwind setup) live in `packages/pilotiq/CLAUDE.md`.
- **Adapter peer ranges (`@pilotiq/{codemirror,recharts,tiptap}`):** declare `peerDependencies."@pilotiq/pilotiq"` as the literal range `">=0.6.0 <1.0.0"`, **not** `workspace:^`. `workspace:^` publishes as `^<version>`, which under pre-1.0 caret breaks on every pilotiq minor — and changesets' peer-cascade hardcodes a MAJOR bump on dependents when the range breaks (`@changesets/assemble-release-plan` source verified). devDep stays on `workspace:^` for local resolution. Adding a new adapter? Mirror this shape. Background in `~/.claude/projects/-Users-sleman-Projects-pilotiq/memory/project_pilotiq_npm_release.md`.
