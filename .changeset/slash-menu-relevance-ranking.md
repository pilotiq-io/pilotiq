---
'@pilotiq/tiptap': patch
---

Slash menu now ranks results by relevance instead of definition order.

A query that matches an entry's **label** (exactly, by prefix, or by word) now
ranks above an entry that only mentions the word in its `searchKey`. Previously
the menu was a plain substring filter that preserved definition order, so typing
`/summary` surfaced **Collapsible block** first — its `searchKey` lists
"summary" and it's defined before the Summary block — and pressing Enter
inserted the wrong block. The matched set is unchanged (every entry that matched
before still matches); only the ordering improves. Ties keep their original menu
order.
