---
"@pilotiq/recharts": patch
---

feat(recharts): responsive chart filter — segmented toggle on desktop, select on mobile

The chart's time-range filter now renders as a segmented toggle (shadcn `ToggleGroup`
`outline` style — a bordered track with the active window highlighted) at `md` and up,
and falls back to the existing compact `<select>` below `md` where the toggle would be
too wide. Both drive the same `onChange`/refetch.

Consumer note: the adapter ships Tailwind class names (no precompiled CSS), so your
Tailwind content/`@source` config must include `@pilotiq/recharts` (e.g. the package's
`dist`) for the chart's utility classes — including the responsive `md:` variants — to
be generated.
