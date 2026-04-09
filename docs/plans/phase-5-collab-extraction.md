# Phase 5 — Collab Extraction Plan

Carve `useYjsCollab` and the Yjs runtime wiring out of `@pilotiq/lexical` (free, MIT) into `@pilotiq-pro/collab` (private, commercial), so free Pilotiq ships a fully-functional local-only Lexical editor and pro Pilotiq adds real-time collaboration on top — without breaking the existing call sites in `LexicalEditor.tsx` and `CollaborativePlainText.tsx` and without forcing apps to switch their import paths.

**Status:** DRAFT 2026-04-09.

**Packages affected:**
- `@pilotiq/lexical` — yjs/y-websocket/y-indexeddb dependency surface removed; `useYjsCollab` becomes a thin wrapper that delegates to pro when present
- `@pilotiq-pro/collab` — new package containing the real Yjs setup, the React provider/context, and the type augmentation for `y-websocket`

**Depends on:** Phase 3 (the `CollabSupportRegistry` seam) and Phase 4 prework (the `pilotiq-pro` repo bootstrap).

**Related memory:** `project_pilotiq_rebrand.md`, `feedback_yjs_idb_ws_order.md`

---

## Goal

After this plan:

1. `@pilotiq/lexical/src/` contains **zero** runtime imports of `yjs`, `y-websocket`, or `y-indexeddb`. Free lexical's `package.json` drops them as optional peer dependencies.
2. `useYjsCollab` still exists in `@pilotiq/lexical` as a hook with the same return shape as today, but its body is a no-op stub by default. When `@pilotiq-pro/collab` is installed and its provider has booted, the stub delegates to pro's real implementation.
3. Existing `LexicalEditor.tsx` and `CollaborativePlainText.tsx` call sites are **unchanged** — same `useYjsCollab(opts)` call, same destructuring. The components just transparently get collab when pro is present and gracefully render local-only when it isn't.
4. `@pilotiq-pro/collab` exports a `CollabProvider` React component and a service provider that:
   - Seeds `CollabSupportRegistry.enable(['websocket', 'indexeddb'])` (taking over what free's `PanelServiceProvider` currently does as a Phase 3 placeholder)
   - Registers the real `useYjsCollabImpl` into the runtime registry that free's stub reads from
5. Apps that want collab install `@pilotiq-pro/collab`, register its service provider, and wrap their app root in `<CollabProvider>` (or get the provider auto-registered via the panel boot lifecycle — TBD in Open Question O3 below).
6. Apps that don't install pro: `Field.persist(['websocket'])` throws the helpful error from Phase 3, `LexicalEditor` renders in local-only mode, `CollaborativePlainText` renders the read-only fallback (its current behavior when collab isn't ready).

---

## Non-Goals

- **Server-side persistence.** `useYjsCollab` is purely the client-side WebSocket + IndexedDB wiring. The server-side persistence layer (`@rudderjs/live` providers like `livePrisma()` / `liveRedis()`) lives outside this plan and stays in rudderjs.
- **Multi-user presence UX components.** Cursors are wired today via `<CollaborationPlugin>` and a `cursorsContainerRef`. That stays as-is. A polished presence UI (avatar list, "X is editing" banner) is a follow-up.
- **Yjs version bumps or API changes.** Move the existing 134 LOC as-is; rewrites can come later.
- **Replacing `CollaborativePlainText` with a non-collab variant.** It stays a collab-only field type (its name implies it). The Phase 3 read-only fallback when collab isn't available is the right local-mode behavior.
- **Renaming or restructuring the public API of `@pilotiq/lexical`.** Same exports, same component prop shapes, same `index.ts` surface.

---

## Constraints

1. **React Rules of Hooks must be respected.** A component's call to `useYjsCollab` must produce the same set of hook calls every render. We cannot conditionally call different hook functions across renders of the same instance.
2. **No breaking change to call sites.** `LexicalEditor.tsx` and `CollaborativePlainText.tsx` keep their current `useYjsCollab(opts)` invocation.
3. **No hard import from free → pro.** `@pilotiq/lexical` cannot `import` from `@pilotiq-pro/collab` directly (would defeat the open-core split and break installs without pro).
4. **Cross-repo dev still works.** With the `pnpm.overrides` recipe linking pilotiq + pilotiq-pro as siblings, the development loop must remain `pnpm install && pnpm build && pnpm test`.
5. **TypeScript stays strict.** No new `as any` shortcuts beyond what already exists in the file (the dynamic import + module augmentation pattern already uses controlled `as any` casts — we can match that, not exceed it).
6. **Tests stay green.** Currently: 21 lexical tests. Phase 5 must not regress them.

