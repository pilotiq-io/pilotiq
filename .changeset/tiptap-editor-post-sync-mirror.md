---
'@pilotiq/tiptap': patch
---

fix(collab): mirror rich-text editor into the FormData hidden input after first sync

Symmetric follow-on to the `CollabTextRenderer` fix from the same session. `TiptapEditor` (the rich-text surface mounted for `RichTextField`) had the same subscribe-after-sync gap: `onUpdate` debounces to `setSerialized(ed.getHTML() | JSON.stringify(ed.getJSON()))` on every keystroke, but in the cold-mount case (a fresh peer joining a populated doc) y-prosemirror's `ySyncPlugin` view-hook `_forceRerender` could land before the React owner installed the `update` listener — leaving the hidden FormData input at its SSR-rendered initial value through to submit.

The `useCollabSeed` callback now also calls `setSerialized` (using the same `storage`-mode-aware serialization as the debounced `onUpdate` body) after `room.synced` resolves. Idempotent — when `onUpdate` already propagated the value, this is a no-op `setSerialized(sameValue)`.

Not tickled by `pilotiq-pro/e2e/tests/collab/reorder-persistence.spec.ts` (which exercises plain-text fields), but closes the same latent flake for any `RichTextField` mounted under a populated collab room.
