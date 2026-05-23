---
'@pilotiq/recharts': minor
---

feat(recharts): theme-palette chart colors + minimal chrome

The `--chart-1..5` theme variables now drive chart series by default, so the theme editor's "Chart Color" control affects real charts (previously it only styled the static preview mock in `theme-preview/build-html.ts`). Visual defaults: lines render as soft area-fills, bars are rounded, the `CartesianGrid` is dropped in favor of a hairline X baseline, and the tooltip is themed.
