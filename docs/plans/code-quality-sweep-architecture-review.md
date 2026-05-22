# Pilotiq & Pilotiq-Pro — Architectural Code-Quality Review

> **Status (2026-05-22 evening):** Pre-1.0 tier of this review has been triaged + shipped (or marked false-positive). See sibling plan [`code-quality-sweep-architecture.md`](./code-quality-sweep-architecture.md) for per-phase ship status + audit findings. Several "open" findings here were already addressed earlier the same day this review ran — verify against current code before re-actioning anything from the v1.0-RC or v1.1+ tiers below.

**Date:** 2026-05-22
**Scope:** All packages in `pilotiq` and `pilotiq-pro` repos except `@pilotiq-pro/workspaces` (deferred / not yet implemented).
**Method:** Read-only architectural review by 5 parallel sub-agents across 7 packages (~138K LOC, 643 source files). Each agent looked for dead code, duplication, type-safety holes, inconsistencies, leaky abstractions, risky patterns, TODOs, disabled tests, and file-organization smells.

---

## Executive Summary

The codebase is **pre-1.0 but well-structured**. No critical bugs found. The most actionable themes:

1. **~80 unsafe casts** (`as any`, `as unknown as X`) cluster around three boundaries: Yjs/Tiptap types, dynamic peer imports (`@rudderjs/*`), and ORM accessor shapes. Most are justified; a handful warrant proper typed wrappers.
2. **Several files exceed 1000 lines** and would benefit from being split — notably `dispatchForm.ts`, `relations.ts`, `relationPages.ts`, `RepeaterInput.tsx`, `AiChatContext.tsx`.
3. **Route-handler prelude is duplicated 4× in pilotiq** (resource / relation / nested-relation / page dispatch) — clear extraction opportunity.
4. **Two singleton/module-cache races** in `@pilotiq-pro/ai` worth tightening: `loadCache()` and the `activeAgentRun` module slot.
5. **Test setup boilerplate** (jsdom + globals, ~65 lines) is copy-pasted across all 3 adapter packages — candidate for a shared `@pilotiq/test-utils`.
6. **License-client cache staleness window** (24h `maxStaleMs`) is intentional but operationally significant — keep visible.
7. **One known CRDT limitation** in collab (`rowArrayBinding` orphan doc-root shares after PK switch) — accepted for v1, GC plan deferred.

No package has critical security issues, prototype-mutation footguns beyond intentional augmentation, or unbounded resource leaks.

---

## Findings Index

