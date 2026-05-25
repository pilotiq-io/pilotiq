# themeEditor() plugin

A live, in-app theme editor: a "Theme" page with controls + an iframe preview
that writes the chosen tokens to the database so they survive restarts and
apply for every user.

## Wiring

```ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { themeEditor } from '@pilotiq/pilotiq/plugins'

export const adminPanel = Pilotiq.make('Admin')
  .path('/admin')
  .theme({ preset: 'nova', accentColor: 'terracotta' })   // optional — code defaults
  .plugins([ themeEditor() ])
```

- Import from the **`@pilotiq/pilotiq/plugins`** subpath. `.use(themeEditor())` and `.plugins([themeEditor()])` are equivalent.
- Adds a regular top-level **"Theme"** nav link (icon `palette`) — rendered like any other page in both sidebar and topbar, appended last. No `canAccess` gate (the route mounts unconditionally with the editor); guard it yourself upstream if needed.

## Works without `.theme()`

`themeEditor()` doesn't require a `.theme()` call — it seeds an empty config so the built-in default preset + any DB overrides still resolve. Its API routes mount on `hasThemeEditor()`, not on whether a theme was set. So you can ship the editor and let admins pick the theme entirely at runtime.

## How persistence works

- API routes: `GET/PUT/DELETE {base}/api/_theme`, persisted to the **`panelGlobal`** table.
- On boot the service provider loads saved overrides from the DB (`panel.setThemeOverrides()`); `getMergedTheme()` merges **code defaults (`.theme()`) + DB overrides** at request time.
- Saving calls `applyToParent()` to update `<style id="pilotiq-theme">` for instant visual feedback (no reload).
- **Reset to Defaults** restores the panel's *code* `.theme()` config (passed to the page as `codeTheme`, distinct from the DB-merged config), then DELETEs the stored overrides so the server re-resolves to exactly your `.theme()`. With no `.theme()` declared it falls back to the bare factory preset.

## Storage is client-safe by construction

The editor page renders client-side; the DB writes happen only in the server-side API routes. If you pass a custom storage delegate, keep it lazy so it never touches Node APIs during the client bundle eval — e.g. a getter that resolves the Prisma model only when called server-side:

```ts
// pass storage on the panel via .plugins(), not in bootstrap/providers.ts
themeEditor({ storage: prismaThemeStorage({
  get panelGlobal() { return prisma().panelGlobal },   // getter fires server-side only
}) })
```

Without explicit storage the editor uses the default `panelGlobal`-backed storage (and emits a deprecation warning for the implicit Prisma fallback — pass `storage` to silence it).

## Notes

- `@pilotiq/pilotiq` must be in `optimizeDeps.exclude` in the app's `vite.config.ts` (see `pilotiq-vite-plugin`) — the theme editor's client bundle relies on it.
- The editor's preview iframe applies the same Fontshare/Satoshi detection as the live panel, so brand fonts render in the preview too.
