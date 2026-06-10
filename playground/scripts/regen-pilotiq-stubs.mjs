#!/usr/bin/env node
/**
 * Regenerate the auto-generated Vike stubs under `pages/(pilotiq)/`
 * without booting the dev server.
 *
 * The pilotiq Vite plugin emits the stubs at construction time (plus a
 * full manifest in `buildStart`). `pnpm dev` and `pnpm build` invoke
 * the plugin naturally, but `pnpm typecheck` runs `tsc --noEmit` and
 * never touches Vite — so the on-disk stubs go stale relative to the
 * vite.ts source templates whenever a stub line moves. This script is
 * wired to `pretypecheck` to keep them in sync.
 *
 * Requires `@pilotiq/pilotiq` to be built (workspace dist exists). On
 * a fresh clone, the upstream turbo task `^build` handles that.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const playgroundRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pagesRoot = path.join(playgroundRoot, 'pages')

const { pilotiq } = await import('@pilotiq/pilotiq/vite')

// Construct the plugin from the playground's cwd so panel paths resolve.
// Keep the panels list in sync with vite.config.ts. Plugin construction
// calls generatePages + writeComponentsManifest([], pagesRoot) +
// writeLayoutWithManifest(pagesRoot) — enough for typecheck. For the
// real component manifest, vite dev/build runs buildStart later.
process.chdir(playgroundRoot)
const plugin = pilotiq({ panels: ['./app/Pilotiq/AdminPanel', './app/Pilotiq/GuestPanel'] })

// Best-effort: run buildStart to populate the manifest with actual
// panel classes. Failures here (e.g., panel module not import-safe in
// this restricted context) are non-fatal — the empty manifest still
// satisfies typecheck.
if (plugin.buildStart) {
  try {
    await plugin.buildStart.call({ error: () => {} })
  } catch (err) {
    console.warn('[regen-pilotiq-stubs] manifest build skipped:', err instanceof Error ? err.message : err)
  }
}
