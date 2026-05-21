---
'@pilotiq/pilotiq': patch
---

perf: bundle of hot-path wins (Phase 5 of the code-quality sweep)

Four independent perf changes that share a release because they're each small and orthogonal. None of these were bottlenecks today; the cost rises around ~50 resources or ~10K imported rows.

- **5a — Chunked `Action.import`.** `runImport` used to walk rows serially: 5–10ms per round-trip × 10K rows × 2 round-trips for upsert mode adds up to ~100s of pinned request time. Each row now processes through a chunked `Promise.all` (default `concurrency: 10`). Per-row order within a chunk is non-deterministic; row indices in `summary.errors` still match the original CSV/JSON position. Tunable via `Action.import({ concurrency })`.

- **5b — Per-user navigation-badge TTL cache.** Every page render used to re-resolve every `R.navigationBadge()` / `G.navigationBadge()` / `C.navigationBadge()`. A panel with 20 resources each calling `Model.count()` for the badge was 20+ extra queries on every nav. Cache lives on the `Pilotiq` instance, keyed by `(ownerName, userIdentity)`, default TTL 30s. Configurable via `Pilotiq.navigationBadgeTtl(ms)` — pass `0` to disable, `null` to restore the default. User identity sniffs `user.id` (the 99% case for app-supplied users), falls back to JSON.stringify; anonymous requests share one slot.

- **5c — Map-indexed slug lookup.** `cfg.resources.find(r => r.getSlug() === slug)` and its siblings were called 16+ times per request across the page-data builders. New `pilotiq.findResource(slug)` / `findGlobal(slug)` / `findPage(slug)` accessors build a lazy `Map<slug, Class>` on first call and invalidate when the matching builder method (`.resources([…])` / `.globals([…])` / `.pages([…])` / `.dashboard(P)` / `.profile(P)`) mutates the array. O(n) → O(1) per lookup; measurable around 100+ resources.

- **5d — Parallel policy gates.** ~32 route handlers paired `await policyAccess(R, user)` with `await checkPolicy(() => R.canViewAny(user))` (or `canCreate` / `canEdit(user, undefined)` / `canView(user, undefined)`) serially. New `policyGate(owner, user, predicate)` helper composes both via `Promise.all`. Record-dependent predicates (e.g. `canEdit(user, record)` where `record` is loaded mid-handler) stay sequential — those calls weren't touched. The helper fail-closes on either branch throwing, matching the prior semantics.

Coverage: new `Pilotiq.perf.test.ts` covers the 5a/5b/5c surfaces (chunking + index preservation, TTL hit/miss + invalidation paths, Map invalidation across all setter sites). 5d is exercised by the existing authorization / routes tests — the contract is unchanged.

No public-surface changes beyond the three new opt-in accessors. Existing routes / callers keep working with their prior shape; the chunking + caching default-on behavior swaps in transparently.
