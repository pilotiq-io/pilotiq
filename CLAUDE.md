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
- `src/Pilotiq.ts` — Builder: `.path()`, `.branding()`, `.theme()`, `.layout('sidebar'|'topbar')`, `.resources()`, `.pages()`, `.schema()`, `.guard()`
- `src/Page.ts` — Custom page class with `static schema()`, `static slug/label/icon`
- `src/PilotiqRegistry.ts` — globalThis-backed singleton registry, `findByPath()` for route matching
- `src/PilotiqServiceProvider.ts` — Provider + `pilotiq()` factory
- `src/routes.ts` — `registerPilotiqRoutes()` using `view()`, resolves schema + theme
- `src/vite.ts` — `pilotiq()` Vite plugin, generates `(pilotiq)/` pages + `+Layout.tsx` + `+Head.tsx`
- `src/schema/` — Schema elements: `Text`, `Heading`, `Alert`, `Divider`, `Card` + `resolveSchema()`
- `src/theme/` — Theme engine: types, presets (default/nova/maia/lyra), base-colors, accent-colors, chart-palettes, radius, icon-map, `resolveTheme()`, `generateThemeCSS()`
- `src/react/AppShell.tsx` — Picks layout mode, renders sidebar or topbar
- `src/react/ThemeProvider.tsx` — Light/dark/system context, localStorage, CSS var injection
- `src/react/ThemeToggle.tsx` — Sun/moon toggle button (in both layout headers)
- `src/react/layouts/SidebarLayout.tsx` — shadcn Sidebar (collapsible, mobile-responsive)
- `src/react/layouts/TopbarLayout.tsx` — horizontal nav variant
- `src/react/ThemeSettingsPage.tsx` — Full theme editor: controls sidebar + live iframe preview
- `src/react/SchemaRenderer.tsx` — Renders resolved schema elements
- `src/react/ui/` — shadcn primitives (sidebar, button, sheet, separator, tooltip, skeleton, input)
- `src/plugins/themeEditor.ts` — `themeEditor()` plugin

**Pilotiq page generation:**
- `pages/(pilotiq)/+Head.tsx` — FOUC prevention script (reads localStorage, sets `.dark` before hydration) + Google Fonts preload
- `pages/(pilotiq)/+Layout.tsx` — wraps pages in ThemeProvider + AppShell, injects theme CSS inline for SSR
- `pages/(pilotiq)/+config.ts` — `passToClient: ['viewProps']`
- `pages/(pilotiq)/theme/` — Theme editor page (only when `.use(themeEditor())`)
- Individual `+Page.tsx` stubs render only content (no shell wrapper)
- Route functions check `PilotiqRegistry` on server, tentatively match on client for SPA nav
- Route functions for `resource-index` and `page` exclude `parts[1] === 'theme'` to avoid catching the built-in theme editor route

**Plugin system:**
- `PilotiqPlugin` interface: `{ name: string, register(panel): void }`
- `.use(plugin)` on builder — calls `plugin.register(panel)`
- `@pilotiq/pilotiq/plugins` export path for built-in plugins

**Theme system:**
- `Pilotiq.theme({ preset, baseColor, accentColor, chartPalette, radius, fonts, iconLibrary, cssVariables })` configures theme
- `resolveTheme()` layers: preset → base color → accent color → chart palette → raw CSS vars
- `generateThemeCSS()` outputs `:root { ... } .dark { ... }` with `!important` for Tailwind override
- ThemeProvider manages light/dark/system state, persists to `localStorage['pilotiq-theme']`
- ThemeToggle renders in both SidebarLayout and TopbarLayout headers
- FOUC prevention: inline `<script>` in +Head.tsx + inline `<style>` in +Layout.tsx
- 4 presets (default, nova, maia, lyra), 6 base colors, 16 accent colors, 5 chart palettes, 5 radii
- All colors in OKLCH format for perceptual uniformity

**themeEditor() plugin:**
- `import { themeEditor } from '@pilotiq/pilotiq/plugins'` → `.use(themeEditor())`
- Adds "Theme" nav link in sidebar footer / topbar
- ThemeSettingsPage: controls sidebar + live iframe preview (srcDoc, client-only via mounted guard)
- API routes: GET/PUT/DELETE `{base}/api/_theme` persisted to `panelGlobal` table
- `applyToParent()` updates `<style id="pilotiq-theme">` for instant visual feedback on save
- Service provider loads saved overrides from DB on boot via `panel.setThemeOverrides()`
- `getMergedTheme()` merges code defaults + DB overrides at runtime
- Generated page passes `vike/client/router` `navigate` via `onNavigate` prop for server data re-fetch
- `@pilotiq/pilotiq` must be in `optimizeDeps.exclude` in app's `vite.config.ts`

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
