---
"@pilotiq/media": minor
---

Media: panel-scoped library registry — two panels with the same library name no longer clobber each other (#244)

The library registry is now keyed by both panel path and library name. Two panels can register a `'default'` library (or any named library) with different `metaFields`, `conversions`, `disk`, or `acceptedMimes` without the last registration silently winning.

**Upgrade notes:** `registerLibrary`, `getLibrary`, `getDefaultLibrary`, and `getLibraryNames` all accept an optional leading `panelPath` argument (e.g. `'/admin'`). The old single-argument forms remain valid and fall back to an unscoped registry bucket — backward-compatible for code that doesn't have panel context (e.g. `mediaUpload()`). `mediaUpload()` now also accepts `panelPath?: string` in its config to opt into scoped lookup when panels have different storage configs.