| # | Package | Category | Severity | File |
|---|---|---|---|---|
| 1.1 | pilotiq | Type-safety (justified) | Med | `actions/exportFactory.ts:71` |
| 1.2 | pilotiq | File size | Med | `elements/dispatchForm.ts` (1993 L) |
| 1.3 | pilotiq | Duplication | Med | `RepeaterField.ts` / `BuilderField.ts` shared chrome |
| 1.4 | pilotiq | Duplication | Med | `persistRelationshipRows` vs `persistRelationshipBuilderRows` |
| 2.1 | pilotiq | Type-safety | **High** | `routes/relations.ts:1101,1113-1121` (M2M IDOR casts) |
| 2.2 | pilotiq | Type-safety | **High** | `routes/helpers.ts:679` (dynamic `@rudderjs/image` cast) |
| 2.3 | pilotiq | Duplication | Med | Dispatch prelude across 4 route sites |
| 2.4 | pilotiq | File size | Med | `relations.ts` (1227 L), `relationPages.ts` (1248 L), `RepeaterInput.tsx` (1420 L), `BuilderInput.tsx` (1078 L) |
| 2.5 | pilotiq | Risky pattern | Med | `react/fieldJsHandler.ts:36` (`new Function`, CSP) |
| 2.6 | pilotiq | Silent fallback | Low | `routes/relations.ts:79` (missing-model defaults to `hasMany`) |
| 2.7 | pilotiq | Test coverage gap | Low | `vite.ts` (no manifest unit tests) |
| 3.1 | tiptap | Type-safety | **High** | `MarkdownEditor.tsx` 6× `editor.storage as any` |
| 3.2 | tiptap | Type-safety | **High** | `TiptapEditor.tsx`, `CollabTextRenderer.tsx` — `doc as any` (Yjs) |
| 3.3 | tiptap | File size | Med | `TiptapEditor.tsx` (776 L), `MarkdownEditor.tsx` (619 L) |
| 3.4 | adapters | Duplication | **High** | Identical jsdom test setup in all 3 packages |
| 3.5 | adapters | Duplication | High | Collab-seed pattern duplicated MarkdownEditor↔TiptapEditor |
| 4.1 | ai | Type-safety | **Critical** | ~60 `as any` casts; many are lazy-import scaffolding |
| 4.2 | ai | File size | **High** | `AiChatContext.tsx` (1210 L), `PilotiqAgent.ts` (807 L), `AiChatPanel.tsx` (715 L), `subAgentResume.ts` (654 L) |
| 4.3 | ai | Singleton race | **High** | `runStore.ts:101` `loadCache()` has no in-flight guard |
| 4.4 | ai | Singleton scope | **High** | `activeAgentRun.ts` — single-tab assumption undocumented |
| 4.5 | ai | Streaming cleanup | High | `chatHandler.ts:72-79` — SSE `.catch` doesn't guarantee `close()` in all paths |
| 4.6 | ai | Documentation | High | `aiSuggestionsMode` 4-tier precedence scattered |
| 5.1 | collab | Type-safety | **High** | 6× `as any` in `plugin.ts` / `useRecordCollabRoom.ts` / `formCollabBinding.ts` / `useFieldPresence.ts` |
| 5.2 | collab | CRDT correctness | **High** | `rowArrayBinding.ts:268-280` — PK-switch orphan Y.XmlFragment keys accumulate unbounded |
| 5.3 | collab | CRDT correctness | High | `rowArrayBinding.ts:415-435` — shadow refresh on `row-order` LWW replacement is fragile |
| 5.4 | collab | Resource cleanup | Med | `useRecordCollabRoom.ts:154-157` — `manager.stop()` not awaited |
| 5.5 | collab | Duplication | Med | Random user color/name fallback duplicated in two branches |
| 5.6 | collab | Duplication | Med | `seedRowArraysFromRecord` vs `migrateLegacyArrays` walk identical row shapes |
| 6.1 | license-client | Cache staleness | High | 24h `maxStaleMs` keeps revoked licenses live offline (documented) |
| 6.2 | license-client | Backoff | Med | No jitter on retry backoff beyond ±50ms |
| 6.3 | license-client | Singleton | Med | Process-global `_instance` relies on test discipline (`_resetLicenseClientForTests`) |

---

## Package: `@pilotiq/pilotiq` (105K LOC, 458 files)

The active product. Split below by review half.

### A. Schema / Fields / Forms / Actions

**Strengths**
- No `.skip` / `.todo` / `xit` — test suite is fully active.
- No `TODO` / `FIXME` / `HACK` in production source.
- No dead exports found in spot-check.
- Naming is uniform: `is*` for booleans (`isRequired`, `isLive`, `isHiddenIn`), `get*` otherwise.
- Schema is genuinely framework-agnostic (no React imports in Field; no route imports in Element).

**Findings**

1.1 **`exportFactory.ts:71-72,109-110` — justified `any` to break Action↔Table cycle (Med).**
The `R: { table?(t: any): any }` parameter uses `any` to keep the factory loadable via dynamic import inside the Action handler. Marked with `eslint-disable-next-line`. *Suggested action:* add a one-line module header comment explaining the cycle-breaking strategy so future maintainers don't try to widen the type.

1.2 **`elements/dispatchForm.ts` is 1993 lines (Med).**
Contains form submit lifecycle, type coercion (`coerceFormValues`, 232 L), relationship persistence (`persistRelationshipRows`, 196 L), Builder state update (`applyBuilderStateUpdate`, 103 L), and field-finding walkers in one file. Each section is well-commented but the file is hard to navigate. *Suggested action:* split into `dispatchForm.coerce.ts`, `dispatchForm.persist.ts`, `dispatchForm.state.ts`.

1.3 **`RepeaterField.ts` (939 L) and `BuilderField.ts` (605 L) share significant chrome (Med).**
Both implement nearly identical collapsibility, row-level rules (`itemCanDelete`/`Clone`/`Reorder`/`Hidden`), reorder/clone flags, and the RowButton system. Intentional independence is correct (heterogeneous vs homogeneous rows are fundamentally different), but the shared chrome could move to a `HasArrayLikeRows` mixin if both files keep growing.

