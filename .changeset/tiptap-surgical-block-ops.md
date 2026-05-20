---
'@pilotiq/tiptap': minor
---

feat(tiptap): surgical block-level inline-diff ops for AI agents

Adds 4 precise block-edit primitives the AI agent can call instead of always rewriting the whole field via `set_value`. Each lands an inline-diff overlay scoped to just the changed range — far cheaper in tokens, far cleaner UX for the reviewer.

**New extension command** on `AiInlineDiffExtension`:

- `applySurgicalAiInlineDiff(id, applyFn)` — snapshots the current doc as the baseline, runs `applyFn(tr)` to mutate the transaction with a precise change, then folds the resulting steps into the changeset. The existing decoration spec walks per-change ranges, so surgical edits get the same green-insert / red-strikethrough overlay as whole-field replacements, but only on the touched blocks.

**4 planner helpers** in a new `surgicalOps.ts` module (re-exported from the package root):

- `planReplaceBlock(editor, blockIndex, html)` — swap one top-level block.
- `planInsertBlockBefore(editor, blockIndex, html)` — insert before a given index (or append at `doc.childCount`).
- `planDeleteBlock(editor, blockIndex)` — delete one top-level block. Refuses the last remaining block.
- `planUpdateBlockMark(editor, blockIndex, mark, range, apply, attrs?)` — apply/remove inline marks on a character range *within* a block. Offsets are 0-based within the block's text.
- `summarizeBlockStructure(doc, maxChars?)` — render the doc's top-level structure as a numbered list (`[0] heading: Welcome`, …) for sending to the AI alongside the field value.

Each planner returns a `TransactionModifier | null` — `null` means "abort, this can't be planned" (out-of-range index, unparseable HTML, unknown mark).

**`useAiInlineDiff` hook** now reads `meta.surgical` on pending suggestions. The pilotiq-pro AI `update_form_state` client handler stamps:

```ts
meta: { surgical: { op: 'replace_block', blockIndex: 2, content: '<h2>...</h2>' } }
```

The hook routes the surgical-meta suggestion to the matching planner, then dispatches `applySurgicalAiInlineDiff`. Whole-field suggestions (no surgical meta) continue through the existing `startAiInlineDiff` path.

Also re-exports `AiInlineDiffExtension` / `aiInlineDiffPluginKey` / `getAiInlineDiffState` from the package root for consumers that want to read diff state directly.
