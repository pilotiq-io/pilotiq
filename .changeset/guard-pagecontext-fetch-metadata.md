---
"@pilotiq/pilotiq": patch
---

fix(guard): detect Vike SPA pageContext requests under `@rudderjs/server-hono` >=1.9

server-hono 1.9 removed the forgeable `x-rudder-original-url` request header and strips the `/index.pageContext.json` suffix from `req.url` before the app sees it, carrying the original URL on a private per-request AsyncLocalStorage instead. `Pilotiq.guard()` relied on exactly those two now-gone signals to recognize Vike's client-router pageContext fetch, so on an unauthenticated SPA navigation it fell through to a plain `302` redirect — which Vike's `fetch()` followed into the HTML login page, crashing the client router with a `Wrong Content-Type ... it should be application/json but it's text/html` assertion (a hard 500 on the first guarded link click).

`isPageContextRequest()` now falls back to browser fetch-metadata: a non-navigation same-origin fetch (`Sec-Fetch-Mode` !== `navigate`) that isn't an explicit JSON-API caller is treated as a Vike pageContext request, so the guard returns the Vike redirect envelope and the SPA navigates smoothly to the login page. `Sec-Fetch-*` headers are browser-set and can't be spoofed the way the old URL header could. Legacy detection (header + URL suffix) is kept for server-hono <1.9.