1.4 **`persistRelationshipRows` and `persistRelationshipBuilderRows` are parallel implementations (Med).**
Different row-envelope shapes justify two functions, but the row-diff loop and error handling could extract a shared helper.

1.5 **Action visibility is async; Field visibility is conditional-async (Low).**
`Action.evaluate()` awaits all visibility rules in parallel. Field visibility only evaluates when `showWhen`/`hideWhen` are set. Table row-placement defers per-row eval to the renderer. Intentional but high cognitive load — *suggested action:* add a one-liner to each visibility method explaining when it runs.

1.6 **Risky pattern note: `Field.afterStateUpdatedJs` uses `new Function` (Low — see also 2.5).**
Admin-trusted string only (schema-definition time), never request input. Properly sandboxed at the source. Move documentation of CSP `unsafe-eval` requirement to `packages/pilotiq/CLAUDE.md` so it doesn't surprise app authors.

### B. Pages / Routes / Widgets / View / Plugin

**Strengths**
- Clean post-split route module structure (`panel.ts`, `resources.ts`, `globals.ts`, `pages.ts`, `relations.ts`, `theme.ts`).
- Defensive policy gates + IDOR checks throughout.
- `pageData.ts` barrel ensures SSR (`+data.ts`) and SPA navigation call identical builders.
- Vite plugin uses `jiti` with `fsCache:false` / `moduleCache:false` and `writeIfChanged` for idempotent manifest writes.

**Findings**

2.1 **`routes/relations.ts:1101,1113-1121` — fragile M2M accessor narrowing (High).**
The depth-2 nested-relation IDOR code casts `readSide` through `unknown` then uses two fallback paths (method-call + property check) to find the M2M accessor's `detach`/`where`. Memory note `m2m_accessor_shape` describes the underlying ORM quirk, but the silent fallthrough hides the actual reason on failure. *Suggested action:* extract `getM2MAccessor(child, relationName, fallback)` into `orm/modelDefaults.ts`, type-narrow once per request, log the failure reason in dev when both paths miss.

2.2 **`routes/helpers.ts:679` — dynamic `@rudderjs/image` import has loose cast (High).**
`import(/* @vite-ignore */ imageModuleName)` cast as a deeply-nested anonymous interface; failures are caught silently with no log. *Suggested action:* define `interface ImageResizer { image(input: unknown): { resize(w,h): { format(f): { toBuffer(): Promise<Buffer> } } } }` once in `uploads/imageResizer.ts`; log resize failures even when caught.

2.3 **Dispatch-action prelude duplicated across 4 route sites (Med).**
`resources.ts` (list + create + edit), `relations.ts` (depth-1 + depth-2), `pages.ts` (custom pages) all repeat: extract params → `resolveUser(req)` → policy gate → parse body → find action → `dispatchAction(...)` → serialize. Memory note `dispatch_action_route_sites` already flags this. *Suggested action:* extract `buildDispatchPrelude(req, pilotiq, scope, recordLoader?, policy?)` returning `DispatchContext | AppResponse`. Reduces route-handler surface ~30%.

2.4 **Large monolithic files (Med).**
- `routes/relations.ts` — 1227 L (depth-1 and depth-2 in one file)
- `pageData/relationPages.ts` — 1248 L (4+ sub-builders)
- `react/fields/RepeaterInput.tsx` — 1420 L (uncontrolled-input + drag + collapse state)
- `react/fields/BuilderInput.tsx` — 1078 L
- `routes/helpers.ts` — 700 L (20+ helpers, mixed concerns)

*Suggested splits:* `relations-depth1.ts` / `relations-depth2.ts`; extract `RepeaterInput`'s drag controller and collapse state into sibling files; move image-resize helper out of `helpers.ts` into `helpers-image.ts`.

2.5 **`react/fieldJsHandler.ts:36` — `new Function` for `afterStateUpdatedJs` (Med).**
Compiles user-authored body via function constructor. Requires CSP `unsafe-eval`. Compile failures are cached; runtime failures are silently logged. *Suggested action:* expose `Pilotiq.enableAfterStateUpdatedJs(false)` for strict-CSP apps; surface compile + runtime errors via a hook so app-level error trackers see them.

