---
"@pilotiq/pilotiq": minor
---

Add `Table.queryStringIdentifier(id)` for namespacing a table's URL state. With an identifier set, reserved keys (search / sort / page / perPage / group) and filter names are read and written as `${id}_<key>` (e.g. `?orders_search=pizza&orders_sort=date:desc`) so multiple tables on the same page don't fight over `?search=`. Off by default — resource list pages have one `Table` per page and keep using bare keys. Composes cleanly with `Resource.deferLoading` (the deferred-fetch endpoint re-runs `loadTableRecords` which reads each table's own prefix) and with `Resource.persistFiltersInSession` (the writer drops both `page` and `<prefix>_page` from the persisted slice). Guide: `docs/guide/query-string-identifier.md`.
