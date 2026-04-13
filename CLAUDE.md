# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

---

## Project Overview

**Pilotiq** is an open-source admin panel builder for RudderJS — Filament/Nova/PayloadCMS for the Node.js ecosystem.

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript (strict, ESM, NodeNext)
- **npm scope**: `@pilotiq/*`
- **Packages**: panels, pilotiq, lexical, media
- **Status**: Early development
- **Pro extensions**: `@pilotiq-pro/{ai,collab,workspaces}` in the pilotiq-pro repo

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
cd playground
pnpm dev          # vike dev (Vite + SSR) on port 3001
pnpm rudder       # RudderJS CLI
```

> Always run `pnpm build` from the **rudderjs** root before running the playground — framework packages must be compiled first.

Prisma (run from `playground/`):
```bash
pnpm exec prisma generate
pnpm exec prisma db push
pnpm rudder db:seed
```

---

## Architecture

### Packages

| Package | Description |
|---|---|
| `@pilotiq/pilotiq` | **New** — View-based admin panel using `@rudderjs/view` controller routes. Auto-generates Vike pages via Vite plugin. Will replace `@pilotiq/panels`. |
| `@pilotiq/panels` | **Legacy** — Resource builder with vendored Vike pages + metadata pipeline. Being migrated to `@pilotiq/pilotiq`. |
| `@pilotiq/lexical` | Lexical rich-text editor adapter — RichContentField, block editor, local-only by default |
| `@pilotiq/media` | Media library — file browser, uploads, preview, image conversions, MediaPickerField |

### @pilotiq/pilotiq Architecture

```
Pilotiq.make() builder → pilotiq([panels]) provider → registerPilotiqRoutes() → @rudderjs/view
                         pilotiq() Vite plugin → auto-generates pages/(pilotiq)/ stubs
```

**Setup (two lines):**
1. `vite.config.ts` — `import { pilotiq } from '@pilotiq/pilotiq/vite'` → `plugins: [pilotiq(), ...]`
2. `bootstrap/providers.ts` — `import { pilotiq } from '@pilotiq/pilotiq'` → `pilotiq([adminPanel])`

**Key files:**
- `src/Pilotiq.ts` — Builder: `.path()`, `.branding()`, `.layout('sidebar'|'topbar')`, `.resources()`, `.pages()`, `.schema()`, `.guard()`
- `src/Page.ts` — Custom page class with `static schema()`, `static slug/label/icon`
- `src/PilotiqRegistry.ts` — globalThis-backed singleton registry, `findByPath()` for route matching
- `src/PilotiqServiceProvider.ts` — Provider + `pilotiq()` factory
- `src/routes.ts` — `registerPilotiqRoutes()` using `view()`, resolves schema
- `src/vite.ts` — `pilotiq()` Vite plugin, generates `(pilotiq)/` pages + `+Layout.tsx`
- `src/schema/` — Schema elements: `Text`, `Heading`, `Alert`, `Divider`, `Card` + `resolveSchema()`
- `src/react/AppShell.tsx` — Picks layout mode, renders sidebar or topbar
- `src/react/layouts/SidebarLayout.tsx` — shadcn Sidebar (collapsible, mobile-responsive)
- `src/react/layouts/TopbarLayout.tsx` — horizontal nav variant
- `src/react/SchemaRenderer.tsx` — Renders resolved schema elements
- `src/react/ui/` — shadcn primitives (sidebar, button, sheet, separator, tooltip, skeleton, input)

**Pilotiq page generation:**
- `pages/(pilotiq)/+Layout.tsx` — renders AppShell, persists across navigations (sidebar state survives)
- `pages/(pilotiq)/+config.ts` — `passToClient: ['viewProps']`
- Individual `+Page.tsx` stubs render only content (no shell wrapper)
- Route functions check `PilotiqRegistry` on server, tentatively match on client for SPA nav

### @pilotiq/panels Architecture (Legacy)

```
@rudderjs/* (framework — linked via pnpm.overrides)
  └── @pilotiq/panels
       ├── @pilotiq/lexical   (Panel.use(panelsLexical()))
       └── @pilotiq/media     (Panel.use(media(config)))
```

**Requires**: `@rudderjs/{core,router,orm,auth}` + optional packages (cache, localization, storage).

Panels ships React pages that apps vendor via:
```bash
pnpm rudder vendor:publish --tag=pilotiq-pages --force
```

Source: `packages/panels/pages/` → Target: `playground/pages/(panels)/`

**After EVERY edit to `packages/panels/pages/`, re-run vendor:publish.**

---

## Cross-Repo Wiring

All `@rudderjs/*` packages resolve to `link:../rudderjs/packages/<name>` via `pnpm.overrides` in the root `package.json`. No git submodules — sibling clones on disk.

```
~/Projects/
├── rudderjs/       # Framework
├── pilotiq/        # This repo (free panels)
└── pilotiq-pro/    # Pro extensions (AI, collab)
```

---

## Playgrounds

| Playground | Port | HMR | Purpose |
|---|---|---|---|
| `rudderjs/playground` | 3000 | 24678 | Framework demo — zero pilotiq deps |
| `pilotiq/playground` | 3001 | 24679 | Free panels demo — panels + lexical + media |
| `pilotiq-pro/playground` | 3002 | 24680 | Full stack — framework + panels + AI + collab |

### Free playground providers

log, database, session, hash, cache, auth, storage, localization, panels, pilotiq.

No AI, no live, no queue, no mail, no monitoring — those are framework demos in rudderjs/playground.

---

## TypeScript Conventions

- All packages extend `../../tsconfig.base.json`
- `experimentalDecorators: true` + `emitDecoratorMetadata: true`
- `module: "NodeNext"` — use `.js` extensions in all imports
- `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`

---

## Common Pitfalls

- **Vike ignores gitignored pages**: NEVER add `pages/` subdirectories to `.gitignore`. Vike respects `.gitignore` when scanning — gitignored page directories are invisible to routing, causing silent 404s.
- **Pilotiq route functions + SPA nav**: Route functions in `pages/(pilotiq)/` must tentatively match on the client (`import.meta.env.SSR` check only gates the registry lookup, not the entire match). Returning `false` on client breaks SPA navigation and causes full page reloads.
- **Pilotiq page stubs**: `pages/(pilotiq)/` is auto-generated by the `pilotiq()` Vite plugin. Don't edit manually — changes are overwritten. To customize rendering, create `app/Views/` files with matching `export const route` (static routes beat route functions).
- **Pilotiq layout persistence**: AppShell lives in `+Layout.tsx`, NOT in individual `+Page.tsx`. Vike keeps layouts mounted across navigations — putting the shell in pages causes sidebar to remount/reset on every nav.
- **Stale vendored pages** (panels only): Re-run `pnpm rudder vendor:publish --tag=pilotiq-pages --force` after every edit to `packages/panels/pages/`
- **Stale `dist/`**: Run `pnpm build` from rudderjs root, then pilotiq root
- **Prisma client wrong repo**: `config/database.ts` passes `PrismaClient: PrismaClient as any` to fix cross-repo resolution
- **Port in use**: `lsof -ti :24679 -ti :3001 | xargs kill -9`
- **Panels server handlers**: `pnpm dev` hot-reloads frontend only; server handlers need `pnpm build` + restart
