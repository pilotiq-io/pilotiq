---
'@pilotiq/pilotiq': patch
---

fix(pilotiq): stamp built-in column/entry formats server-side to fix date hydration mismatch

Table cells (`formatCell`) and infolist entries (`renderEntry`) applied built-in `format` specs (`dateTime / since / money / numeric / limit / words`) at render time on **both** the server and the client. The locale-, timezone-, and clock-dependent kinds (`dateTime`, `since`, and `money`/`numeric` without an explicit locale) produced different output on the Node server (its default locale/tz) than in the browser (the user's), so React reported a hydration mismatch on date cells — e.g. server `Apr 30, 2026, 3:00 AM` vs client `30 באפר׳ 2026, 3:00`.

The built-in format is now computed once, server-side, and stamped into `_formatted` — the same snapshot channel `formatStateUsing` already uses. The renderer prefers `_formatted` and paints it verbatim (no client re-format), so server and client always agree. `dispatchTable` stamps it during the per-row pass (gated to text-type cells; `formatStateUsing` still wins) and `Entry.toMeta` stamps it for text entries. The pure `applyColumnFormat` moved to `src/columnFormat.ts` so the server resolve paths don't import across the `react/` boundary; the old renderer import path is preserved via a re-export. Dates now render deterministically in the server's locale.
