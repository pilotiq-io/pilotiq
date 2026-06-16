---
"@pilotiq/pilotiq": patch
---

guard: prefer the non-forgeable `req.spaNavUrl` / `req.isPageContextRequest` accessor for SPA-nav detection

`isPageContextRequest()` now prefers the precise, ALS-backed accessor exposed by `@rudderjs/server-hono` >=1.10 (rudderjs/rudder #1205) to decide whether a request is Vike's client-router pageContext fetch, and `guardRedirectTarget()` derives the bounce-back path from `req.spaNavUrl`. The legacy `x-rudder-original-url` header / URL-suffix checks and the `Sec-Fetch-Mode` fetch-metadata heuristic remain only as fallbacks for adapters/versions without the accessor. Closes #196.
