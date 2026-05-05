---
"@pilotiq/pilotiq": minor
---

Add `Resource.persistFiltersInSession` opt-in flag. When `true`, the GET list handler stashes the active URL query slice (filters / `group` / `search` / `sort` / `perPage` — `page` and `tab` are excluded) on `req.session` under `pilotiq:filters:<basePath>:<slug>`, and 302-redirects bare visits (zero query params) back to the last-applied state. Restoring keeps the URL the source of truth so bookmarks / share-links / back-button stay honest. Duck-typed `req.session.get / put` (mirrors `notifications/flash.ts`) so it no-ops silently when `@rudderjs/session` isn't installed. v1 keys per resource only — all tabs of a resource share one filter slot. Guide: `docs/guide/filter-persistence.md`.