2.6 **`relations.ts:79` — silent fallback to `'hasMany'` when `R.model` missing (Low).**
A misconfigured Resource (declares relations but no model) silently treats every relation as `hasMany`, which is wrong for M2M. *Suggested action:* `console.warn` once per offending Resource.

2.7 **`vite.ts` has no unit tests (Low).**
Manifest generation is tested only implicitly via the playground. *Suggested action:* snapshot tests for empty-panel, multi-panel-merge, and cluster-slug-index cases.

2.8 **Production-code `as any` clusters (Med).**
- `react/schemaRenderer/form/FormRenderer.tsx:193` — `new (FormData as any)`
- `react/schemaRenderer/table/filters.tsx:960` — `existing as unknown[]`
- `react/useCollabSeed.ts:20,25` — `room.ydoc as any` (×2)
- `notifications/databaseNotifications.test.ts` — 7× `(panel as any)` (test-only)

*Suggested action:* typed helper for FormData construction; capture Y.Doc type at the top of `useCollabSeed.ts` instead of per-use casts.

---

## Package: `@pilotiq/tiptap` (47 files, ~11K LOC)

**Strengths**
- No disabled tests, no TODOs in source.
- `dangerouslySetInnerHTML` / `.innerHTML` uses are all DOM-parsing for ProseMirror; sanitized post-parse.

**Findings**

3.1 **`MarkdownEditor.tsx` 6× `editor.storage as any` (High).**
- L250, 280, 299, 340, 345, 358, 367 — accessing `tiptap-markdown`'s untyped storage.
- Surgical-ops sibling: `surgicalOps.ts:58` — same pattern.

*Suggested action:* declare a `MarkdownEditorStorage` interface and merge it once via module augmentation:
```ts
declare module '@tiptap/core' {
  interface Storage { markdown: { getMarkdown(): string; ... } }
}
```

3.2 **Yjs `doc as any` (High).**
- `TiptapEditor.tsx:357,490,504` — `collabExtensions as any[]`, `doc as any`, `initialContent as any`
- `MarkdownEditor.tsx:243` — `collabExtensions as any[]`
- `CollabTextRenderer.tsx:199` — `doc as any`

*Suggested action:* `import type * as Y from 'yjs'` at file top, type doc as `Y.Doc`; for collab extensions, define `type AnyCollabExtension = Extension<any, any>` once.

3.3 **File-size (Med).**
- `react/TiptapEditor.tsx` — 776 L. Editor init + collab seeding + inline-diff + chrome.
- `react/render.test.ts` — 745 L (test file, acceptable but reusable fixtures could move out).
- `react/MarkdownEditor.tsx` — 619 L.

*Suggested action:* extract `useTiptapEditorConfig()` hook + collab-seed hook into sibling files.

3.4 **Console.warn for MentionProvider misconfig (Low).**
`MentionProvider.ts:92,111`. Useful for debugging; fine.

---

## Package: `@pilotiq/codemirror` (15 files, 1381 LOC)

**Strengths** — clean, small, no production-code casts of note.

**Findings**

3.5 **`CollabCodeMirrorEditor.tsx:208` — `doc as any` (High).** Same Yjs issue as tiptap; same fix.

3.6 **`CollabCodeMirrorEditor.tsx` is 336 L (Med).** Subscription setup could extract into a custom hook.

3.7 **Test setup** — see cross-adapter duplication finding below.

---

## Package: `@pilotiq/recharts` (12 files, 1230 LOC)

**Strengths** — smallest, cleanest, no leaky internal imports.

**Findings**

3.8 **`ChartRenderer.tsx:69` — `meta as unknown as WidgetMetaLike` (Med).** Chart data type is loose; tighten earlier in the pipeline.

---

## Cross-Adapter Findings

3.9 **Identical jsdom test setup duplicated 3× (High).**
`{tiptap,codemirror,recharts}/src/test/setup.ts` are 65-line near-identical jsdom-globals boilerplate. *Suggested action:* extract `@pilotiq/test-utils` private package (or just a shared file consumed via path).

3.10 **Collab-seed pattern duplicated MarkdownEditor↔TiptapEditor (High).**
The `fragment.length === 0` check + `setContent(...)` call appears in both. `useCollabSeed` exists in pilotiq but the surrounding glue is duplicated. *Suggested action:* widen `useCollabSeed` to cover the post-seed `setContent` step too.

