# Pilotiq — Architecture Document
> Open-source admin panel builder for RudderJS — Filament meets VS Code.

---

## Philosophy

| Principle | Description |
|-----------|-------------|
| **Resource-first** | Every admin screen maps to a Model via a Resource class. |
| **Schema-driven** | Fields, columns, schema elements — all declared in code, rendered automatically. |
| **Extensible** | `.use()` plugins, custom pages, theme presets, component slots. |
| **Framework-native** | Built on @rudderjs/core — uses the same DI, ORM, auth, and routing primitives. |
| **Zero vendoring** | `@pilotiq/pilotiq` auto-generates Vike pages via Vite plugin — no manual copy step. |

---

## Monorepo Structure

```
pilotiq/
├── packages/
│   ├── pilotiq/               # NEW — View-based admin panel
│   │   └── src/
│   │       ├── Pilotiq.ts         # Builder: .path(), .branding(), .theme(), .resources(), .pages(), .schema(), .guard()
│   │       ├── Resource.ts        # Resource base class (table + form config)
│   │       ├── Page.ts            # Custom page class (static schema, slug, label, icon)
│   │       ├── PilotiqRegistry.ts # globalThis-backed singleton, findByPath()
│   │       ├── PilotiqServiceProvider.ts  # Provider + pilotiq() factory
│   │       ├── routes.ts          # registerPilotiqRoutes() via @rudderjs/view
│   │       ├── vite.ts            # Vite plugin — auto-generates pages/(pilotiq)/
│   │       ├── fields/            # Field types: Text, Textarea, Email, Number, Select, Toggle, Date, Slug
│   │       ├── schema/            # Schema elements: Text, Heading, Alert, Divider, Card + resolveSchema()
│   │       ├── theme/             # Theme engine (see Theme System below)
│   │       └── react/             # React components
│   │           ├── AppShell.tsx       # Layout picker (sidebar | topbar)
│   │           ├── SchemaRenderer.tsx # Renders resolved schema elements
│   │           ├── ThemeProvider.tsx   # Light/dark/system context + CSS var injection
│   │           ├── ThemeToggle.tsx     # Sun/moon toggle button
│   │           ├── layouts/           # SidebarLayout.tsx, TopbarLayout.tsx
│   │           └── ui/               # shadcn primitives (sidebar, button, sheet, separator, tooltip, skeleton, input)
│   ├── tiptap/                # Tiptap rich-text adapter
│   ├── codemirror/            # CodeMirror 6 code-editor adapter
│   └── recharts/              # Recharts widget adapter
├── docs/                      # Documentation
└── playground/        # Demo app (port 3003)
```

---

## @pilotiq/pilotiq — How It Works

### Setup (two imports)

```ts
// vite.config.ts
import { pilotiq } from '@pilotiq/pilotiq/vite'
plugins: [pilotiq(), ...]

// bootstrap/providers.ts
import { pilotiq } from '@pilotiq/pilotiq'
pilotiq([adminPanel, simplePanel])
```

### Flow

```
                    BUILD TIME                              REQUEST TIME
                    ──────────                              ────────────
pilotiq() Vite    → generates pages/(pilotiq)/         Vike routes request
plugin              ├── +Head.tsx (FOUC script)         → route function checks PilotiqRegistry
                    ├── +Layout.tsx (ThemeProvider       → view() returns viewProps
                    │    + AppShell)                     → Layout wraps page with themed shell
                    ├── +config.ts (passToClient)        → +Page.tsx renders content
                    ├── dashboard/+Page.tsx
                    ├── resource-index/+Page.tsx
                    ├── resource-create/+Page.tsx
                    ├── resource-edit/+Page.tsx
                    └── page/+Page.tsx

Pilotiq.make()    → PilotiqRegistry.register()
builder             (globalThis singleton)

pilotiq()         → PilotiqServiceProvider
provider            → registerPilotiqRoutes()
                      → router.get(path, () => view('pilotiq.*', { panel, theme, schema, ... }))
```

### Page Generation

