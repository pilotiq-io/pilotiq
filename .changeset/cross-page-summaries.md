---
"@pilotiq/pilotiq": minor
---

`Column.summarize([…])` now aggregates over the **full filtered set** instead of just the rendered page. A `Sum`/`Average`/`Count`/`Range` in the table footer of a model-backed resource reflects every matching row (respecting the active search / filters / tab / group-drill), not the 15 rows currently on screen — closing a footgun where a "Total" silently totalled page 1.

```ts
Column.make('amount').summarize([Sum.make().label('Total')])
// footer "Total" = SUM(amount) over the whole filtered query, not the page
```

Mechanism: the model-backed records handler runs a second aggregate query (`SUM`/`AVG`/`MIN`/`MAX`, reusing the paginator's `total` for `COUNT`) and stamps the results on the new optional `TableRecordsResult.summaries`. The dispatcher prefers those per column and **falls back to per-page** for any column the handler can't aggregate (virtual / `formatStateUsing` / relationship columns) and for custom `records()` handlers that don't stamp summaries — so existing behaviour degrades gracefully rather than breaking.

No API change for the common case — `.summarize()` just becomes correct. Two new abstract methods (`aggregates()` / `resultFromScalars()`) are added to the `Summarizer` base for custom summarizer subclasses; the four built-ins implement them. Optional scalar terminals (`sum`/`avg`/`min`/`max`) were added to the structural `ModelQuery` shape (the rudder QueryBuilder ships them; test stubs need not).

v1 covers the global `<tfoot>` summary; per-group (banded) summary rows stay per-page.