3.11 **Plugin-config inconsistency (Med).**
- `codeEditor({ languages })` accepts options.
- `tiptap()` and `recharts()` don't.

Either give all three a config object (uniform) or document why codemirror is special.

3.12 **Peer ranges are consistent ✓.** All three use `">=0.6.0 <1.0.0"` for `@pilotiq/pilotiq` peer.

---

## Package: `@pilotiq-pro/ai` (86 files, ~15K LOC)

**Strengths**
- Provider-agnostic — uses `@rudderjs/ai` framework abstractions, not Anthropic/OpenAI SDK shapes directly.
- AbortController correctly threaded through `useAgentRun`, gateway calls, and `AiChatContext` (prior turn aborted before new one starts).
- 15 active test files; no `.skip`/`.todo`/`xit`.
- One TODO total (`AiDropdown.tsx`, i18n).

**Findings**

4.1 **~60 `as any` casts cluster around dynamic peer imports (Critical → consolidate).**
- `PilotiqAgent.ts:17-18` — `import(/* @vite-ignore */ '@rudderjs/ai') as any`, same for `@rudderjs/sync`.
- `runStore.ts:106` — same for `@rudderjs/cache`.
- `augmentation/field-ai.ts:104-158` — `proto as any`, `ctx?: any`, `this: any` for prototype patching.
- `plugin.ts:352,358,391` — casting resource/router to `any`.

*Suggested action:* create `internal/lazyImports.ts` that types each peer once:
```ts
type AiModule = typeof import('@rudderjs/ai')
let _ai: AiModule | null = null
export async function loadAi(): Promise<AiModule> { ... }
```
Reuse across the codebase. Reduces 50+ casts to ~5.

4.2 **Large files (High).**
- `components/agents/AiChatContext.tsx` — 1210 L. Provider combines SSE reader, form submission, approval, sub-agent coordination, balance tracking. *Suggested action:* extract `useChatBalance()`, `useSseReader()`, `useTurnSubmission()` hooks.
- `agents/PilotiqAgent.ts` — 807 L. Builder + lazy imports + tools + sync.
- `components/agents/AiChatPanel.tsx` — 715 L.
- `handlers/chat/subAgentResume.ts` — 654 L.

4.3 **`runStore.ts:101` — `loadCache()` has no in-flight guard (High).**
Module-level `let cacheModule` caches a dynamic `@rudderjs/cache` import, but two simultaneous client-tool pauses before the first import resolves can trigger two import calls. *Suggested action:*
```ts
let cacheModule: CacheModule | null = null
let loadingPromise: Promise<CacheModule> | null = null
async function loadCache() {
  if (cacheModule) return cacheModule
  if (!loadingPromise) loadingPromise = import('@rudderjs/cache').then(m => { cacheModule = m; return m })
  return loadingPromise
}
```

4.4 **`activeAgentRun.ts` — module-level `let active` undocumented (High).**
Tracks the currently-dispatching agent; assumes single user / single tab. Breaks in multi-tab or SSR scenarios. *Suggested action:* add header comment documenting the single-tab assumption; consider scoping to a per-tab WeakRef if multi-tab becomes a requirement.

4.5 **`chatHandler.ts:72-79` — SSE cleanup not guaranteed in all paths (High).**
`void handleMultiSubAgentResume(...).catch(...)` — the catch sends an error event and closes, but no `.finally(close)` guards against handlers that throw before reaching the catch. *Suggested action:* `.catch(emitError).finally(() => close())`.

4.6 **`aiSuggestionsMode` 4-tier precedence scattered (High).**
Documented across `field-ai.ts`, `AiClientToolBindings.readSuggestionMode()`, and `activeAgentRun.ts`. Order is: active agent → field DOM marker → panel window-global → `'auto'`. *Suggested action:* put the canonical comment at the top of `readSuggestionMode()` and link to it from the others.

4.7 **`AiUiRegistry.ts:29,31` — `useAgentRun?, useAiChat?` typed as `(...args:any[])=>any` (High).** Use proper signatures or generics.

4.8 **Prototype patching in `field-ai.ts` (Med — by design).**
`Field.prototype.buildMeta` is wrapped at runtime, sealed with `__aiAugmented` (idempotent). Acceptable for a plugin but ensure ordering: if another plugin patches `buildMeta` later, the AI wrap runs first. *Suggested action:* one-time comment in `field-ai.ts` about patch ordering.

