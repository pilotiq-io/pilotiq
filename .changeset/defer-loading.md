---
"@pilotiq/pilotiq": minor
---

Add `Resource.deferLoading` opt-in flag. When `true`, the SSR pass on a list page skips `Table.records()` entirely and paints a skeleton on first frame; the renderer fetches the real rows asynchronously from a new `GET {base}/{slug}/_table` JSON endpoint after mount. URL chrome (current sort / search / page / active filters) still mirrors on the SSR Table so the skeleton frame matches user-visible state. Useful when the resource's records query is slow enough that an initial blocking paint feels broken. Composes with `persistFiltersInSession` (bare-visit redirect happens first, then the redirected URL paints + defers). Guide: `docs/guide/defer-loading.md`.