---

## Mechanism — five options considered

The hard problem is: **how does a free package optionally consume a hook implementation from a pro package without importing it directly?** Five candidate mechanisms.

### Option A — React Context

Free defines `CollabContext = createContext<CollabHookFn>(stubHook)`. Free's `useYjsCollab` is `useContext(CollabContext)`. Pro exports `<CollabProvider>` that overrides the context with the real impl.

```ts
// @pilotiq/lexical/src/hooks/useYjsCollab.ts (free)
import { createContext, useContext } from 'react'
import type { UseYjsCollabOptions, UseYjsCollabReturn } from './types.js'

const stubHook = (_opts: UseYjsCollabOptions): UseYjsCollabReturn => ({
  collabReady: false, providerSynced: false, collabRef: { current: null },
  isCollab: false, providerFactory: undefined,
})
export const CollabHookContext = createContext(stubHook)
export function useYjsCollab(opts: UseYjsCollabOptions): UseYjsCollabReturn {
  const hook = useContext(CollabHookContext)
  return hook(opts)
}
```

```tsx
// @pilotiq-pro/collab/src/CollabProvider.tsx (pro)
import { CollabHookContext } from '@pilotiq/lexical'
import { useYjsCollabImpl } from './useYjsCollabImpl.js'
export function CollabProvider({ children }: { children: ReactNode }) {
  return <CollabHookContext.Provider value={useYjsCollabImpl}>{children}</CollabHookContext.Provider>
}
```

**Pros:**
- Pure React, no rules-of-hooks violation (the context value is a hook function reference, stable across renders within a single tree)
- Clean tear-down (unmounting `<CollabProvider>` reverts to the stub)
- Works with React DevTools — context shows up as a Provider in the tree
- App opt-in is explicit and discoverable: wrap your root in `<CollabProvider>` from pro

**Cons:**
- Requires the app to explicitly wrap its root in `<CollabProvider>`. Forgetting this means collab silently doesn't work even though pro is installed (no runtime error). Mitigation: pro's service provider can validate at boot that the panel pages are wrapped — but the validation has to run client-side, so it's late.
- The context-stored value is "a hook function" — that's an unusual pattern. Calling `useContext(CollabHookContext)(opts)` looks weird and may confuse readers.

### Option B — Runtime registry (mutable global)

Free has a `CollabHookRegistry` (mirroring `CollabSupportRegistry` from Phase 3): a single mutable slot holding either a stub or a real impl. Pro's service provider sets the slot at boot. Free's `useYjsCollab` reads the slot on every call.

```ts
// @pilotiq/lexical/src/hooks/CollabHookRegistry.ts (free)
let impl: CollabHookFn = stubHook
export const CollabHookRegistry = {
  set(fn: CollabHookFn) { impl = fn },
  get(): CollabHookFn { return impl },
  reset() { impl = stubHook },
}

// @pilotiq/lexical/src/hooks/useYjsCollab.ts (free)
export function useYjsCollab(opts: UseYjsCollabOptions): UseYjsCollabReturn {
  return CollabHookRegistry.get()(opts)
}
```

Pro's service provider:
```ts
register() {
  CollabHookRegistry.set(useYjsCollabImpl)
  CollabSupportRegistry.enable(['websocket', 'indexeddb'])
}
```

**Pros:**
- No app-side wrapping required. Just install pro and register the provider; everything works.
- Symmetric with the `CollabSupportRegistry` pattern from Phase 3 — same mental model.
- No context plumbing through the React tree.

**Cons:**
- **Rules of hooks risk.** If `useYjsCollab` is first called when `impl === stubHook` and then later the registry is updated, the next call returns a different function. The hook calls inside `stubHook` (zero) and `useYjsCollabImpl` (multiple `useState`/`useEffect`/`useRef`) are different shapes — React will throw `Rendered more hooks than during the previous render`. **Mitigation:** the registry must be populated **before** the first React render. Pro's service provider runs during app boot, which precedes React mounting, so this is satisfiable in practice — but it's a sharp edge that can be tripped by tests, SSR, or hot-reload scenarios.
- The hook indirection isn't visible in React DevTools.

