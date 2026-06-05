---
"@pilotiq/pilotiq": minor
---

Register panel routes inside the `'web'` route group so the framework's group middleware (Session / Auth) runs in front of every panel request. Without this, apps using `@rudderjs/auth` never saw `req.user` on panel routes — `.user()` resolved null and `.guard()` 401'd logged-in browsers — and `persistFiltersInSession` silently no-oped (no `req.session`). Falls back to ungrouped registration on `@rudderjs/router` versions without `runWithGroup`.
