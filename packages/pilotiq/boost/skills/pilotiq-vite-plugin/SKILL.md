---
name: pilotiq-vite-plugin
description: Wiring & debugging the pilotiq build — the `pilotiq()` Vite plugin, `optimizeDeps.exclude`, Tailwind `@source`, the auto-generated Vike pages + `_components.ts` registry, and the dev/SSR pitfalls (client-safe panel module, never gitignore generated pages)
license: MIT
appliesTo:
  - '@pilotiq/pilotiq'
trigger: setting up or debugging the build / dev server — adding `pilotiq()` to `vite.config.ts`, `optimizeDeps.exclude` or `resolve.dedupe`, Tailwind `@source`, a panel that isn't picked up, generated `pages/(pilotiq)/` 404ing, full-page reloads on SPA navigation, unstyled panel, or `_components.ts` / component-registry issues
skip: authoring resources / fields / actions / widgets / theme (use the matching pilotiq skill) — this skill is the build + page-generation layer only
metadata:
  author: pilotiq
---

# Pilotiq Vite Plugin

## When to use this skill

Load when you're touching the **build / dev** layer:

- Adding `pilotiq()` to `vite.config.ts`, or `optimizeDeps` / `resolve.dedupe`.
- The panel renders **unstyled** (Tailwind not scanning pilotiq), or a panel edit isn't picked up.
- Generated `pages/(pilotiq)/` routes **404**, or every navigation does a **full page reload** instead of SPA client-routing.
- A custom component (icon / right-panel / nav slot) doesn't resolve at render — `_components.ts` registry.

For *what goes in* a panel (resources, fields, actions, widgets, theme), use the other pilotiq skills — this one is the plumbing.

## Quick Reference

| Task | Open |
|---|---|
| `vite.config.ts` setup — `pilotiq()` plugin, `optimizeDeps.exclude`, dedupe, Tailwind `@source`, the two-line wiring | `rules/setup.md` |
| Generated pages + `_components.ts`, SPA route-matching, client-safe panel module, the don't-do pitfalls | `rules/page-generation-and-pitfalls.md` |

## Key concepts (load once)

- **Two-line setup.** (1) `vite.config.ts`: `import { pilotiq } from '@pilotiq/pilotiq/vite'` → `plugins: [pilotiq(), …]`. (2) `bootstrap/providers.ts`: `import { pilotiq } from '@pilotiq/pilotiq'` → `pilotiq([adminPanel])`. Same name, two different exports (Vite plugin vs provider factory).
- **The plugin generates Vike pages.** It reads your panel module (`app/Pilotiq/AdminPanel.ts` by default, override with `pilotiq({ panels: […] })`) via **jiti**, and emits `pages/(pilotiq)/` (`+Layout.tsx`, `+Head.tsx`, `+config.ts`, role stubs) plus `_components.ts`. It re-runs in `configureServer` on panel changes. **Your panel module must be import-safe and client-safe** (see pitfalls).
- **`@pilotiq/pilotiq` must be in `optimizeDeps.exclude`.** Otherwise the dep optimizer pulls server-only code (`node:fs`, framework internals) into the client bundle and dev breaks.
- **Tailwind must `@source` the package.** pilotiq ships utility *class names*, not compiled CSS — without `@source` the panel renders unstyled.
- **`_components.ts` is a build-time manifest.** Maps `{ ClassName: ClassRef }` (component-typed icons), plus right-panel / component-slot registries and cluster slugs, so those resolve at render without traveling over the wire.
- **Never gitignore `pages/`, never hand-edit the generated stubs.** Vike respects `.gitignore` (gitignored = invisible = 404s); the stubs are regenerated each run.

## Examples

- `playground/vite.config.ts` — the full plugin + `optimizeDeps` + dedupe setup.
- `playground/bootstrap/providers.ts` — `pilotiq([adminPanel])`.
- `playground/src/index.css` — the Tailwind `@source` line.