The `pilotiq()` Vite plugin generates Vike page stubs at construction time (before Vike scans `pages/`). Stubs use route functions that check `PilotiqRegistry` at request time, so they work for any number of registered panels without regeneration.

- `+Layout.tsx` — wraps all pilotiq pages with `ThemeProvider` + `AppShell`. Persists across navigations (sidebar state survives).
- `+Head.tsx` — FOUC prevention script (reads localStorage before React hydrates) + Google Fonts preload.
- Individual `+Page.tsx` stubs render only content (no shell wrapper).
- Route functions tentatively match on client for SPA nav, check registry on server.

### Route Strategy

| Page dir | URL pattern | Notes |
|---|---|---|
| `dashboard/` | `/{base}` | 1 segment |
| `slug/` | `/{base}/{slug}` | 2 segments — handles BOTH resource index and custom pages. Server sets `pageType: 'resource' \| 'page'` in viewProps; one `+Page.tsx` renders accordingly. |
| `resource-create/` | `/{base}/{slug}/create` | 3 segments |
| `resource-edit/` | `/{base}/{slug}/{id}/edit` | 4 segments |
| `theme/` | `/{base}/theme` | 2 segments — `slug` route excludes `parts[1] === 'theme'` to avoid conflict |

**Why a single `slug` route**: Earlier we had separate `resource-index` and `page` routes that both matched 2-segment URLs. On the server, the `page` route checked the registry to skip resource slugs. But on the client (SPA nav), the registry check is skipped, so both routes matched and Vike couldn't disambiguate, breaking SPA navigation. Merging into one route avoids the ambiguity.

---

## Theme System

### Architecture

```
ThemeConfig (user-facing)           ThemeMeta (resolved, serializable)
───────────────────────             ────────────────────────────────
.theme({                    →       { light: { '--bg': '...', ... },
  preset: 'nova',           →         dark:  { '--bg': '...', ... },
  accentColor: 'blue',      →         radius: '0.625rem',
  radius: 'medium',         →         fonts: { heading: 'Space Grotesk' },
  fonts: { heading: '...' } →         fontFamily: { heading: "'Space Grotesk', sans-serif" },
})                           →         iconLibrary: 'lucide' }
```

### Layering Pipeline (resolveTheme)

Each layer overrides the previous:

1. **Preset** — full set of 30+ OKLCH CSS variables (default, nova, maia, lyra)
2. **Base color** — overrides neutral/gray tones (neutral, stone, zinc, slate, olive, taupe)
3. **Accent color** — overrides primary color (blue, red, green, amber, orange, cyan, violet, purple, pink, rose, emerald, teal, indigo, fuchsia, lime, sky)
4. **Chart palette** — overrides chart-1 through chart-5 (default, ocean, sunset, forest, berry)
5. **Raw CSS variables** — escape hatch, highest priority

### CSS Output (generateThemeCSS)

```css
:root {
  --background: oklch(0.99 0.002 75) !important;
  --primary: oklch(0.488 0.243 264) !important;
  /* ... all variables */
  --radius: 0.625rem !important;
}
.dark {
  --background: oklch(0.16 0.008 75) !important;
  /* ... dark overrides */
}
```

Uses `!important` to override Tailwind's `@layer` declarations.

### Dark/Light/System

- **ThemeProvider** — React context with `theme` (light/dark/system), `setTheme()`, `resolved`
- **Persistence** — `localStorage['pilotiq-theme']`
- **System detection** — `prefers-color-scheme` media query listener, updates on OS change
- **FOUC prevention** — Inline `<script>` in `+Head.tsx` sets `.dark` class before React hydrates
- **SSR** — Inline `<style>` with theme CSS in `+Layout.tsx` prevents flash

### Theme Files

| File | Purpose |
|------|---------|
| `theme/types.ts` | ThemeConfig, ThemeMeta, StylePreset, BaseColor, AccentColor, etc. |
| `theme/presets.ts` | 4 style presets with full OKLCH variable sets |
| `theme/base-colors.ts` | 6 base color scales |
| `theme/accent-colors.ts` | 16 accent colors |
| `theme/chart-palettes.ts` | 5 chart palettes |
| `theme/radius.ts` | 5 border radius presets |
| `theme/icon-map.ts` | 28 canonical icons mapped across 4 libraries |
| `theme/resolve.ts` | `resolveTheme()` — layered resolution pipeline |
| `theme/generate-css.ts` | `generateThemeCSS()` — CSS string output |

