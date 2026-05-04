---
"@pilotiq/pilotiq": minor
---

Add explicit `TextColumn` subclass — symmetric with `BadgeColumn / IconColumn / BooleanColumn / ImageColumn`. `TextColumn.make(name)` is the canonical text-cell builder; `Column.make(name)` stays as an alias so existing list pages keep working unchanged. Both produce identical wire shape (default `columnType: 'text'`).
