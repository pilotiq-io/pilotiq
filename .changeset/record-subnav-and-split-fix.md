---
"@pilotiq/pilotiq": patch
---

- New `Resource.recordSubNavigation = false` opt-out drops the per-record sub-nav strip (View / Edit / sub-pages / relation managers) from all record-mode pages of a resource; routes stay registered.
- Fix `Split` never going side-by-side at the top level: the `@container` declaration now lives on a wrapper div so the inner `@3xl:flex-row` resolves against it (container queries match against the nearest *ancestor* container — co-locating both on one element left the layout permanently stacked with a 320px aside).