### themeEditor() Plugin

```ts
import { themeEditor } from '@pilotiq/pilotiq/plugins'

Pilotiq.make('Admin')
  .theme({ preset: 'nova', accentColor: 'blue' })
  .use(themeEditor())
```

- **Plugin system**: `PilotiqPlugin` interface + `.use()` on builder. `@pilotiq/pilotiq/plugins` export path.
- **ThemeSettingsPage**: Controls sidebar (preset, base/accent color, chart palette, fonts, icons, radius) + live iframe preview via `srcDoc` (client-only, mounted guard for hydration).
- **API routes**: GET/PUT/DELETE `{base}/api/_theme` — persisted to the `panelGlobal` table through the theme-storage adapter (the app's `'db'` ORM adapter by default; `prismaThemeStorage()` for Prisma apps).
- **Runtime merging**: Service provider loads overrides on boot. `getMergedTheme()` = code defaults + DB overrides.
- **Instant feedback**: `applyToParent()` updates `<style id="pilotiq-theme">` on save, then `navigate()` re-fetches server data.
- **Navigation**: Generated page passes `vike/client/router` `navigate` via `onNavigate` prop. Route functions for `resource-index` and `page` exclude `'theme'` slug to avoid catching the built-in route.
- **Vite config**: `@pilotiq/pilotiq` must be in `optimizeDeps.exclude` to prevent Vite from pre-bundling server code into the client.

---

## Cross-Repo Wiring

All `@rudderjs/*` packages resolve to `link:../rudderjs/packages/<name>` via `pnpm.overrides` in the root `package.json`. No git submodules — sibling clones on disk.

```
~/Projects/
├── rudderjs/       # Framework (pnpm.overrides: none)
├── pilotiq/        # Free panels (pnpm.overrides: @rudderjs/* → link:../rudderjs/...)
└── pilotiq-pro/    # Pro extensions (pnpm.overrides: @rudderjs/* + @pilotiq/* → links)
```

---

## Playgrounds

| Playground | Port | HMR | Purpose |
|---|---|---|---|
| `rudderjs/playground` | 3000 | 24678 | Framework demo — zero pilotiq deps |
| `pilotiq/playground` | 3003 | 24680 | Pilotiq demo — view-based panel + themeEditor |
| `pilotiq-pro/playground` | 3002 | 24680 | Full stack — framework + pilotiq + AI + collab |

### Playground providers

- **playground/** (pilotiq): log, native database (`@rudderjs/orm` + `@rudderjs/database`), session, cache, pilotiq

```bash
cd ~/Projects/rudderjs && pnpm build                       # build framework first
cd ~/Projects/pilotiq && pnpm build                        # build pilotiq packages
cd ~/Projects/pilotiq/playground && pnpm dev       # pilotiq on :3003
```

### Playground panel definitions

| Panel | Path | Layout | Theme |
|---|---|---|---|
| Pilotiq Admin | `/new-admin` | sidebar | nova + blue accent + themeEditor |
| Pilotiq Simple | `/simple` | topbar | default |

---

## Package Exports

### @pilotiq/pilotiq

| Export path | Contents |
|---|---|
| `@pilotiq/pilotiq` | Builder, Resource, Page, Fields, Schema, Theme engine, PilotiqPlugin type |
| `@pilotiq/pilotiq/react` | AppShell, SchemaRenderer, ThemeProvider, ThemeToggle, ThemeSettingsPage, useTheme, generateThemeCSS, resolveTheme |
| `@pilotiq/pilotiq/registry` | PilotiqRegistry singleton |
| `@pilotiq/pilotiq/vite` | `pilotiq()` Vite plugin |
| `@pilotiq/pilotiq/plugins` | `themeEditor()` plugin |
