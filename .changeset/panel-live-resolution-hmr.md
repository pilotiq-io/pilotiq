---
'@pilotiq/pilotiq': patch
---

fix(pilotiq): panel routes resolve the live panel at request time — dev edits reflect without a server restart

Panel route handlers closed over the `Pilotiq` instance captured when their routes were registered. In dev, editing the panel module (or a resource/page schema it imports) re-registers a fresh panel in `PilotiqRegistry`, but those already-registered handler closures kept pointing at the stale instance — so SSR-rendered chrome and schema lagged a reload behind (the panel only updated after editing some *other* watched file, or a restart).

The render-data layer now re-resolves the panel from `PilotiqRegistry` by name at request time, via a new `livePanel()` helper, applied at the top of `panelInfo` (chrome) and every render-data builder (`resourcePages`, `misc`, `relationPages`). This mirrors what `dispatchPageData()` already did for the client-nav path; the SSR route path was the only outlier. `livePanel()` falls back to the passed instance when the registry has no entry (tests, teardown), so non-dev behavior is unchanged.