### Option C — Dynamic import inside the hook

Free's `useYjsCollab` keeps its hook scaffolding (`useState`/`useEffect`/`useRef`) but the effect body does `import('@pilotiq-pro/collab').then(...)` to load the real impl on demand.

```ts
export function useYjsCollab(opts: UseYjsCollabOptions): UseYjsCollabReturn {
  const [collabReady, setCollabReady]       = useState(false)
  const [providerSynced, setProviderSynced] = useState(false)
  const collabRef = useRef<YjsCollabRef | null>(null)
  const isCollab = !!(opts.wsPath && opts.docName)

  useEffect(() => {
    if (!isCollab) return
    let teardown: (() => void) | undefined
    import(/* @vite-ignore */ '@pilotiq-pro/collab' as any).then((mod: any) => {
      teardown = mod.startCollab(opts, { collabRef, setCollabReady, setProviderSynced })
    }).catch(() => { /* pro not installed */ })
    return () => { teardown?.() }
  }, [opts.wsPath, opts.docName, opts.fragmentName])

  // ... providerFactory memoization same as today ...
}
```

**Pros:**
- No app-side wrapping required.
- Free always calls the same hooks every render — Rules of Hooks satisfied unconditionally.
- Failure to find pro is a silent no-op — apps without pro just don't get collab.

**Cons:**
- TypeScript pain: `import('@pilotiq-pro/collab')` fails to typecheck when the package isn't installed. Workaround: declare `@pilotiq-pro/collab` as an **optional peer dependency** in `@pilotiq/lexical/package.json` so TS can resolve the types via the workspace at dev time, and use `as any` casts at the call site for production.
- Free's hook still has to know pro's signature (`startCollab(opts, callbacks)`) — that's an implicit cross-package contract that has to stay in sync.
- Vite/Rollup tree-shaking gets confused by `/* @vite-ignore */` dynamic imports — they end up not being code-split cleanly.

### Option D — Stay in free, gate with `CollabSupportRegistry`

Don't move the hook at all. Free's `useYjsCollab` body keeps its current 134 LOC. Add one line at the top of the effect:

```ts
useEffect(() => {
  if (!isCollab) return
  if (!CollabSupportRegistry.has('websocket')) return  // ← gate
  // ... rest of the existing impl ...
}, ...)
```

Pro's `@pilotiq-pro/collab` package becomes a thin "license token" — its only purpose is to call `CollabSupportRegistry.enable(['websocket', 'indexeddb'])` during boot, enabling free's existing hook.

**Pros:**
- Smallest possible code change (~3 lines).
- Zero risk to the existing test suite.
- React Rules of Hooks unaffected.
- Pro installation == registry flag flipped (already validated in Phase 3).

**Cons:**
- **`@pilotiq/lexical` still has yjs/y-websocket/y-indexeddb as optional peer deps and still imports them in `useYjsCollab`'s effect.** The "free package has zero Yjs surface" goal is **not** achieved.
- `@pilotiq-pro/collab` becomes content-free — there's nothing to license, nothing to download. Hard to justify as a paid product surface.
- Long-term: when we later want to add pro-only features (server-side persistence wiring, presence UX components), we'll have to do this work anyway. Option D defers the architecture rather than solving it.

### Option E — HOC / re-export from pro

Pro `@pilotiq-pro/collab` exports a `CollabLexicalEditor` and `CollabPlainText` that wrap the free components and inject collab. Apps choose imports based on whether they want collab.

**Pros:**
- Clean separation, no runtime indirection.
- Pro is a real product with downloadable content.

**Cons:**
- **Breaks the `import { LexicalEditor } from '@pilotiq/lexical'` public API.** Apps must rewrite imports to opt into collab.
- Two parallel component implementations to maintain (or fragile composition).
- Hard to compose with other features (e.g. if Phase 6 adds another wrapping layer, the HOC chain grows).

---

## Recommendation — Option A (Context) with a fallback to Option B if explicit wrapping is unacceptable

**Primary: Option A.** Reasons:

