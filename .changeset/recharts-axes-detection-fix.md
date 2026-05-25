---
"@pilotiq/recharts": patch
---

fix(recharts): X-axis ticks + tooltip never rendered (axes were hidden behind a wrapper component)

The shared `XAxis` / `YAxis` / `Tooltip` were returned from a custom `MinimalAxes`
component. Recharts detects axes/tooltip by scanning the chart's **direct** children
by type, so anything behind a component (or Fragment) boundary is silently ignored —
the `<Area>` rendered (it's a direct child) but the X-axis date ticks and the hover
tooltip never did. `minimalAxes()` now returns an **array** of elements spread directly
into the chart (`{minimalAxes()}`), so recharts sees them.

Also: line/area charts use `type="monotone"` (was `natural`, which overshoots below the
baseline on sparse/spiky series and clipped at the bottom), the chart title renders at
`font-semibold text-foreground` (was muted), the X-axis matches the clean shadcn style
(no axis/tick lines, `minTickGap`, `preserveStartEnd`), and the plot has edge margins so
the first/last tick aren't clipped.
