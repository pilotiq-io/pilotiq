# AI Review Mode — VS Code-style Diff Approval

**Status:** Plan
**Owner:** —
**Touches:** `@pilotiq/pilotiq` (core), `@pilotiq-pro/ai`

---

## Goal

Agent writes (`update_form_state`, `update_field`, `edit_text`) currently apply immediately to the form. Users have asked for a **review-first flow** modeled on VS Code's inline AI suggestions:

- Text fields → red strike-through + green underline word-level diff, with **Approve** / **Reject** buttons
- Non-text fields (Select, Toggle, Slider, Color, etc.) → side-by-side "Current → Suggested" panel with the same buttons
- Approve → applier runs and writes to state (current path)
- Reject → suggestion dismissed, nothing changes

Default stays auto-apply (don't break current consumers). Review is opt-in.

---

## Why this is feasible now

Most of the plumbing already exists from prior phases:

| Component | Phase | Purpose |
|---|---|---|
| `PendingSuggestionsContext` | 6 | Cross-tree suggestion queue |
| `PendingSuggestionApplierRegistry` | 8.5 | Every Field registers a handler that knows how to write its own state on approve |
| `PendingSuggestionOverlay` slot | 7 | `FieldShell` mounts an overlay component when a suggestion exists for that field |
| `PendingSuggestionsPill` | 8 | Aggregate "Approve all / Reject all" UI in the chat sidebar |
| Tiptap `AiSuggestion` extension | post-Phase 8.5 | Inline diff + Approve/Reject chips for richtext (already shipping) |

**The single gap:** `AiClientToolBindings.applySetValue` dispatches the applier directly. Review mode means: when active, push to the queue instead of applying. Approve flows back through the same applier.

---

## Phases

### Phase A — Mode switch + push-instead-of-apply (MVP, ~80 LOC)

**`@pilotiq/pilotiq` (core)**
- Add `aiSuggestionsMode?: 'auto' | 'review'` to `PilotiqConfig` (default `'auto'`)
- Add fluent setter `Pilotiq.aiSuggestionsMode(mode)` on the builder
- Stamp `aiSuggestionsMode` onto `panelInfo()` so the client knows which mode is active

**`@pilotiq-pro/ai`**
- `AiClientToolBindings.applySetValue` reads the mode from `panelInfo()` (or a context)
- When `mode === 'review'`: instead of calling the applier, call `PendingSuggestionsApi.push({ field, currentValue, suggestedValue, formId })`
- Return `{ applied: ['set_value:queued'] }` so the agent's tool result reflects "queued for review" not "written"

This phase alone closes the loop: the existing `PendingSuggestionOverlay` slot will surface the suggestion and `PendingSuggestionsApi.approve(id)` already invokes the applier registry → the field updates after click. **A bare `<button>Approve</button>` in the overlay is enough to validate the flow before pretty diffs.**

### Phase B — `TextDiffOverlay` for plain text (~120 LOC)

New component `react/overlays/TextDiffOverlay.tsx`:
- Takes `currentValue: string`, `suggestedValue: string`, `onApprove`, `onReject`
- Word-level diff via the `diff` package (lightweight, ~10kb min)
- Red strike-through for removed words, green underline for added — match VS Code's color tokens (use existing CSS variables)
- Approve / Reject pill buttons aligned right

`FieldShell` already mounts `getPendingSuggestionOverlay()` — `Pilotiq.layoutProvider`-style: the AI plugin registers `<TextDiffOverlay>` as the default overlay for fieldType ∈ `['text', 'textarea', 'slug', 'email']` via a new `registerSuggestionOverlay({ fieldType, component })` registry.

### Phase C — `ValueComparisonOverlay` for non-text (~150 LOC)

New component `react/overlays/ValueComparisonOverlay.tsx`:
- Renders two adjacent panels: "Current" and "Suggested"
- Each panel uses the field's **native rendering** so the user sees what they're approving in context — for SelectField it's the option label, for ColorField it's the swatch, for ToggleField it's the on/off chip, etc.
- Pluggable per fieldType via the same `registerSuggestionOverlay` registry from Phase B
- Default fallback: `<pre>` with `JSON.stringify` for unknown types

Per-fieldType registrations:
- `select` → option label resolved via `optionsResolver`
- `toggle` / `checkbox` → chip with on/off state
- `slider` → number with mini bar
- `color` → swatch + hex
- `dateTime` / `date` → formatted timestamp
- `keyValue` → kv table (read-only)
- `tagsInput` → chip list
- (others) → JSON fallback

### Phase D — Per-field override (~30 LOC)

`Field.aiSuggestionsMode('auto' | 'review')` — fluent setter, mirrors `aiRequireApproval`. Resolution chain:
1. Field-instance override (most-specific wins)
2. Panel default

Server stamps the resolved mode onto each field's meta; client reads it inside `applySetValue` instead of (or in addition to) the panel-level mode.

### Phase E — Bulk Approve / Reject pill polish

`PendingSuggestionsPill` already exists (Phase 8). Verify it composes cleanly with the per-field overlays:
- Pill shows `N pending` count when overlays are visible
- Pill's Approve all triggers each suggestion's applier in registration order
- Each per-field overlay disappears as its suggestion clears

May need small UX additions (group by field, label with field name) but nothing structural.

---

## Out of scope (v1)

- **Standalone-path approval surfacing** (`✦` dropdown + `[✦ Agents ▾]` popover ignoring `tool_approval_required` events) — separate gap, ~80 LOC, tracked elsewhere
- **Smart text diff** beyond word-level — line-level / char-level / move detection. Word-level is sufficient for title/textarea/etc.
- **Reviewing block ops on richtext** — Tiptap `AiSuggestion` already does this. We're matching that UX for the rest of the form.
- **Multi-edit suggestions** (one tool call → multiple field changes). Each `update_form_state` call queues one suggestion per field; the user approves/rejects per-field. Bulk approve via the pill covers the multi-field case.
- **Diff persistence** — suggestions are in-memory only; navigating away discards them. Persistence (revisit later) would need a server-side store.

---

## API summary

### Builder

```ts
Pilotiq.make('Admin')
  .aiSuggestionsMode('review')   // panel-wide: every AI write stages a suggestion
```

### Per-field override

```ts
TextField.make('title')
  .ai(['rewrite', 'shorten'])
  .aiSuggestionsMode('auto')     // bypass review mode for low-risk fields
```

### Plugin-author hook (overlay registry)

```ts
import { registerSuggestionOverlay } from '@pilotiq/pilotiq/react'

registerSuggestionOverlay({
  fieldType: 'select',
  component: MySelectComparisonOverlay,
})
```

---

## Effort

| Phase | Estimate | Required for MVP? |
|---|---|---|
| A | ~80 LOC | Yes |
| B | ~120 LOC | Yes — text fields are the most common write target |
| C | ~150 LOC | Yes — without it, non-text writes fall through to ugly `<pre>` JSON |
| D | ~30 LOC | No — defaults are fine; defer until a consumer asks |
| E | ~50 LOC | No — pill works as-is; polish only |

**MVP total: ~350 LOC.** Ship Phase A first to validate the flow with a placeholder overlay, then B and C as parallel work.

---

## Risks

- **Diff library dep size.** `diff` is ~30kb min+gz. Acceptable. `fast-diff` is smaller (~5kb) but less battle-tested. Pick one in Phase B.
- **Race between agent and user typing.** If the user types in a field while a suggestion is pending, `currentValue` in the suggestion goes stale. Solution: re-snapshot `currentValue` on each render of the overlay so the diff stays accurate.
- **Multiple suggestions for the same field.** Only show the most recent; auto-dismiss earlier suggestions on push (already the queue's behavior).
- **Approve / reject during a streaming run.** The agent may have already moved on. Approve writes to state; reject leaves the field as-is. The agent's tool result said "queued" so subsequent reasoning won't expect the value to be live yet.
