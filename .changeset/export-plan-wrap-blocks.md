---
"@pilotiq/tiptap": minor
---

Export `planWrapBlocks` from the package entry point.

`#148` shipped `planWrapBlocks` but left it internal (only `useAiInlineDiff` could reach it), so the Normalizer agent's wrap path had no way to be contract-tested against the real schema. It now sits alongside the other surgical planners (`planInsertBlockBefore` / `planReplaceBlock` / `planDeleteBlock`) in the public API, and a `surgicalOpsWrap.dom.test.ts` contract test pins its editor-side guarantees (content-preserving wrap, exactly one wrapper node, and the one-trailing-empty-paragraph rule when the wrap produces a terminal landmark) against the live `@pilotiq/tiptap` planners + schema — mirroring the FAQ-placement contract.
