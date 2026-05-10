---
'@pilotiq/pilotiq': minor
'@pilotiq/tiptap': minor
---

feat(core+tiptap): cross-tree applier registry — Approve from anywhere

Phase 8.5 of the AI UX polish plan. Adds an open-core registry that
lets aggregate consumers — chat-sidebar pending-pills, bulk-action
menus, future "AI inbox" surfaces — apply a `PendingSuggestion` to its
target field without sharing the form's React tree.

```ts
import { registerPendingSuggestionApplier } from '@pilotiq/pilotiq/react'

// Renderer-side (auto-wired by FieldShell + Tiptap bridge):
useEffect(() =>
  registerPendingSuggestionApplier(formId, fieldName, (suggestion) => {
    /* apply to this field's underlying input or editor */
  }),
[formId, fieldName])
```

**Core (`@pilotiq/pilotiq`)**:

- New module `react/PendingSuggestionApplierRegistry.ts` — module-level
  Map keyed by `(formId, fieldName)` (`formId` defaults to `'*'` for
  global form scope; form-scoped registrations always win over the
  wildcard for the same field). Exposes `registerPendingSuggestionApplier`
  (returns unregister fn for `useEffect` cleanup) and
  `getPendingSuggestionApplier`.
- `PendingSuggestionsApi` extended with `approve(id)` and
  `approveAll(filter?)` — resolves the suggestion's `(formId,
  fieldName)` against the registry, runs the applier, then dismisses.
  Falls through to plain `dismiss` when no applier is registered or
  the applier throws (so a busted applier doesn't strand entries).
  Default no-op context implements both as plain dismiss.
- `<FieldShell>` auto-registers a generic applier on mount for every
  non-richtext, non-dotted-path field. Applier uses
  `useFieldState.setValue` for controlled (live) forms and a DOM
  fallback (React's internal value setter via
  `Object.getOwnPropertyDescriptor(proto, 'value').set`) for
  uncontrolled forms. Cleanup on unmount.

**Tiptap (`@pilotiq/tiptap`)**:

- `useAiSuggestionBridge` registers a richtext-aware applier that
  calls `editor.chain().focus().approveAiSuggestion(id).run()` —
  same path the inline chip click takes. The transaction listener
  already mirrors the editor-side dismissal back to context, so a
  pill-driven Approve flows: pill → applier → editor command →
  editor `onTransaction` → context `dismiss`.

The registry is generic — not AI-specific. Future field-mutation
extensions (form-recovery, undo stacks, bulk imports) can register
through the same seam.

Default no-op context still ships, so trees without a real provider
mounted (e.g. headless tests, marketing-site previews) see no behavior
change.