1. **Pure React, no sharp edges.** Rules of Hooks are not just "satisfiable in practice" (Option B) — they're satisfied by construction. The context value is a function reference, stable for the lifetime of the Provider's tree. No race condition, no hot-reload edge case.
2. **Discoverable.** A developer reading `LexicalEditor.tsx` who wants to understand "where does collab come from?" sees `useContext(CollabHookContext)` and follows the context to its Provider. With Option B (registry), the indirection is invisible.
3. **Tear-down is automatic.** Unmounting `<CollabProvider>` reverts to the stub. Tests can mount and unmount the Provider freely without leaking state.
4. **Pro package has real content.** Pro exports a Provider component, an impl, and a service provider — three artifacts the customer is paying for. Option D leaves pro empty.
5. **Validates the open-core split for Phase 4.** The same pattern (free defines a context with a stub default; pro Provider overrides) is the cleanest mechanism for `@pilotiq-pro/ai` to inject the chat UI later. Phase 5 becomes the rehearsal for Phase 4.

**Fallback: Option B.** If Option A's "app must wrap its root in `<CollabProvider>`" requirement turns out to be a UX problem (e.g. apps frequently forget to wrap and end up confused why collab isn't working), we can switch to Option B as a follow-up. The migration is mechanical: remove the `<CollabProvider>`, replace with `CollabHookRegistry.set(useYjsCollabImpl)` in pro's service provider. Free's call sites don't change.

**Mitigation for Option A's discoverability problem:** the panel pages (`pages/(panels)/+Layout.tsx` etc., which are vendor-published and authored in `@pilotiq/panels`) can wrap the panel tree in `<CollabProvider>` automatically when `@pilotiq-pro/collab` is installed. The wrapping is done via dynamic import + a noop fallback so free panels don't pull pro at compile time. This makes pro install == collab works, no manual wrapping needed.

---

## Phase plan

### Phase 5.0 — Bootstrap `@pilotiq-pro/collab` package skeleton

