---
"@pilotiq/pilotiq": minor
---

feat(layout): pass `currentPath` to layout providers

`Pilotiq.layoutProvider(...)` components now receive a `currentPath` prop alongside `basePath`, re-passed on every SPA navigation. This lets an always-mounted layout provider derive the current resource/record from the URL (via `parseRecordPageUrl`) without depending on the right-sidebar context, which only mounts while the chat panel is open. Additive and backward-compatible — providers that ignore the prop are unaffected.
