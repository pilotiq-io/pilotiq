---
'@pilotiq/pilotiq': patch
---

fix(security): enforce `Pilotiq.guard()` on every panel route via `router.group()`

`Pilotiq.guard()` is documented as the 401 layer, but until now the guard callback was only consulted on the `_uploads` route. Every other panel route — list / view / create / edit / delete / `_action` / `_widget` / `_form` / `_table` / `_search`, relation managers, custom pages, theme editor — relied on `cfg.user` returning null + each Resource's `canX(user, …)` defaulting to true.

An app that wired `Pilotiq.guard(req => Auth.check())` but shipped any Resource without `canAccess` overrides could expose an unauthenticated, fully-readable admin panel. The intent was documented; the wiring was not there.

Fix: wrap every core panel route registration in one `router.group({ middleware: [guardMiddleware] }, …)` call. The guard now runs in front of every handler. Removed the redundant inline guard inside `handleUploadRequest` — the group middleware fires first and the inline check would just double-fire. Plugin routes registered via `plugin.registerRoutes?.(router, pilotiq)` mount OUTSIDE the group; plugins own their own auth posture (public webhooks etc) and should consult `cfg.guard` themselves at handler entry if they want the panel guard.

Regression coverage: new `src/routes/guard.test.ts` iterates `router.list()` across a panel touching every register branch (resources + relation managers + globals + custom pages + clusters + theme editor + database notifications) and asserts each route 401s on `guard(() => false)` and reaches its handler on `guard(() => true)`.
