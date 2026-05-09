---
'@pilotiq/pilotiq': minor
---

feat(repeater): afterCreate / afterUpdate / afterDelete hooks for relationship-mode

`Repeater.relationship(...)` gains three per-row lifecycle hooks that
fire from `persistRelationshipRows` after each child operation:

```ts
RepeaterField.make('attachments')
  .relationship('attachments')
  .schema([TextField.make('filename')])
  .afterCreate(async (record, ctx) => { /* ... */ })
  .afterUpdate(async (record, ctx) => { /* ... */ })
  .afterDelete(async (removed, ctx) => {
    if (ctx.mode === 'hasMany' || ctx.mode === 'morphMany') {
      // child record was physically deleted
    }
    // For M2M only the pivot row was detached; the child may still exist.
  })
```

The handler receives the persisted child record and a `RepeaterRowContext`
carrying:

- `parent` — post-save parent record.
- `parentId` — `parent[primaryKey]`.
- `field` — the Repeater field's `name`.
- `index` — 0-based row index in the submitted set; `-1` for `afterDelete`.
- `mode` — the resolved `RepeaterRelationMode` (`'hasMany' | 'morphMany'
  | 'belongsToMany' | 'morphToMany' | 'morphedByMany'`).

Each setter is config-time guarded: calling on a Repeater that hasn't
declared `relationship(...)` throws with a clear message (mirrors the
existing `orderColumn() / pivotColumns()` guards). Throwing handlers
propagate and stop the rest of the persist diff — earlier rows have
already saved (v1 isn't transactional).
