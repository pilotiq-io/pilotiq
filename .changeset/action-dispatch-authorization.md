---
"@pilotiq/pilotiq": patch
---

Security + correctness fixes:

- **Authorization bypass (P0):** `dispatchAction` now evaluates the action's own `.authorize() / .visible() / .hidden()` predicate server-side before running the handler, returning a 403 when it denies. Previously these predicates were enforced in the UI only — a crafted POST to `{base}/.../_action/:name` could run a handler the author intended to restrict (the route preludes gate coarsely on resource `canAccess` / record `canEdit`). This closes the M2M `relationAttach` asymmetry too (the attach handler had no server-side `canAttach` re-check, unlike detach / bulk-detach). Fails closed: a throwing predicate denies.
- **DateConstraint Between + `includesTime()` (P1):** the time-enabled "Between" operator advertised a scalar `dateTime` value-kind, so the renderer mounted a single input while `apply()` expected a `[from, to]` pair — the filter parsed `[undefined, undefined]` and silently matched every row. Added a `dateTimeRange` value-kind that renders a from/to `datetime-local` pair and parses as a pair.
- **Peer floor (P2):** raised `@rudderjs/core` / `@rudderjs/router` peer floors from `^1.1.2` to `^1.3.2` — the first router release where `runWithGroup` reliably tags panel routes under Vite SSR bundle duplication (its "current group" slot was hoisted to `globalThis` in 1.3.2). Below that floor, panel routes could resolve untagged — no session/auth middleware, `req.user` null, `persistFiltersInSession` a no-op.
