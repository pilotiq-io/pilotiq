---
"@pilotiq/pilotiq": minor
---

`Pilotiq.guard(fn, { redirectTo: '/login' })` — failed guards can now redirect browser requests to a login page instead of returning a bare 401. Direct loads 302; SPA navigations get Vike's redirect envelope (`_urlRedirect`); both carry the originally-requested URL as `?redirect=<path>` for post-login bounce-back (skipped when `redirectTo` already has a query string). Non-navigation JSON fetches still 401 with the target under `redirect` in the body. Default behavior without the option is unchanged.
