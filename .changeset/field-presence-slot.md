---
'@pilotiq/pilotiq': patch
---

feat(pilotiq): per-field presence slot + focus reporter (Phase F4)

Two new module-singleton registry slots + `FieldShell` wiring — the
open-core scaffolding pro collab plugins (e.g. `@pilotiq-pro/collab`)
plug into to render "who's editing this field" indicators.

### Registries (exported from `@pilotiq/pilotiq/react`)

- **`registerFieldPresenceComponent(C)`** / **`getFieldPresenceComponent()`** —
  module slot for a React component that renders next to each field's
  label. Receives `{ fieldName, formId }`. Components own the awareness
  lookup (typically via `useCollabRoom()` from `@pilotiq-pro/collab`'s
  `useFieldPresence` hook); pilotiq core stays Yjs-free.
- **`registerFieldFocusReporter(reporter)`** / **`getFieldFocusReporter()`** —
  module slot for `{ onFocus, onBlur }` callbacks. `FieldShell` invokes
  them on capture-phase focus / blur events for every controlled input;
  the collab plugin mirrors the local user's focus into a `focusField`
  awareness key so peers can render their chip rails.

### `FieldShell` integration

- Mounts the registered chip component inside the `<label>` via
  `{PresenceChip && <PresenceChip fieldName={name} formId={formId} />}`.
- Wires `onFocusCapture` / `onBlurCapture` on the outer wrapper `<div>`
  so any inner input (including custom NodeViews — Select / Date /
  Slider) emits focus events through one shared dispatch.
- Both slots gated on `meta.collab !== false` AND non-dotted-path
  name (Q3 from the F-plan: `.collab(false)` opts the field out of
  the collab layer entirely — no presence chip AND no awareness leak
  about which field the local user is editing).

### Tested

- All 2938 pilotiq tests pass.
- Two-window smoke test (playground): focusing `title` in window A
  paints a colored dot next to `title`'s label in window B; clicking
  through `title` → `status` → `excerpt` moves the dot in lockstep;
  blurring clears it. Pairs cleanly with the Phase F3 value sync —
  one ydoc, one provider, two registry surfaces consumed.
