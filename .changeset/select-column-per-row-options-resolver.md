---
'@pilotiq/pilotiq': minor
---

feat(columns): SelectColumn.options(record => …) per-row resolver

`SelectColumn.options()` now accepts a function form alongside the
existing static `{ key: label }` / `[{ value, label }]` shapes. The
resolver receives the raw record and may return a Promise; runs once
per visible row in `loadTableRecords` (gated behind the existing
`canEdit` hook so hidden cells skip the resolver cost).

```ts
SelectColumn.make('assigneeId')
  .options(async (row) => {
    const team = await Team.find(row.teamId)
    return team.members.map(m => ({ value: String(m.id), label: m.name }))
  })
```

The resolved per-row option list is stamped on `row._cellSelectOptions[col.name]`;
the renderer's `<CellSelect>` reads it as `props.rowOptions` and falls
back to the column's static `selectOptions` when unset. Resolvers run
in parallel across columns within a row. A throwing resolver leaves
the slot unset on that row only — others still stamp, and the cell
falls back to the static fallback list so one bad row doesn't break
the whole table.
