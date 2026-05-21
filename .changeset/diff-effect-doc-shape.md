---
'@pilotiq/tiptap': patch
---

fix(tiptap): inline-diff effect re-runs when editor doc shape changes

`useAiInlineDiff`'s diff-start effect previously depended only on `[editor, list]`, so a surgical suggestion arriving during the seed window of a collab-enabled markdown / richtext editor (editor mounts with an empty placeholder paragraph, then the Yjs provider seeds the real content asynchronously) would call `planReplaceBlock(editor, blockIndex, …)` against the empty doc, get `null` for any blockIndex >= 1, and silently bail. The suggestion stayed in the queue, the banner appeared, but no decorations rendered. On Accept, the applier's auto-mode fallback re-planned the modifier against the now-seeded doc and dispatched it — so the change landed but the user never saw a preview.

Fix: subscribe to the editor's `doc.childCount` via `useEditorState` and include it in the diff-start effect's deps. The effect now re-runs when the doc transitions from empty (during seed) → loaded (after sync), picking up any suggestions whose modifier returned null on first attempt.

No behaviour change outside the seed-race window. Established tests + e2e suite (5 cases, ~15s) green.