1. `~/Projects/pilotiq-pro/packages/collab/` directory + `package.json` (`@pilotiq-pro/collab`, `version: 0.0.1`, `private: false` — restricted publishing comes from the root `.npmrc`)
2. `tsconfig.json`, `tsconfig.build.json` mirroring `@pilotiq/lexical`'s
3. `src/index.ts` — empty stub for now
4. Empty `src/__tests__/` directory for future tests
5. `pnpm install` from pilotiq-pro root + `pnpm build` succeeds against the new empty package (validates the bootstrap works the same as pilotiq's Phase 1)

**Deliverable:** `pilotiq-pro/packages/collab/` builds clean with zero source files. Commit + push.

### Phase 5.1 — Extract types into `@pilotiq/lexical/hooks/types.ts`

Move the public types out of `useYjsCollab.ts` so the stub and the real impl can both reference them without depending on each other:

```ts
// @pilotiq/lexical/src/hooks/types.ts
export interface UseYjsCollabOptions { ... }
export interface UseYjsCollabReturn { ... }
export interface YjsProvider { ... }
export interface YjsCollabRef { ... }
```

`useYjsCollab.ts` re-exports them for backward compatibility. Free's `index.ts` continues exporting them as today. No behavior change. Verifies the build is still green.

**Deliverable:** Free lexical builds + tests pass.

### Phase 5.2 — Extract the impl into `@pilotiq-pro/collab/src/useYjsCollabImpl.ts`

1. Copy the current `useYjsCollab.ts` body verbatim into `pilotiq-pro/packages/collab/src/useYjsCollabImpl.ts`. Rename the exported function `useYjsCollabImpl`.
2. Copy `pilotiq/packages/lexical/src/types/y-websocket.d.ts` into `pilotiq-pro/packages/collab/src/types/y-websocket.d.ts`.
3. Pro's `package.json` declares yjs, y-websocket, y-indexeddb as **runtime dependencies** (not peers — pro **owns** the collab runtime).
4. Pro's `package.json` declares `@pilotiq/lexical` and `react` as peer dependencies.
5. Pro's `src/index.ts` re-exports `useYjsCollabImpl`.
6. `pnpm install && pnpm build` from pilotiq-pro root succeeds. The build doesn't need to import anything from `@pilotiq/lexical` yet — that wiring comes in Phase 5.4.

**Deliverable:** `@pilotiq-pro/collab` builds clean with the real Yjs impl as `useYjsCollabImpl`.

### Phase 5.3 — Replace free `useYjsCollab.ts` with the context + stub

1. Free's new `useYjsCollab.ts`:
   ```ts
   import { createContext, useContext } from 'react'
   import type { UseYjsCollabOptions, UseYjsCollabReturn } from './types.js'

   /** Stub hook returning the local-only state shape. Used when no @pilotiq-pro/collab provider is wrapping the tree. */
   const stubUseYjsCollab = (_opts: UseYjsCollabOptions): UseYjsCollabReturn => ({
     collabReady: false,
     providerSynced: false,
     collabRef: { current: null },
     isCollab: false,
     providerFactory: undefined,
   })

   /**
    * Context whose value is a hook implementation. Free ships the stub;
    * @pilotiq-pro/collab's <CollabProvider> overrides it with the real
    * Yjs-backed implementation when installed.
    *
    * Open-core seam: this is the React-side counterpart to
    * `CollabSupportRegistry` in @pilotiq/panels.
    */
   export const CollabHookContext = createContext<typeof stubUseYjsCollab>(stubUseYjsCollab)

   /** Public hook used by LexicalEditor and CollaborativePlainText. */
   export function useYjsCollab(opts: UseYjsCollabOptions): UseYjsCollabReturn {
     const hook = useContext(CollabHookContext)
     return hook(opts)
   }
   ```
2. Delete `pilotiq/packages/lexical/src/types/y-websocket.d.ts` (moved to pro).
3. Drop `yjs`, `y-websocket`, `y-indexeddb` from `@pilotiq/lexical/package.json` peer deps.
4. `@pilotiq/lexical/package.json` adds `react` as a hard peer (it was already there) and exports `CollabHookContext` from `src/index.ts`.
5. `pnpm build && pnpm test` from pilotiq root. Tests pass because all 21 lexical tests use the editor in a way that doesn't depend on collab being active (verify this assumption — see Risks below).

**Deliverable:** Free `@pilotiq/lexical` has zero yjs imports, zero y-websocket/y-indexeddb dependencies. `LexicalEditor` and `CollaborativePlainText` continue to compile and run in local-only mode by default. Free build + tests green.

### Phase 5.4 — Add `<CollabProvider>` and the service provider in pro

1. New `pilotiq-pro/packages/collab/src/CollabProvider.tsx`:
   ```tsx
   import type { ReactNode } from 'react'
   import { CollabHookContext } from '@pilotiq/lexical'
   import { useYjsCollabImpl } from './useYjsCollabImpl.js'

   export function CollabProvider({ children }: { children: ReactNode }) {
     return (
       <CollabHookContext.Provider value={useYjsCollabImpl}>
         {children}
       </CollabHookContext.Provider>
     )
   }
   ```
2. New `pilotiq-pro/packages/collab/src/CollabServiceProvider.ts`:
   ```ts
   import { ServiceProvider } from '@rudderjs/core'
   import { CollabSupportRegistry } from '@pilotiq/panels'

   export class CollabServiceProvider extends ServiceProvider {
     register(): void {
       CollabSupportRegistry.enable(['websocket', 'indexeddb'])
     }
   }
   ```
3. Pro's `src/index.ts` exports `CollabProvider`, `CollabServiceProvider`, and `useYjsCollabImpl`.
4. `pnpm build && pnpm test` from pilotiq-pro root.

**Deliverable:** `@pilotiq-pro/collab` ships a Provider component, a service provider, and the impl. Pro builds + tests pass.

### Phase 5.5 — Remove the temporary seed from `@pilotiq/panels`

The Phase 3 `PanelServiceProvider.register()` currently does:
```ts
CollabSupportRegistry.enable(['websocket', 'indexeddb'])  // ← Phase 3 placeholder
```
Now that `@pilotiq-pro/collab`'s service provider does this, free `@pilotiq/panels` should stop seeding it. Apps without pro will get the helpful "install @pilotiq-pro/collab" error from `Field.persist()`.

But: existing tests in `field.test.ts` use `before(() => CollabSupportRegistry.enable(['websocket', 'indexeddb']))` — those keep working unchanged because they're at the test level, not the production seed.

Update the playground (in rudderjs) to register `CollabServiceProvider` if it currently uses `Field.persist(['websocket'])` anywhere — TBD audit step.

**Deliverable:** Free `@pilotiq/panels` no longer auto-enables collab. Pro install is now the only way to get collab in production.

### Phase 5.6 — Auto-wrap the panel layout in `<CollabProvider>` (optional but recommended)

In `@pilotiq/panels/pages/(panels)/+Layout.tsx`, dynamically import `@pilotiq-pro/collab`'s `CollabProvider` if it exists, and wrap the panel tree in it. Falls back to the un-wrapped tree if pro isn't installed.

```tsx
// pages/(panels)/+Layout.tsx
const CollabProvider = useDynamicComponent('@pilotiq-pro/collab', 'CollabProvider')
return CollabProvider
  ? <CollabProvider>{panelTree}</CollabProvider>
  : panelTree
```

This means `pnpm install @pilotiq-pro/collab` + register the service provider == collab works automatically. No manual wrapping required. The dynamic import is gated so free panels don't compile against pro.

**Deliverable:** Pro install is fully transparent to the app developer.

### Phase 5.7 — Documentation

1. Update `pilotiq/docs/packages/lexical.md` with a "Collab mode" section explaining the open-core split.
2. Update `pilotiq-pro/README.md` package table to mark `@pilotiq-pro/collab` as **shipped**.
3. Add a "Cross-repo dev for collab" subsection to `pilotiq-pro/README.md` showing the sibling-on-disk + `pnpm.overrides` workflow.

**Deliverable:** Docs reflect the new mechanism.

### Phase 5.8 — Verify in playground

1. From `~/Projects/rudderjs/playground`, `pnpm dev` and open `/admin`.
2. Without pro installed: open a `RichContentField`, verify it works in local-only mode (no WebSocket connection, edits persist locally).
3. With pro installed (link `@pilotiq-pro/collab` via the playground's overrides): open the same field, verify the WebSocket connects and a second tab sees real-time updates.
4. Verify `Field.persist(['websocket'])` throws the helpful error in a clean app, then succeeds after registering `CollabServiceProvider`.

**Deliverable:** End-to-end verification of both code paths. If the smoke test passes, Phase 5 is complete.

---

## Risks

### R1 — Lexical tests assume `useYjsCollab` does work synchronously

**Risk:** the 21 existing lexical tests might mount `<LexicalEditor>` and call `useYjsCollab` expecting the current Yjs-loading effect. Once `useYjsCollab` becomes a stub, the editor renders differently in tests.

**Mitigation:** before Phase 5.3, audit `pilotiq/packages/lexical/src/__tests__/*.test.ts` to see what they actually exercise. If any test depends on collab being active, it must be re-pointed at the pro impl (or moved to pro's test suite). If tests only exercise local-only behavior — which is likely, since tests typically don't open WebSockets — they're unaffected.

### R2 — `CollaborativePlainText` is collab-by-name, becomes locally-broken without pro

**Risk:** `CollaborativePlainText` is named for collaboration. Its current behavior when collab isn't ready is "render a read-only `<input>`". After Phase 5, free apps using `CollaborativePlainText` always get the read-only fallback unless they also install pro.

**Mitigation:** this is the *correct* behavior. Pilotiq's open-core boundary is "collab is pro". A collab-only field type that doesn't work without pro is consistent with that boundary. Document this in `pilotiq/docs/packages/lexical.md` and consider renaming to `CollabPlainText` or marking as `@pilotiq-pro` specifically. Decision deferred — see Open Question O1.

### R3 — Hook indirection through context is a foot-gun for SSR

**Risk:** Vike does SSR. If a server-rendered tree calls `useYjsCollab` outside a `<CollabProvider>`, the stub returns immediately and the page renders the local-only branch. When the page hydrates client-side, if the client tree has a `<CollabProvider>` wrapped at a different level, React might detect a hydration mismatch.

**Mitigation:** Phase 5.6 (auto-wrapping in `+Layout.tsx`) makes the wrapping symmetric across SSR and CSR. The auto-wrap is checked dynamically — if pro is installed at SSR time, it's installed at CSR time too. Verify in Phase 5.8 smoke test.

### R4 — Cross-repo type resolution

**Risk:** `@pilotiq-pro/collab/src/CollabProvider.tsx` imports `CollabHookContext` from `@pilotiq/lexical`. With the sibling-on-disk + `pnpm.overrides` setup, this resolves to the local pilotiq clone. If the user updates pilotiq's `CollabHookContext` shape (e.g. renames the type), pro's tsc breaks until it's rebuilt against the new pilotiq.

**Mitigation:** turborepo's `dependsOn: ["^build"]` already handles this when both repos are linked. Cross-repo, the developer has to remember to rebuild pilotiq before rebuilding pilotiq-pro after a `CollabHookContext` change. Document in `pilotiq-pro/docs/development.md` (which doesn't exist yet — create as part of Phase 5.7).

### R5 — Vite/Rollup might bundle the stub even when pro is installed

**Risk:** the bundler sees `useContext(CollabHookContext)` and the default value is `stubUseYjsCollab`. It might tree-shake the stub away, or it might bundle both stub and pro code, doubling the size.

**Mitigation:** Vite handles this fine in practice — the stub is a few lines and the pro impl is loaded via the Provider, which is itself imported via the auto-wrap in `+Layout.tsx`. Verify bundle size in Phase 5.8.

### R6 — Phase 5.6 dynamic component loading needs a helper

**Risk:** there's no existing `useDynamicComponent('@pilotiq-pro/collab', 'CollabProvider')` helper. Either we write one or we use a more direct approach.

**Mitigation:** the simplest approach is a top-level `try { const mod = await import('@pilotiq-pro/collab') } catch {}` in `+Layout.tsx`'s `+data.ts` (Vike server-side data loader), passing the result down as a prop. Or: a small `dynamicImport.ts` helper in `@pilotiq/panels/src/lib/`. Decision in Phase 5.6 implementation.

---

## Open Questions

### O1 — Should `CollaborativePlainText` be renamed?

The current name implies collab is mandatory. After Phase 5, collab is conditional. Options:
- Keep the name; document that it shows a read-only fallback without pro.
- Rename to `PlainTextField` (free) and have pro export `CollaborativePlainTextField` as a wrapper.
- Move `CollaborativePlainText` entirely to `@pilotiq-pro/collab` and have free ship a non-collab `PlainTextField`.

**Recommendation:** decide during Phase 5.3 once we see the test fallout. Default: keep the name, document it.

### O2 — Should `@pilotiq-pro/collab` export anything besides `CollabProvider` + `CollabServiceProvider` + `useYjsCollabImpl`?

E.g. presence UI components, cursor avatars, "X is editing" banners. These would justify the package as a real product surface.

**Recommendation:** out of scope for Phase 5. Ship the minimum viable pro package (3 exports) and add UX in a follow-up.

### O3 — Auto-wrap or manual wrap?

Phase 5.6 proposes auto-wrapping the panel tree in `+Layout.tsx` via dynamic import. Alternative: require apps to manually wrap their root in `<CollabProvider>`.

**Recommendation:** auto-wrap. The whole point of the open-core split is that "install pro and it just works" should be the customer experience. Manual wrapping creates a footgun where apps install pro and then can't figure out why collab isn't working.

### O4 — Does pro need its own service provider, or can it just be a Provider component?

If we go with auto-wrap (O3), the Provider is mounted by the layout regardless of whether the service provider runs. So is the service provider needed at all?

**Recommendation:** yes — it owns the `CollabSupportRegistry.enable(['websocket', 'indexeddb'])` call. Without it, `Field.persist(['websocket'])` throws even if pro is installed (because the registry is empty). The Provider component handles the React-side wiring; the service provider handles the framework-side seam.

### O5 — When does free's `PanelServiceProvider` stop seeding `CollabSupportRegistry`?

Phase 5.5 says "remove the seed". But removing it before Phase 5.8 verification means apps without pro break immediately. Should the removal happen at the end of Phase 5, or in a separate "Phase 5 cleanup" commit after the smoke test passes?

**Recommendation:** keep the seed in until Phase 5.8 passes, then remove it as the final step. That way the rollback is just "git revert that commit".

---

## File-level extraction map

| From | To | Action |
|---|---|---|
| `pilotiq/packages/lexical/src/hooks/useYjsCollab.ts` (current 134 LOC) | Split into stub + types | Phase 5.1 + 5.3 |
| `pilotiq/packages/lexical/src/hooks/useYjsCollab.ts` (impl body) | `pilotiq-pro/packages/collab/src/useYjsCollabImpl.ts` | Phase 5.2 |
| `pilotiq/packages/lexical/src/types/y-websocket.d.ts` | `pilotiq-pro/packages/collab/src/types/y-websocket.d.ts` | Phase 5.2, then delete original |
| `pilotiq/packages/lexical/package.json` peer deps `yjs`, `y-websocket`, `y-indexeddb` | (removed) | Phase 5.3 |
| `pilotiq-pro/packages/collab/package.json` deps `yjs`, `y-websocket`, `y-indexeddb`, `react`, `@pilotiq/lexical` | (added) | Phase 5.0 + 5.2 |
| `pilotiq/packages/panels/src/PanelServiceProvider.ts` `CollabSupportRegistry.enable(...)` | (removed; final step after 5.8) | Phase 5.5 |
| `pilotiq-pro/packages/collab/src/CollabProvider.tsx` | (new) | Phase 5.4 |
| `pilotiq-pro/packages/collab/src/CollabServiceProvider.ts` | (new) | Phase 5.4 |
| `pilotiq/packages/panels/pages/(panels)/+Layout.tsx` (dynamic CollabProvider wrap) | (new wiring) | Phase 5.6 |

---

## Verification checklist

Before declaring Phase 5 done:

- [ ] `pnpm build && pnpm test` from `~/Projects/pilotiq` → 4/4 packages, 620 panels + 21 lexical + 28 workspaces tests pass
- [ ] `pnpm build && pnpm test` from `~/Projects/pilotiq-pro` → at least 1 package (`@pilotiq-pro/collab`) builds + has smoke tests
- [ ] `pnpm build` from `~/Projects/rudderjs` → 47/47 packages including playground
- [ ] `grep -rn 'yjs\|y-websocket\|y-indexeddb' ~/Projects/pilotiq/packages/lexical/src/` returns no matches
- [ ] Playground smoke test (Phase 5.8) — local-only and collab modes both verified manually
- [ ] `Field.persist(['websocket'])` in a fresh app without pro throws the helpful error
- [ ] Memory note `project_pilotiq_rebrand.md` updated with "Phase 5 DONE" summary
- [ ] `MEMORY.md` index entry updated

---

## What this plan does NOT change

- `Panel.use(...)`, `Field.persist(...)` public API call signatures
- `LexicalEditor` and `CollaborativePlainText` prop shapes
- The 21 existing lexical tests (any test that requires modification is a sign R1 wasn't fully anticipated)
- Server-side persistence (`@rudderjs/live` adapters) — those stay in rudderjs
- The `CollabSupportRegistry` API from Phase 3 — it's the seam this plan flips, not modifies

---

## Estimated effort

| Phase | Estimated LOC change | Notes |
|---|---|---|
| 5.0 — pro package skeleton | ~100 LOC config | Mirrors pilotiq Phase 1 |
| 5.1 — extract types in free | ~30 LOC | File split, no logic change |
| 5.2 — copy impl to pro | ~140 LOC moved | The current useYjsCollab.ts body |
| 5.3 — replace free with stub | ~30 LOC net (-104 + 30) | Most of the LOC reduction |
| 5.4 — pro Provider + service provider | ~50 LOC | Two small new files |
| 5.5 — remove free's seed | -1 line | After smoke test passes |
| 5.6 — auto-wrap in Layout | ~20 LOC | Dynamic import + conditional wrap |
| 5.7 — docs | ~80 LOC across 3 files | |
| 5.8 — smoke test | 0 LOC | Manual playground verification |

**Total**: ~450 LOC across both repos. Single focused session feasible.

---

## Sequencing relative to Phase 4

This plan assumes Phase 4 (`@pilotiq-pro/ai`) has not yet started. If Phase 4 starts first, two adjustments:
1. The "auto-wrap in `+Layout.tsx`" mechanism (Phase 5.6) becomes a shared helper used by both pro packages.
2. The "Free `PanelServiceProvider` stops seeding registries" step happens once for both (`BuiltInAiActionRegistry` and `CollabSupportRegistry`), not per phase.

Recommended order: **Phase 5 first, then Phase 4** — Phase 5 is smaller, validates the open-core mechanism end-to-end, and Phase 4 inherits the lessons learned (especially around the auto-wrap helper and the cross-repo type resolution).
