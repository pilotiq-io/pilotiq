---
'@pilotiq/recharts': patch
---

fix(recharts): hook-order crash in `PieChartView` on empty datasets + widen peer to `^2 || ^3`

`PieChartView` called `useMemo` after an early `return <ChartEmpty />`, violating Rules-of-Hooks. When a chart's dataset became empty across renders (e.g. a filter narrowed to a no-data range), React threw "Rendered fewer hooks than expected". Hoisted the `useMemo` above the early return — slices fall back to `[]` when the dataset is missing.

Also widens the `recharts` peer range from `^2` to `^2 || ^3` so consumers can install recharts v3.x (shipped Sep 2024). No source change required for v3; the component API used here is compatible across both majors.
