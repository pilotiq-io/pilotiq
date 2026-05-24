---
'@pilotiq/pilotiq': patch
---

fix(pilotiq): panel-module edits hot-reload in dev without a server restart

The Vite plugin now re-imports the panel module through the dev server's SSR loader whenever a file changes and swaps the fresh instance into `PilotiqRegistry` by name. Because route handlers already re-resolve the panel from that registry via `livePanel()` at request time, edits to `app/Pilotiq/AdminPanel.ts` (and the resource/page schemas it imports — Vite invalidates the panel as their importer) now reflect on the next request.

Previously the rudder provider booted once and never re-ran on dev edits, so the registry held the stale boot-time panel until a manual server restart — `livePanel()` (PRs #70/#71) fixed the render path but had nothing fresh to resolve. This closes that gap on the pilotiq side; the deeper "provider `boot()` should re-run on HMR" fix remains an upstream `@rudderjs/core` follow-up. The change is dev-only (`configureServer`) — no production-build impact.
