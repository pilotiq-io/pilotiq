---
"@pilotiq/pilotiq": patch
---

Generated route stubs now gate on the panel's base path in BOTH passes. The registry check was SSR-only (the registry is empty in the browser), so on the client every pilotiq route function tentatively matched ANY URL with the same segment count — and Vike route functions outrank route strings, so SPA navigation to an app page like `/articles/:slug` silently rendered pilotiq's empty slug page (blank screen; refresh worked). `_components.ts` now exports `panelBasePaths`, `_clusterOffset.ts` derives an `isPanelBase()` helper from it, and every stub (dashboard, slug, resource-*, relation-*, theme) requires the first URL segment to be a registered panel base before matching.
