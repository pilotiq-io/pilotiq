---
'@pilotiq/tiptap': patch
---

fix(collab): mirror editor text into the FormData hidden input after first sync

`CollabTextRenderer` (the plain-text Tiptap editor mounted for `TextField` / `TextareaField` when collab is on) relied on three paths to keep the hidden FormData mirror in sync with the y-prosemirror-backed editor doc:

1. `onUpdate` — fires on every y-prosemirror transaction.
2. The mount-time safety-net `useEffect(() => onChange(plainTextOf(editor)), [editor])` — fires once when the editor instance materializes.
3. The `useCollabSeed` callback — seeded empty fragments with the SSR-rendered `defaultValue`, but never propagated the seed (or the post-sync fragment content) back to the host's `onChange`.

In the cold-mount case (a fresh peer joining a populated doc), all three paths could miss: the safety net reads `plainTextOf(editor)` before y-prosemirror's `ySyncPlugin` view-hook dispatch has populated the prose-mirror doc, and the subsequent `_forceRerender` / `_typeChanged` transactions occasionally landed in a window where the `update` listener hadn't been installed by the React owner yet. The result: hidden input stayed empty, server-submitted values dropped row text on `disconnect-and-reload`.

The fix extends the existing `useCollabSeed` callback to also call `onChange(plainTextOf(editor))` after `room.synced` resolves — regardless of whether the seed branch ran. Idempotent (`setText(sameValue)` is a no-op when `onUpdate` already propagated the value); same shape as the catch-up replay in `@pilotiq-pro/collab`'s `rowArrayBinding.subscribeRows`.

Closes the remaining ~20% flake on `pilotiq-pro/e2e/tests/collab/reorder-persistence.spec.ts` (peer C's `metadata.0.heading` hidden input occasionally never appeared within 20s).
