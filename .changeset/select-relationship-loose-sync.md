---
"@pilotiq/pilotiq": patch
---

Fix `SelectField.multiple().relationship()` saves tripping the pivot's UNIQUE constraint on numeric-PK models: form values are strings while the pivot stores numbers, and the ORM accessor's `sync()` compares strictly (`"3" !== 3`), re-attaching already-attached rows. The save-side sync now diffs the submitted ids against the currently-attached rows itself with String() comparison — detaching with the raw loaded PKs and coercing numeric-string attach ids to numbers — and only falls back to `accessor.sync(ids)` when the current rows can't be read (no `parentModel` on the FormContext). `pickChildPrimaryKey` moved to `orm/modelDefaults.ts` (still re-exported from `pageData.js`).
