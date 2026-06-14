---
"@pilotiq/tiptap": minor
---

Add an in-block text find→replace surgical op — `planReplaceText` plus a `replace_text` case in the inline-diff dispatch.

It swaps the first occurrence of a `search` string with `replace`, preserving the surrounding node structure. This lets a producer (e.g. `@pilotiq-pro/ai`) fix a word, number, or typo **inside** a custom block (alert / prosCons / faq / keyTakeaways) or a table cell without rebuilding the block as HTML — which `replace_block` would force, flattening the block. The op is index-free: the match position resolves at apply time, so it composes safely after the index-based block ops in a batch. Returns `null` when `search` isn't present, so a stale or guessed search string changes nothing rather than corrupting the doc.

New export: `planReplaceText`. Surgical meta op: `{ op: 'replace_text', search, replace }`.
