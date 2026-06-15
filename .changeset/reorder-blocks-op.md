---
"@pilotiq/tiptap": minor
---

feat(tiptap): content-preserving `reorder_blocks` surgical op

Adds `planReorderBlocks(editor, order)` and wires the `reorder_blocks` op into the inline-diff surgical dispatch. Given a full permutation of the top-level block indices, it re-lays the existing nodes in the new order — content-preserving (every block keeps its marks, attrs, and nested content; no HTML round-trip), mirroring `wrap_blocks`. Returns null for a non-permutation (wrong length / out-of-range / duplicate) or an identity order, so a malformed request can never drop or duplicate a block. Powers `@pilotiq-pro/ai`'s Content Flow agent, which re-sequences article sections (inverted-pyramid) without rewriting text.
