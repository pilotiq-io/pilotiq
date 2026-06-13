---
"@pilotiq/tiptap": patch
---

Fix double-Enter trapping an empty node inside landmark blocks (`keyTakeaways` / `summary` / `intro`).

These blocks use `content: 'block+'`, so the default list-exit on double-Enter only *lifted* the empty list item into a paragraph — a valid `block+` child — which stayed trapped inside the block instead of escaping it (#150). A new `LabeledBlockExitKeymap` (high priority, so it runs before `ListItem`'s `splitListItem`) intercepts the gesture: an empty trailing node (a paragraph, or the empty paragraph of a last list item) inside a landmark block is dropped and the cursor lands in a fresh paragraph *after* the block, mirroring the FAQ block's Enter-flow. The empty-chain-only case replaces the now-useless block with a paragraph. The logic is exported as `planExitLabeledBlock` and pinned by a `contentBlockExit.dom.test.ts` contract test against the real schema.
