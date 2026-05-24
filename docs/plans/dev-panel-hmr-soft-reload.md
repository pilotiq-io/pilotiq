# Dev panel HMR — soft reload (kill the full-page reload)

**Status:** spike plan, 2026-05-24. One approach already attempted and abandoned (see "Dead ends"). Pick up with a browser open — this cannot be landed blind.

**Goal:** editing `app/Pilotiq/AdminPanel.ts` (and the schemas it imports) in dev should re-render the panel **without a full browser page reload** — a data-only re-render. Target: near-instant, no JS re-download / re-hydrate.

---

## Where we are today (works, but full reload)

- **`livePanel()`** (PRs #70/#71): SSR route handlers close over the boot-time `Pilotiq` instance; `livePanel(panel)` re-resolves it from `PilotiqRegistry` by name at request time. This is the **read** side.
- **Vite plugin dev refresh** (PRs #78/#79, `src/vite.ts` `configureServer`): on file change, re-import the panel via `devServer.ssrLoadModule` (incremental — no jiti) and swap the fresh instance into `PilotiqRegistry`, carrying boot-time theme state (storage + DB overrides) over. This is the **write** side, and it's what makes the post-reload SSR fresh.
- Net: panel edits **reflect correctly**, and per-save work is cheap — **but the browser still does a FULL page reload.**

## Why the full reload happens

The generated `pages/(pilotiq)/_components.ts` does `import { pilotiqAdmin, … } from '<panel module>'` (component class refs for icons). So **`AdminPanel.ts` is in the client module graph**. Editing it invalidates `_components.ts` → `+Layout.tsx` → root with **no HMR accept boundary**, so Vite triggers a full page reload (re-download + re-eval of the client bundle + re-SSR + re-hydrate). That reload is the remaining slowness.

## Target approach

Convert the full reload into a Vike **data-only re-render**:

1. On a panel-module edit, refresh the live registry server-side (already have `refreshLivePanel` from #78/#79).
2. Tell the client to call **`reload()`** from `vike/client/router` (confirmed exported in vike 0.4.257 — re-runs `+data` → `dispatchPageData` → fresh registry → re-render, no full reload).
3. Suppress Vite's default full reload for the panel file.

`reload()` still does one `+data` server round-trip (so not literally zero-latency for data-heavy list pages), but it removes the JS re-download / re-eval / re-hydrate — the expensive part.

## Dead ends (do NOT repeat as-is)

Attempted: plugin `handleHotUpdate(ctx)` → if `ctx.file` is a panel file: `await refreshLivePanel(ctx.server)`, `ctx.server.ws.send({ type: 'custom', event: 'pilotiq:panel-reload' })`, `return []` (suppress full reload); plus a client listener in the generated `+Layout` that calls `reload()`.

**Result: STALE renders.** Verified server-side via curl-after-edit: the SSR output kept the *old* `branding.title`.

**Root of the failure:** returning `[]` from `handleHotUpdate` skips Vite's own module invalidation, and on **Vite 7** the SSR runtime uses an **environment-split module graph + module-runner cache**. Manual eviction did **not** make `ssrLoadModule` re-execute the edited panel — tried:
- `devServer.moduleGraph.getModuleById(file)` + `invalidateModule` — `getModuleById` missed (Vite IDs ≠ raw file path).
- `devServer.moduleGraph.getModulesByFile(resolved)` + `invalidateModule` — still stale.
- Same on `devServer.environments.ssr.moduleGraph` (Vite 7) — still stale.

Contrast: the #79 **watcher** path (no `handleHotUpdate`) gets fresh, because Vite's *default* HMR pipeline runs and invalidates the SSR module before the watcher's `ssrLoadModule`. Suppressing that pipeline is what breaks freshness.

## The real blocker to crack (with a browser)

How to get `ssrLoadModule` (or the Vite 7 module runner) to **re-execute the edited panel** while **also** suppressing the client full reload. Likely answers to probe:
- The correct Vite 7 cache to evict is the **module runner's** evaluated-module cache, not just the module-graph node. Look at `devServer.environments.ssr` — its `moduleRunner` / `runner` and any `clearCache()` / `evaluatedModules` API. `ssrLoadModule` is deprecated in Vite 7; the live path may be `environments.ssr.runner.import()` / `moduleRunner.evaluatedModules`.
- Alternative: **don't** suppress via `handleHotUpdate` `[]`. Instead let Vite's normal pipeline run (keeps SSR fresh, as #79 proves) and add a **client accept boundary** in the generated `_components.ts`: `import.meta.hot.accept('<panel specifier>', () => reload())`. Accepting the *specific dep* should stop the bubble at `_components` (no full reload) while Vite still invalidates normally. **Degrades gracefully** — if the accept doesn't fully catch it, Vite falls back to the full reload (= #79 behavior, still correct). This is the recommended first thing to try because the failure mode is "no worse than today," not "stale."

## Acceptance criteria

- Edit `AdminPanel.ts` branding/layout/nav → panel updates in the browser **without a full reload** (verify in devtools Network: no document re-request; or a console marker that survives).
- The updated value is **fresh, not stale** (the thing that killed the last attempt) — confirm both in the DOM and via curl.
- Active **theme** (incl. DB overrides) persists across the edit (already handled by #79's state carry-over; keep it).
- Schema edits (resource/page files the panel imports) either take the same fast path or fall back to the (correct) full reload.
- No regression for production build (`configureServer` / `handleHotUpdate` are dev-only).

## Trade-offs / notes

- Editing a **component-typed icon** (a `Resource.icon = SomeComponent`) needs the client component registry rebuilt — that case may still warrant a full reload; acceptable.
- Watch for **duplicate HMR listeners** if injecting into a module that re-evaluates (guard with a `window` flag).
- Keep `livePanel()` — it's the read half and stays load-bearing regardless (see `~/.claude/.../memory` notes).

## References

- `packages/pilotiq/src/vite.ts` — `configureServer`, `refreshLivePanel` (#78/#79).
- `packages/pilotiq/src/PilotiqRegistry.ts` — `livePanel()`.
- Generated `pages/(pilotiq)/_components.ts` (imports the panel) and `+Layout.tsx`.
- Upstream (CLOSED, framework not the cause): `~/Projects/rudder/docs/plans/2026-05-24-provider-boot-route-handler-hmr-staleness.md`.
