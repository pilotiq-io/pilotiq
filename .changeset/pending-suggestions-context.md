---
'@pilotiq/pilotiq': minor
'@pilotiq/tiptap': minor
---

feat(core+tiptap): PendingSuggestionsContext seam + RichTextField AI bridge

Adds a cross-package, plugin-fillable queue of suggested field-value
changes that any field renderer can subscribe to. Open-core seam — core
defines the shape + provider, plugins like `@pilotiq-pro/ai` ship the
real implementation.

```ts
import { usePendingSuggestionsForField } from '@pilotiq/pilotiq/react'

const { list, dismiss } = usePendingSuggestionsForField('body')
//      ↑ filtered to suggestions targeting this field+formId
```

**`@pilotiq/pilotiq` exports** (`@pilotiq/pilotiq/react`):

- `PendingSuggestion` — `{ id, fieldName, formId?, currentValue,
  suggestedValue, source?, createdAt, meta? }`. The `meta` bag carries
  field-type-specific extras (e.g. `editorRange: { from, to }` for
  `richtext`).
- `PendingSuggestionsApi` — `{ list, push, dismiss, dismissAll }`. Core
  ships a no-op default context so trees without a real provider never
  throw.
- `PendingSuggestionsContext`, `usePendingSuggestions()`,
  `usePendingSuggestionsForField(name, formId?)` — the subscription
  surface.
- `registerPendingSuggestionOverlay(C)` — mirrors
  `registerFieldLabelSlot()`. A plugin registers a single component
  (`{ suggestion, onApprove, onReject }` props) that `<FieldShell>`
  mounts below the input whenever a matching pending suggestion exists.
  Skipped on `richtext` fields (those render the diff inline via the
  Tiptap extension).

**`@pilotiq/tiptap` `RichTextField` bridge**:

The Tiptap renderer now subscribes to the queue and mirrors entries
into its `AiSuggestionExtension`. Producers push a `PendingSuggestion`
with `meta.editorRange = { from, to }` and a string `suggestedValue`;
the bridge calls `editor.commands.addAiSuggestion(...)` so the inline
diff + Approve / Reject chips appear. When the user clicks a chip,
the editor command runs (mutating the doc on Approve, leaving it on
Reject) and the bridge mirrors the removal back to the queue via
`dismiss(id)` so other surfaces (chat-sidebar pill, FieldShell
overlay registered by another plugin) clear in lock-step.

The bridge is no-op when no provider is mounted — pilotiq core ships
the default no-op context, so consumers without `@pilotiq-pro/ai` see
no behavior change.

Pure helpers + types are public; the bridge hook
`useAiSuggestionBridge` is exported from `@pilotiq/tiptap` for advanced
producers that want to drive their own editor instances.
