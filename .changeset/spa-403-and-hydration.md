---
"@pilotiq/pilotiq": patch
---

Three SPA-navigation/auth-UX fixes flushed out by role-gated panels:

- **403/401 over Vike SPA nav no longer crashes the client router.** server-hono rewrites `/x/index.pageContext.json` onto the panel route; when a policy gate (or `Pilotiq.guard()`) short-circuited, the plaintext response failed Vike's Content-Type assert ("Something went wrong"). Pilotiq now detects pageContext fetches (the `x-rudder-original-url` header) and answers with Vike's abort envelope (`abortStatusCode` + `_abortCall`), so the client renders the app's error page with the right status.
- **Direct-load 403s render a minimal styled page** instead of a bare `Forbidden` string.
- **Fixed a guaranteed hydration mismatch on parameterized table URLs** (`?tab=…`, filters, sort): `SearchFormHiddenInputs` reads `window.location`, so SSR rendered no hidden inputs while hydration rendered them. It now renders nothing until after mount.
