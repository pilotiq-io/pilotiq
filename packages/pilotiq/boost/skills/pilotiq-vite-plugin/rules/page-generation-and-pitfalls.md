# Page generation, `_components.ts`, and pitfalls

## What the plugin emits

Into `pages/(pilotiq)/`:

- `+Layout.tsx` — wraps pages in `ThemeProvider` + `AppShell` (the chrome: sidebar/topbar, search, user menu). **The shell lives here, not in page stubs** — Vike keeps the layout mounted across navigations.
- `+Head.tsx` — FOUC-prevention script (dark mode before hydration) + font preload.
- `+config.ts` — `passToClient` wiring.
- role stubs — `dashboard/`, `slug/` (resource index / global / custom page), `resource-create/`, `resource-view/`, `resource-edit/`, `relation-*`, `theme/`. Each `+Page.tsx` is just `<SchemaRenderer elements={vp.schemaData ?? []} />` — the server resolves, the client renders.
- `_components.ts` — a manifest: `componentRegistry: { ClassName: ClassRef }` (so component-typed icons resolve at render), plus `rightPanelRegistry`, `componentSlotRegistry`, and `clusterSlugsByBasePath`. These hold real refs that can't travel over the wire.

It re-runs in `configureServer` on panel changes, so editing the panel regenerates the pages.

## Pitfalls (the ones that bite)

- **Never gitignore `pages/` (or its subdirectories).** Vike respects `.gitignore` when scanning routes — a gitignored generated page is invisible → silent 404. Commit the generated `pages/(pilotiq)/` tree.
- **Don't hand-edit the generated stubs.** They're overwritten every run. To customize a page's rendering, create an `app/Views/` file with a matching `export const route` (a static route beats the generated route function).
- **The panel module must be client-safe.** `_components.ts` re-imports `AdminPanel.ts` on the *client* (to harvest component-typed icons / slots). Any Node-only side-effect at module load — e.g. `localUpload({ root })`, reading the filesystem, touching `process.env` at top level — crashes hydration → **every link becomes a full page reload**. Move Node side-effects to `bootstrap/providers.ts`; use the `@pilotiq/pilotiq/uploads` subpath for upload adapters so they're not pulled into the client graph.
- **"Lost SPA / full reloads" = a hydration crash.** Almost always a server global (`node:fs` / `process`) leaked into the client bundle via the panel module or a dep. Read the browser console's exact stack frame for the offending module.
- **Route functions must tentatively match on the client.** If you author a custom route function, gate only the *registry lookup* behind `import.meta.env.SSR` — returning `false` on the client breaks SPA navigation and forces full reloads.
- **`AppShell` belongs in `+Layout.tsx`.** Putting it in a `+Page.tsx` remounts the sidebar on every navigation (state resets).

## Authoring `.tsx` inside the panel module dir (component slots)

If you register a component **slot** (`Pilotiq.components({ nav })`) whose component lives next to the panel module, two jiti gotchas apply (the plugin jiti-loads the panel to harvest `cfg.components`):

1. jiti needs JSX support — the plugin enables it, matching a `"jsx": "react-jsx"` tsconfig (no per-file React import needed).
2. jiti resolves `.js` → `.ts` but **not** `.js` → `.tsx` — so the import in the panel module must use the literal `.tsx` extension: `import { MyNav } from './MyNav.tsx'` (with `allowImportingTsExtensions: true` in tsconfig).

The non-slot pattern (a component registered via `registerWidgetComponents` / `registerEntryComponents` from `+Layout.tsx`) is read by Vite, not jiti, and sidesteps both — but slots need a real ref at panel-build time, so they go through jiti.
