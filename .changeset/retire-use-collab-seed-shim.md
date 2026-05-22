---
'@pilotiq/pilotiq': minor
---

refactor(react): retire the local `useCollabSeed` shim — consume from `@rudderjs/sync/react` directly

The local hook at `@pilotiq/pilotiq/react#useCollabSeed` was kept as a deprecation surface after the four in-tree adapters (`TiptapEditor`, `MarkdownEditor`, `CollabTextRenderer`, `CollabCodeMirrorEditor`) all migrated to the framework's typed `useCollabSeed` / `useCollabSeedText` from `@rudderjs/sync/react` (commits `223eb38` + `ef76978`). The shim's behavior was a strict subset of the framework hook; keeping it longer would just split the surface.

External consumers that were importing `useCollabSeed` from `@pilotiq/pilotiq/react` should switch to `@rudderjs/sync/react`:

```ts
// Before:
import { useCollabSeed } from '@pilotiq/pilotiq/react'
useCollabSeed(room, fragmentKey, (doc) => {
  const fragment = (doc as YDocShape).getXmlFragment(fragmentKey)
  if (fragment.length === 0 && defaultValue) {
    // …seed via your editor binding…
  }
})

// After:
import { useCollabSeed, type CollabRoom as FrameworkCollabRoom } from '@rudderjs/sync/react'
useCollabSeed(
  room as unknown as FrameworkCollabRoom | null,
  fragmentKey,
  (_doc, fragment) => {
    if (fragment.length === 0 && defaultValue) {
      // …seed via your editor binding…
    }
  },
)
```

For `Y.Text`-shaped editors (CodeMirror / Monaco / plain `Y.Text` bindings), use `useCollabSeedText` (new in `@rudderjs/sync@1.3.0`) — same shape but the seed callback receives `(_doc, yText)` pre-resolved as `Y.Text`. See `@pilotiq/codemirror`'s `CollabCodeMirrorEditor` as a reference.

The `CollabRoom.synced?: Promise<void>` field on `@pilotiq/pilotiq/react#CollabRoom` is unchanged and is still the bridge that lets `@pilotiq-pro/collab`'s `<RecordCollabRoom>` (or any other room provider) thread a first-sync gate into adapters.