---

## Package: `@pilotiq-pro/collab` (20 files, 3716 LOC)

**Strengths**
- No disabled tests, no TODOs.
- Server bootstrap (`seedDocFromRecord`, `seedRowArraysFromRecord`) correctly uses `getXmlFragment` not `Y.Text` (memory note honored).
- `subscribeRows` correctly replays initial state for late subscribers.

**Findings**

5.1 **Six `as any` casts around Yjs/Tiptap/awareness (High).**
- `plugin.ts:103,106,110` — Tiptap collab extension config.
- `useRecordCollabRoom.ts:126,165` — provider awareness.
- `formCollabBinding.ts:107` — `room.ydoc as any as Y.Doc` (double cast to bypass pilotiq's opaque `CollabRoom`).
- `useFieldPresence.ts:40,49` — provider.awareness.
- `fieldFocusReporter.ts:14-17` — module-level `_activeProvider: any | null`.
- `server.ts:46,234,238` — `PilotiqPanel` aliased to `any`; `model.find` duck-typed.

*Suggested action:* most are unavoidable upstream-type gaps; consolidate by importing `Y.Doc` and `Awareness` types at file tops and centralizing the panel-shape duck type in one place.

5.2 **`rowArrayBinding.ts:268-280` — PK-switch orphan accumulation (High, known).**
`renameRow` clones Y.XmlFragments into fresh keys; old UUID keys remain as inert orphans. Long-lived sessions accumulate unbounded orphans in the persisted Y.Doc. Memory note `project_pilotiq_pk_switch_phase_a` accepts this for v1. *Suggested action:* track a deferred GC plan in the topic memory; consider a server-side compaction on idle.

5.3 **`rowArrayBinding.ts:415-435` — shadow refresh fragile on LWW row-order replacement (High).**
If the order Y.Array is replaced via LWW on a peer before the observer attaches, the shadow may reference a stale orphaned array. `observeDeep` on `orderRoot` mitigates this but ordering semantics are implicit. *Suggested action:* document the invariant at the top of the binding.

5.4 **`useRecordCollabRoom.ts:154-157` — `manager.stop()` not awaited (Med).**
Cleanup function returns sync; in-flight persistence writes may be orphaned if the component unmounts fast. *Suggested action:* either await internally or fire-and-forget but ensure the manager queues persistence durably.

5.5 **`useRecordCollabRoom.ts:128-131 & 170-171` — duplicate random-user fallback (Med).**
Identical `User-${Math.floor(Math.random()*1000)}` and `hsl(...)` patterns in two branches. *Suggested action:* extract `defaultPresenceFallback()` helper.

5.6 **`server.ts:337-349 & rowArrayBinding.ts:524-539` — duplicate row-shape walkers (Med).**
`seedRowArraysFromRecord` and `migrateLegacyArrays` walk rows identically. Deliberately duplicated to avoid React-typed imports server-side, but drift is possible. *Suggested action:* extract a `iterateRowShapes()` helper that's React-free.

5.7 **`rowArrayBinding.ts` is 551 L (Med).** Below the 600 threshold but combines row contract + lifecycle + observers + legacy migration. *Suggested action:* extract `rowArrayBinding.migration.ts`.

5.8 **`rowArrayBinding.ts:129-133` — silent catch on `awareness.setLocalStateField()` (Med).**
Comment says "awareness not initialized yet — first re-render's effect will retry." Silent failure could mask real errors. *Suggested action:* log in dev mode at least.

5.9 **Key-separator inconsistency (Med).**
`roomKey.ts` uses `:` (`panel:resource:record`); `formCollabBinding.ts` / `rowArrayBinding.ts` use `.` (`${arrayName}.${rowId}.${fieldName}`). Different doc regions so no collision risk, but visually confusing.

5.10 **`useCollabDoc` deprecated wrapper (Low).** Correctly retained for one minor cycle with `@deprecated` + first-call warn. Remove on next minor bump.

---

## Package: `@pilotiq-pro/license-client` (5 files, 765 LOC)

**Strengths**
- Zero runtime dependencies (Node/browser builtins only).
- Token never logged; secrets handled cleanly.
- Comprehensive tests covering no-token, caching, coalescing, feature flags, staleness, retries, debit idempotency, timeout.
- Idempotency key auto-generated on debits.
- `[@pilotiq-pro/license-client]` prefix on all logs.

**Findings**

6.1 **24h `maxStaleMs` keeps revoked licenses live offline (High — intentional).**
On network failure, cached snapshot is used until `maxStaleMs` elapses. A revoked license keeps access open up to 24h. Documented intentionally for offline resilience. *Operational action:* monitor license-related outages; consider exposing the staleness window as an op-configurable env var (`PILOTIQ_LICENSE_MAX_STALE_MS`).

6.2 **`client.ts:289` — backoff has no jitter beyond ±50ms (Med).**
Formula `100 * Math.pow(2.5, attempt-1)` yields 100/250/625 ms. Thundering-herd risk if many instances retry simultaneously. *Suggested action:* widen jitter to ±25% of base.

6.3 **`client.ts:179-190` — client-side `expiresAt` gate is clock-skew sensitive (Med).**
If server stamps a future `expiresAt`, a stale cache can return "active" past server denial. Server is authoritative; assume NTP. Document the assumption.

6.4 **Process-global `_instance` singleton (Med).**
`_resetLicenseClientForTests()` is exported. Tests must remember to reset; bleed risk. *Suggested action:* guard with `process.env.NODE_ENV === 'test'` check, or document test-reset discipline in package CLAUDE.md.

6.5 **Silent JSON parse failure (Low).**
`client.ts:310` — non-JSON response body becomes `null`; caller treats as `'bad-request'`. Reasonable but distinguishing "server returned non-JSON" from "server returned `{}`" would improve diagnostics.

---

## Recommendations (Priority Order)

### Pre-1.0 (this cycle)
1. **Type consolidation pass** — create typed lazy-import helpers in `@pilotiq-pro/ai` and `@pilotiq/tiptap`; declare `MarkdownEditorStorage` and import `Y.Doc` types. Eliminates ~70 `as any` casts mechanically.
2. **`loadCache()` race guard** in `@pilotiq-pro/ai/runStore.ts` (4 lines).
3. **SSE finally-close** in `chatHandler.ts`.
4. **Log silent fallbacks** — image-resize, missing-model `hasMany` default, awareness-not-ready in collab.
5. **Document `aiSuggestionsMode` 4-tier precedence** in one canonical location.

### v1.0 RC
6. **Extract `buildDispatchPrelude`** — collapses 4 route sites into one helper.
7. **Split the megafiles**: `relations.ts`, `relationPages.ts`, `RepeaterInput.tsx`, `BuilderInput.tsx`, `dispatchForm.ts`, `AiChatContext.tsx`. None requires behavior change.
8. **Shared adapter test setup** — `@pilotiq/test-utils` for the 65-line jsdom boilerplate.
9. **`afterStateUpdatedJs` config flag** — `Pilotiq.enableAfterStateUpdatedJs(false)` for strict-CSP apps.

### v1.1+
10. **`PageData` union type** — replace `Record<string, unknown>` returns in `pageData/*.ts` with discriminated unions.
11. **`getM2MAccessor()` helper** in `orm/modelDefaults.ts` — consolidates the fragile depth-2 IDOR narrowing.
12. **Collab orphan-doc GC plan** — server-side compaction for PK-switch UUID accumulation.
13. **License-client staleness window as env var** — `PILOTIQ_LICENSE_MAX_STALE_MS`.

---

## Things Worth Highlighting (Positive)

- **Memory-driven discipline shows.** Patterns codified in the user's memory (peer-range literal, `dispatchAction` parallel sites, CRDT seed rules, m2m accessor shape, validate-before-coerce) are honored in the actual code. The memory system is doing real work here.
- **No critical security issues.** No request-input → `eval`/`new Function`. The one `new Function` site (`afterStateUpdatedJs`) is schema-author-trusted.
- **No dead code, no commented-out blocks, no FIXMEs** in production source across all 7 packages. Cleanliness is exceptional for a pre-1.0 monorepo of this size.
- **Test coverage is active end-to-end.** 0 disabled tests across all packages.
- **Plugin isolation is good.** Each adapter peer-depends on pilotiq via the proper literal range and exposes its surface via `./register` subpath. The AI package is provider-agnostic.
