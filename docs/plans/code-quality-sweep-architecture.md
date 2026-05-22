# Code-quality sweep — architectural

**Status:** OPEN 2026-05-22 — most phases superseded by parallel work shipped today
**Scope:** Pre-1.0 tier from the 2026-05-22 architectural review (all 7 packages, ~138K LOC).
**Source:** `code-quality-sweep-architecture-review.md` (sibling in `docs/plans/`) — 5 parallel sub-agents reading for type-safety, duplication, race conditions, leaky abstractions.

> **Re-baseline note (2026-05-22 evening):** The architectural review snapshot was generated earlier today before several fixes landed. As of this writing: **Phase 1, 3a, 3c, 5b are already shipped**. Genuinely open: Phase 2 (needs analysis — possibly already covered by subAgentResume's own `finally`), Phase 3b, Phase 4, Phase 5a (~5 live casts), Phase 5c (needs cast inventory). The shipped phases are kept below for traceability and to demonstrate the resolution pattern.

Distinct from the closed `code-quality-sweep.md` (security/perf/adapter polish — all shipped today) and the open pilotiq-pro `code-quality-sweep.md` (IDOR / license maxStale / permission drift). No phase here overlaps with either.

Cross-repo items are marked **[pro]** and live in `~/Projects/pilotiq-pro`. Open-source items live here.

---

## Phase 1 — `loadCache()` in-flight guard 🔒 [pro] ✅ SHIPPED 2026-05-22 (commit 89dcdaa)

**Severity:** high — single-tab, double-import race; observable as duplicate cache-module bootstraps under fast-paused turns
**Effort:** ~4 LOC + 1 unit test
**File:** `~/Projects/pilotiq-pro/packages/ai/src/handlers/agentStream/runStore.ts:101-127`
**Outcome:** `loadingPromise` field added, IIFE wrapper around the dynamic import, `finally` clears the promise. `_setTestCache` also clears `loadingPromise` so test seam stays clean. Review citation was stale by ~12h.

### The bug

`runStore.ts` lazy-imports `@rudderjs/cache` and stores the resolved module in `let cacheModule`. Two concurrent client-tool pauses that hit `loadCache()` before the first `import()` resolves will both call `import()`. Promise resolution is fine (same module instance under ESM), but the duplicate work + the lack of an explicit coalescing promise is a latent foot-gun if anyone later adds non-idempotent side effects (e.g. wiring a backend).

### Fix

```ts
let cacheModule: CacheModule | null = null
let loadingPromise: Promise<CacheModule> | null = null

async function loadCache(): Promise<CacheModule> {
  if (cacheModule) return cacheModule
  if (!loadingPromise) {
    loadingPromise = import('@rudderjs/cache').then((m) => {
      cacheModule = m
      return m
    })
  }
  return loadingPromise
}
```

### Test

Add `runStore.test.ts` case: mock dynamic `import('@rudderjs/cache')` to resolve after a microtask; fire 5 concurrent `loadCache()` calls; assert the mock was invoked exactly once.

---

## Phase 2 — SSE handler `finally(close)` [pro] ⏹ NOT NEEDED — false positive (audited 2026-05-22)

**Severity:** N/A
**File:** `~/Projects/pilotiq-pro/packages/ai/src/handlers/chat/chatHandler.ts:72-79`

### Audit findings

1. `handleMultiSubAgentResume` (subAgentResume.ts:248-379) is structured as `try { … } catch (err) { send('error', …) } finally { close() }`. Every internal path — happy + thrown — already fires `close()` via the `finally`.
2. The outer `.catch(err => { send('error', …); close() })` at chatHandler.ts:77-79 catches only the rare case where the inner `catch`'s own `send()` throws.
3. `close()` is **idempotent** — `createSSEStream` (types.ts:158-160) wraps `controller.close()` in `try/catch` that swallows "already closed" errors. So calling it twice in the double-fire scenario is a no-op on the second call.

Adding `.finally(() => close())` to the outer chain would be structurally redundant — it adds a third path with the same effect. The current chain already guarantees `close()` fires on every termination path. The review's invariant ("`close()` must fire on every path") holds; the proposed mechanism is unnecessary.

No code change shipped.

---

## Phase 3 — Log silent fallbacks (3 sites)

**Severity:** medium — current behavior is correct but masks misconfiguration; production hours lost to "why does my M2M act like hasMany"
**Effort:** ~15 min total

Three sites silently choose a fallback path. Each gets a one-shot `console.warn` (memoized per-Resource / per-process to avoid log spam).

| File:line | Today | After |
|---|---|---|
| `packages/pilotiq/src/routes/helpers.ts:679` ✅ SHIPPED | dynamic `@rudderjs/image` import failure caught silently | `console.warn('[pilotiq] image resize fell through; uploading original file:', …)` at helpers.ts:689 |
| `packages/pilotiq/src/routes/relations.ts:67` ✅ SHIPPED 2026-05-22 | missing `R.model` falls back to `'hasMany'` for every relation | once-per-Resource warn at `registerRelationRoutes` entry, deduped via module-level `warnedMissingModelResources: Set<string>` |
| `~/Projects/pilotiq-pro/packages/collab/src/useRecordCollabRoom.ts:147` **[pro]** ✅ SHIPPED | `awareness.setLocalStateField()` raced — swallowed | `console.warn('[@pilotiq-pro/collab] awareness setLocalStateField raced; retry on next tick:', …)` (review's rowArrayBinding.ts:129 pointer was wrong file) |

Idempotent: each callsite memoizes the warn in a module-level `Set<string>`.

### Test

For the relations.ts one, the existing `relations.test.ts` already builds a Resource without a model in one assertion — add `vi.spyOn(console, 'warn')` and assert the warning fires once across two invocations.

---

## Phase 4 — Document `aiSuggestionsMode` 4-tier precedence [pro] ✅ SHIPPED 2026-05-22

**Severity:** medium — DX, no behavior change
**Effort:** ~30 min (doc + 3 cross-references)

**At-audit finding:** the four code sites (`readSuggestionMode` resolver, `Field.aiSuggestionsMode` setter, `PilotiqAgent.aiSuggestionsMode` setter, `activeAgentRun` slot) already had cross-references in their docstrings — the review's "scattered" framing was overstated. The only genuine gap was the user-facing docs site.

**Shipped:**
1. Added "Resolution order" subsection to `~/Projects/pilotiq-pro/docs/packages/ai.md` § "1. Review mode" — 4-tier table with setter examples + a note on when each tier wins.
2. Added a back-pointer from `readSuggestionMode`'s docstring to the new docs section so the canonical pointer chain works in both directions.

The precedence chain is **active agent → field DOM marker → panel window-global → `'auto'`**, evaluated in `AiClientToolBindings.readSuggestionMode()`. Today the rule is split across:

- `~/Projects/pilotiq-pro/packages/ai/src/augmentation/field-ai.ts` (writes the field DOM marker)
- `~/Projects/pilotiq-pro/packages/ai/src/bindings/AiClientToolBindings.ts` (`readSuggestionMode`)
- `~/Projects/pilotiq-pro/packages/ai/src/agents/activeAgentRun.ts` (sets the agent slot)

### Fix

1. Put the canonical doc-comment block at the top of `readSuggestionMode()` (it's the resolver — everyone else writes inputs).
2. Three cross-reference comments at the writer sites: `/** Input to AiClientToolBindings.readSuggestionMode() — see precedence rules there. */`.
3. Add a "Suggestion mode resolution" subsection to `~/Projects/pilotiq-pro/docs/packages/ai-suggestions.md`.
4. Update memory `project_pilotiq_field_ai_suggestions_mode.md` to point at the canonical location.

No code change. Memory note `project_pilotiq_field_ai_suggestions_mode` already captures the rule — this phase just makes the rule discoverable from the code, not just from memory.

---

## Phase 5 — Type consolidation pass

**Severity:** medium — DX + future-proofing; eliminates ~70 mechanical `as any` casts
**Effort:** ~3-4h, mostly mechanical; ship in 3 sub-PRs to keep diffs reviewable

The review counts ~80 unsafe casts repo-wide. Three boundaries account for ~70 of them, and all three have one obvious typed fix.

### 5a. Yjs `doc as any` (open-source) ✅ SHIPPED 2026-05-22

Sites resolved:
- `TiptapEditor.tsx`: typed `collabExtensions` useMemo as `<AnyExtension[]>`; dropped `as any[]` cast in the spread; replaced `initialContent as any` with `as Content` (Tiptap's `Content` type, narrowed at the call site after the `isTiptapShapedContent` gate).
- `MarkdownEditor.tsx`: dropped the redundant `as any[]` cast — the useMemo was already typed `<AnyExtension[]>`.
- `CollabTextRenderer.tsx` + `CollabCodeMirrorEditor.tsx`: the review's pointers were stale — the live casts in those files are `room as unknown as FrameworkCollabRoom`, a deliberate framework-room boundary (not Y.Doc). Left alone.

Net: 4 untyped `as any` / `as any[]` escapes → 1 boundary cast (`as AnyExtension[]` inside useMemo body) + 1 narrow typed cast (`as Content`). `pnpm -F @pilotiq/tiptap test` clean (193/193).

### 5b. MarkdownEditor storage augmentation (7 casts, open-source) ✅ SHIPPED

All `editor.storage as any` callsites in `MarkdownEditor.tsx` + `surgicalOps.ts` now route through `packages/tiptap/src/markdownStorage.ts` (the file's docstring explicitly says "every caller used to repeat `(editor.storage as any).markdown`"). Live `editor.storage as any` callsites: 0.

Module augmentation isn't actually needed because the helper boxes the cast in one place — preferred since `tiptap-markdown` types stay first-party-controlled.

### 5c. Lazy-import helpers (pro) ✅ SHIPPED 2026-05-22

**Re-scoped at investigation:** `handlers/chat/lazyImports.ts` already existed with `loadAi` / `loadSync` / `loadSyncLexical`. Live cast inventory at start of phase: 29 (review's estimate of ~55 was stale). The genuine open work was the 4 inline `@rudderjs/core` + `@rudderjs/ai` sites that hadn't been routed through helpers yet.

Changes shipped:
1. Extended `LoadedAi` interface to include `AiRegistry` so the pilotiq-gateway provider-registration path can route through `loadAi()` instead of its own inline cast.
2. Added typed `CoreApp` interface + `loadCore()` helper with in-flight guard (mirrors `runStore.ts:loadCache`).
3. Added in-flight guards to `loadAi` and `loadSyncLexical` (same pattern as Phase 1's runStore.ts).
4. Replaced 4 inline dynamic-import casts:
   - `handlers/chat/index.ts:64` — `@rudderjs/core` → `loadCore()`
   - `handlers/chat/types.ts:139` — `@rudderjs/core` → `loadCore()`
   - `conversation/PrismaConversationStore.ts:26` — `@rudderjs/core` → `loadCore()`
   - `internal/pilotiq-gateway.ts:359` — `@rudderjs/ai` → `loadAi()` (using new `AiRegistry` field)

Net: 4 inline dynamic-import casts collapse into 2 typed helper calls; in-flight races on the 3 cached loaders (`loadAi`, `loadSyncLexical`, `loadCore`) now coalesced. `pnpm -F @pilotiq-pro/ai test` clean (113/113).

Not done (review's "move helpers to `internal/lazyImports.ts`" suggestion): kept the file at `handlers/chat/lazyImports.ts` to avoid the import-path churn across 20+ consumers. The existing location is acknowledged in the file's own header comment.

---

## PR order

1. **Phase 1** [pro] — `runStore.ts` race guard. Tiny, isolated, no API surface change. Ship today.
2. **Phase 2** [pro] — `chatHandler.ts` finally-close. Tiny.
3. **Phase 3** — silent-fallback logs (mixed: 2 OSS + 1 pro). Two PRs (one per repo).
4. **Phase 4** [pro] — docs/comments only.
5. **Phase 5a/5b** — Yjs typing + MarkdownEditor augmentation (OSS, one PR).
6. **Phase 5c** [pro] — lazy-import helpers; supersedes Phase 1's inline pattern.

After Phase 5c ships, revisit `CODE_QUALITY_REVIEW.md` to confirm the cast count drops from ~80 → ~10 as predicted.

---

## Not in this plan (deferred to v1.0-RC tier)

- Megafile splits (`dispatchForm.ts`, `relations.ts`, `RepeaterInput.tsx`, `BuilderInput.tsx`, `AiChatContext.tsx`) — see `CODE_QUALITY_REVIEW.md` §1.2/2.4/4.2.
- `buildDispatchPrelude` extraction across 4 route sites — §2.3.
- `@pilotiq/test-utils` shared adapter test setup — §3.9.
- `afterStateUpdatedJs` enable-flag for strict-CSP apps — §2.5.

These are deliberate non-goals here; they earn their own plan when scheduled.
