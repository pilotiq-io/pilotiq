---
"@pilotiq/pilotiq": patch
---

docs(boost): add the `pilotiq-widgets`, `pilotiq-theme`, and `pilotiq-vite-plugin` AI skills

Completes the Phase-B boost skill set under `boost/skills/` (consumed by
`rudder boost:install`). Three new on-demand skills, each `SKILL.md` +
deep-dive rule files, gated by `appliesTo: ['@pilotiq/pilotiq']`:

- **pilotiq-widgets** — `StatsOverview` / `Stat` KPI cards, `TableWidget`,
  custom `View` components, and the server-data lifecycle (`serverData` /
  `lazy` / `.poll()`) + panel / page / resource placement.
- **pilotiq-theme** — `.theme()` presets / base / accent / chart palette /
  radius / fonts, raw `cssVariables`, OKLCH brand defaults, and the
  `themeEditor()` plugin (DB-persisted overrides).
- **pilotiq-vite-plugin** — `pilotiq()` plugin wiring, `optimizeDeps.exclude`,
  Tailwind `@source`, generated Vike pages + `_components.ts`, and the
  client-safe-panel / SPA-routing pitfalls.

Guidance only — no runtime/API changes.
