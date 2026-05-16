---
'@pilotiq/pilotiq': minor
---

Custom-page collab opt-in. `Page.collab = { room, presence? }` mounts the plugin-registered custom-page wrapper around the page tree on the matching URL. Pair with `@pilotiq-pro/collab`'s plugin to share one Y.Doc + WebSocket across every collab-aware field inside a custom page. Resource-bound default pages (List/Create/Edit/View) keep routing through `Resource.collab` — no change there.

New public API:

- `Page.collab: { room: string; presence?: boolean } | null` (default `null`).
- `Page.getResolvedCollabConfig(): PageCollabConfig | null`.
- `panelInfo().pageCollab: Record<slug, PageCollabConfig>` — keyed by URL slug (cluster-prefixed for clustered pages). Absent when no page opted in.
- `react/`: `CustomPageWrapperGate`, `registerCustomPageWrapper`, `getCustomPageWrapper`, `CustomPageWrapperProps`, `PageCollabMap`. Mounted by `AppShell` alongside `RecordWrapperGate`.
