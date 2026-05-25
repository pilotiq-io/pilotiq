# Build setup

## `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import { pilotiq } from '@pilotiq/pilotiq/vite'
// + your framework's vite plugin, vike, tailwind, react…

export default defineConfig({
  plugins: [
    pilotiq(),        // generates pages/(pilotiq)/ + _components.ts from the panel
    // rudderjs(), vike(), tailwindcss(), react() …
  ],
  optimizeDeps: {
    exclude: ['@pilotiq/pilotiq'],   // REQUIRED — keep server-only code out of the client pre-bundle
  },
  resolve: {
    dedupe: ['react', 'react-dom', '@pilotiq/pilotiq'],   // single instance
  },
})
```

- **`pilotiq()` is the Vite plugin**, exported from the `/vite` subpath. It reads your panel module via jiti at config time and on every change.
- Panel module path defaults to `app/Pilotiq/AdminPanel.ts`. Override: `pilotiq({ panels: ['./app/Pilotiq/AdminPanel'] })` (multiple panels allowed; the playground ships two).
- **`optimizeDeps.exclude: ['@pilotiq/pilotiq']` is not optional** — without it the dep optimizer tries to pre-bundle the package, drags in `node:fs` / framework internals, and the client build throws on eval. Adapter packages (`@pilotiq/tiptap` etc.) are fine to *include* for pre-bundling; the core package must be excluded.

## `bootstrap/providers.ts`

```ts
import { pilotiq } from '@pilotiq/pilotiq'
import { adminPanel } from '../app/Pilotiq/AdminPanel.js'

export default [
  pilotiq([adminPanel]),    // the provider factory — registers routes
]
```

Note: `pilotiq` from the **main entry** is the provider factory; `pilotiq` from **`/vite`** is the build plugin. Same name, different module — don't cross them.

## Tailwind `@source`

pilotiq ships class *names*, not compiled CSS, so Tailwind must scan the package or the panel renders unstyled.

**Tailwind v4** — main CSS:

```css
@import "tailwindcss";
@source "../node_modules/@pilotiq/pilotiq/dist";
@plugin "@tailwindcss/typography";   /* rich-text / markdown prose */
```

**Tailwind v3** — `content: ['./node_modules/@pilotiq/pilotiq/dist/**/*.js']`.

Adjust the relative path to reach the installed package's `dist` (a workspace/monorepo can point at `src`). **Adapter packages need their own `@source` entry** (`@pilotiq/tiptap`, `@pilotiq/codemirror`, `@pilotiq/recharts`) — they ship class names too; a missing one means some adapter utilities silently never generate.

## Symptoms → fix

| Symptom | Cause / fix |
|---|---|
| Panel renders unstyled / classes missing at random | Missing `@source` (or adapter `@source`). Add it. |
| `node:fs` / `process is not defined` in the browser on load | `@pilotiq/pilotiq` not in `optimizeDeps.exclude`, or a server global leaked into the panel module (see pitfalls). |
| Two React copies / hook errors | Add `@pilotiq/pilotiq` + `react` to `resolve.dedupe`. |
