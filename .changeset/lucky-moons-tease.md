---
'@pilotiq/pilotiq': minor
---

`SelectField.multiple()` + `.relationship(name)` — multi-select fields. `multiple()` flips the value to `string[]` (chips trigger + searchable checkbox dropdown; JSON-array wire shape like TagsInput). `relationship(name)` binds the selection to an M2M relation: edit pages fill from `parent.related(name)`, saves strip the ids from the parent payload and `sync()` the pivot after persist. `required()` now treats `[]` / `'[]'` as empty (also fixes required-on-empty TagsInput).
