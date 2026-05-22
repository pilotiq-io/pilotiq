---
'@pilotiq/tiptap': patch
---

fix(collab): `CollabTextRenderer`'s post-sync seed uses a stable initial-defaultValue ref

The `useCollabSeed` callback closed over the live `defaultValue` prop. In the cold-mount-against-a-populated-room case, the editor's first `onUpdate` could fire with empty text (a transient sync artifact from y-prosemirror's `ySyncPlugin` running `_forceRerender` before the React owner had stable state), which propagated empty through the host's `onChange` → `setText('')` → `setValue('')` → `FormStateContext.values[name] = ''`, which then cascaded back through `FormBody`'s `renderFieldWithValue` to re-render `CollabTextField` (and `CollabTextRenderer`) with `defaultValue=''`. By the time `room.synced` resolved and `useCollabSeed` fired the seed callback, the closure saw `defaultValue=''` — so the `fragment.length === 0 && defaultValue && editor` seed condition was false (the second clause), `setContent` was skipped, and `onChange(plainTextOf(editor))` propagated the editor's still-empty content. The hidden FormData input was then `value=""` at submit time → server-side `required` validation failed.

Fix: capture the first non-empty `defaultValue` in a `useRef` at mount time and use it as the seed source inside the seedFn. The ref preserves the original SSR-loaded value across the entire `room.synced` lifecycle, so the seed always recovers the right content even if the host prop has been clobbered to `''` by an intermediate sync-triggered round-trip. Once the user types into the editor the fragment is no longer empty, so the ref is read-only from then on — there's no legitimate "user explicitly cleared the field" case where this masks intent.

Surfaced by `pilotiq-pro/e2e/tests/collab/relationship-pk-switch.spec.ts` consistently failing against `@pilotiq/pilotiq@0.23.0+` with `422 errors.title = "This field is required"`. After the fix, 3/3 local runs of that spec pass + the full 16/16 `pilotiq-pro/e2e/tests/collab/*` suite passes + 193/193 `@pilotiq/tiptap` unit tests pass + full monorepo typecheck clean.
