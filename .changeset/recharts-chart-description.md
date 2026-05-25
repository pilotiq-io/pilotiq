---
"@pilotiq/recharts": patch
---

feat(recharts): `Chart.description()` — muted subtitle under the chart title

Adds a `description` to the chart card header, rendered under the title as a
muted subtitle (shadcn `CardDescription` style). Set fluently
(`Chart.make().description('…')`) or as a `static description` on a `Chart`
subclass; resolves instance-over-static like `label`.
