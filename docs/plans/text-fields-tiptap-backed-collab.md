# Text fields backed by Tiptap when collab is on

> **Status:** planned (2026-05-15)
> **Filed by:** pilotiq side, in response to recurring cursor-vs-value-vs-Y.Text desync bugs in `BoundTextInput` / `MarkdownInput`.
> **Replaces:** the `Y.Text` + manual `computeDelta` + heuristic `preserveCursor` path documented in `feedback_ytext_no_client_seed.md` and the F.6 plan.
> **Companion repos:** `@pilotiq-pro/collab` (rebind `getTextBinding` / `getRowTextBinding` to a y-prosemirror-backed binding); `@pilotiq/tiptap` (export a plain-text editor factory).

---

## TL;DR

Stop hand-rolling cursor preservation against `Y.Text` for plain-text fields. When collab is on, use a Tiptap editor (single-line or multi-line) styled to look like `<input>` / `<textarea>`, with y-prosemirror handling positions natively via Yjs `RelativePosition`. Keep the native-`<input>` path unchanged when collab is off. Keep type-specialized inputs (`email` / `password` / `number` / `slug`) on the native path even with collab on — Y.Map LWW is fine for those (low likelihood of two people typing the same email simultaneously).

## The problem

`Y.Text` + native `<input>` + manual diff requires the renderer to track three positions and keep them aligned across every keystroke:

1. The browser's `selectionStart` after the native input handler ran
2. The Yjs item that *was* at that string offset before the delta applied
3. The Yjs item that *is* at the equivalent post-delta offset

Today's code (in `react/fields/TextLikeInput.tsx → BoundTextInput` and `react/fields/MarkdownInput.tsx`) collapses (2) and (3) down to a single integer offset via `computeDelta` + `preserveCursor`. That heuristic works for end-of-string typing but breaks down on:

- **Mid-word insertion:** the synchronous Y.Text observer fires inside our own `applyDelta`, sees `prev !== next`, runs `preserveCursor`, and shifts the cursor by `after.length - before.length` — clobbering the user's caret position.
- **Start-of-word insertion:** same as above; the cursor jump compounds across rapid keystrokes, scrambling sequential inserts into interleaved output (typing `'123'` at position 0 of `'abc'` produces `'1c2b3c'` instead of `'123abc'`).
- **Two-peer concurrent inserts at the same offset:** Y.Text resolves item ordering by `(clientId, clock)`, so peer A typing `'a'` then `'c'` and peer B typing `'b'` simultaneously can produce interleaved output (`'bac'`) — the diff layer has no way to map a peer's character to its intended position.

Partial mitigation shipped at commit `243d49d` (pre-stamp `valueRef` before `applyDelta` so the local-echo observer short-circuits). This fixes the **end-of-string** path. Mid/start-of-word + two-peer races stay broken — they need positional identity, which y-prosemirror provides natively and the diff layer cannot.

## Why Tiptap

`@pilotiq/tiptap` already ships and works correctly under collab — `RichTextField` has zero cursor or interleaving bugs because y-prosemirror uses `Yjs.RelativePosition` to anchor selections to specific Yjs items rather than string offsets. RelativePositions automatically translate across remote and concurrent edits without any heuristic.

A Tiptap editor configured with a plain-text-only schema (no marks, no block types other than paragraph, optionally single-paragraph-only for `<input>` parity) gives us this proven CRDT integration at the cost of a few hundred extra bytes per text field — and the bundle is already paid for since `@pilotiq/tiptap` ships when richtext is in use.

## Proposed architecture

Hybrid path selected per field-type × collab-state:

| Field type | Collab off | Collab on |
|---|---|---|
| `TextField` | native `<input>` | Tiptap plain-text (single-line, no marks, Enter blurs) |
| `TextareaField` | native `<textarea>` | Tiptap plain-text (multi-line, no marks, Enter inserts newline) |
| `MarkdownField` | native `<textarea>` + preview toggle | Tiptap plain-text (multi-line, no marks) + preview toggle reads `.getText()` |
| `EmailField` / `SlugField` / `NumberField` / `PasswordField` | native typed `<input>` | native typed `<input>` + Y.Map LWW (whole-value replace) |
| `RichTextField` (Tiptap) | unchanged | unchanged |

The hybrid is intentional. The specialized inputs (`email`, `password`, `number`, `slug`) lose too much UX in contenteditable: mobile keyboards (`type="email"` numeric variants), password manager / autofill, native pattern validation, masked password display. The simultaneous-typing race for those is low-probability (rare to have two users typing the same password into the same field on the same record at the same instant) — Y.Map LWW with a clear "last-writer-wins" comment is the right tradeoff.

## Phases

### Phase A — `@pilotiq/tiptap` plain-text editor factory

- New export `createPlainTextEditor({ doc, fragmentName, multiline, placeholder, onUpdate })`:
  - Document extension restricted to a single `paragraph` block (when `multiline: false`) or paragraphs only (when `multiline: true`). No marks (bold/italic/etc).
  - `Collaboration.configure({ document: doc, field: fragmentName })` for the Y.XmlFragment binding.
  - `CollaborationCursor` deferred to Phase D (presence chips already exist via `useFieldPresence`).
  - Keymap: `Enter` blurs (single-line) or inserts newline (multi-line). `Mod-Enter` reserved.
  - `editor.getText()` returns the plain-text value for form serialization.
- Strip Tiptap's prose styling (padding, focus ring matches `<input>` / `<textarea>` chrome from `react/ui/`).

### Phase B — new `react/fields/CollabTextInput.tsx`

- Replaces `BoundTextInput` inside `TextLikeInput`'s `if (fs.textBinding)` branch.
- Reads the Y.XmlFragment via the binding (binding contract widens; see Phase C).
- Mounts a `createPlainTextEditor` from `@pilotiq/tiptap`.
- Forwards form-state mirror (`fs.setValue(editor.getText())`) on every editor `update`.
- Handles `triggerLive` on update (immediate) or blur (`onBlurMode`), same semantics as today.
- IME composition: Tiptap handles natively, no manual `compositionstart`/`compositionend` gate needed.

### Phase C — binding contract widens

Today's `TextBinding` exposes `read() / applyDelta() / observe() / destroy()` — a string-level contract. Tiptap needs the underlying `Y.XmlFragment` instead.

Two options:

1. **Replace the binding type:** `TextBinding` becomes a discriminated union — `{ kind: 'y-text', ytext }` (legacy, for specialized inputs that fall back to Y.Map LWW — actually they don't even use this; consider removing entirely) vs `{ kind: 'y-xml', yfragment }` (new). Pilotiq's renderer dispatches on `kind`.
2. **Add a parallel contract:** keep `TextBinding` for back-compat, add `XmlBinding` with `{ getFragment(): Y.XmlFragment, destroy(): void }`. `useFieldState` returns `xmlBinding` instead of `textBinding` for collab text fields.

Recommend option 2 — additive, keeps the existing `formCollabBinding` text path callable while we migrate, and lets us delete the Y.Text + textDelta + preserveCursor code in a follow-up cleanup once nothing references it.

### Phase D — wiring + delete

- `@pilotiq-pro/collab/formCollabBinding`: stop creating `Y.Text` instances for text-shaped fields; create `Y.XmlFragment` instances instead (one per field name). Old persisted `Y.Text` data needs a migration — see Open Questions.
- `@pilotiq-pro/collab/rowArrayBinding`: same swap for F.5c per-row text.
- Pilotiq deletes `react/fields/textDelta.ts` (`computeDelta` + `preserveCursor`) and the `BoundTextInput` inner component once `CollabTextInput` ships.
- `MarkdownInput` migrates to `CollabTextInput` for the editor pane; preview pane reads from form-state.

### Phase E — e2e

- Existing collab specs (`row-sync`, `concurrent-insert`, `reorder-persistence`, `top-level-text`) need locator updates — Tiptap's editor is contenteditable, not `<input>`. Use `[role="textbox"]` + `page.keyboard.type()` instead of `locator.fill()`.
- Add specs for the previously-broken cases:
  - Mid-word insertion at position N: typing `'X'` at index 2 of `'abcde'` produces `'abXcde'`.
  - Start-of-word insertion: typing `'123'` at index 0 of `'abc'` produces `'123abc'`.
  - Two-peer concurrent insertion at the same offset: both characters survive, ordering deterministic per Yjs item identity.

## Out of scope

- Native autofill / password manager integration for collab-mode text fields. Specialized inputs stay native + LWW for exactly this reason.
- `CollaborationCursor` (in-input remote caret bars). Presence chips already cover the "who's editing" UX; cursor bars are a Phase F polish item.
- Migration of existing persisted `Y.Text` data to `Y.XmlFragment`. Needs a separate plan — could be a one-shot migration on first connect, or new field name (e.g. `${name}_v2`) with read-fallback.

## Open questions

1. **Persisted `Y.Text` → `Y.XmlFragment` migration.** Resources with existing collab data have `Y.Text` slots in the persisted Y.Doc. After the swap they'll be ignored (no consumer reads them). Need to decide:
   - **A.** Migrate on first connect: on `onFirstConnect` for a collab'd record, if the Y.Text has content and the new Y.XmlFragment is empty, seed the fragment from the Y.Text string. Once the fragment is non-empty, delete the Y.Text. Risk: migration is non-atomic across peers — two peers connecting simultaneously could both run it.
   - **B.** Field-name versioning: read from `Y.XmlFragment(${name}_v2)`, fall back to `Y.Text(${name})` for display only (read-only) when v2 is empty. Edits go to v2. Stale data lingers; no migration race.
   - Recommend **B** unless storage cost matters.
2. **Single-line `Enter` behavior.** Tiptap's `Document` schema requires at least one block. For a single-line field, `Enter` could either (a) blur the editor (form-submit-friendly), (b) be a no-op, or (c) insert a literal `\n` into the text run (rare in practice). Filament's plain-text fields blur on Enter — recommend matching.
3. **Mask support.** `TextField` supports `.mask('phone')` etc. via the `useTextInputControls` hook. Masks are character-by-character on raw input events — non-trivial to replicate in Tiptap. Recommend keeping masked text fields on the native `<input>` path even with collab on (similar carve-out as the specialized inputs).
4. **Bundle splitting.** `@pilotiq/tiptap` currently exports the rich-text editor as the default. Plain-text factory could ship from a subpath (`@pilotiq/tiptap/plain-text`) so apps that only use plain-text collab don't pay for the toolbar / marks / bubble-menu code. Likely a small win — defer until profiled.

## Why not a smaller fix

I tried the smaller fix first (commit `243d49d`): pre-stamp `valueRef` before `applyDelta` so the synchronous observer short-circuits on local echo. That closed the cursor jump on **end-of-string typing**. Mid-word and start-of-word still break because the issue isn't just "observer fires on our write" — it's also "string offsets don't survive concurrent edits."

The smaller fix is a real improvement and stays. But it's not a path to fully correct behavior — every additional edit position is a new race, because the diff layer fundamentally lacks positional identity. y-prosemirror has positional identity. That's the architectural shift.

## Pointers

- Current broken code: `~/Projects/pilotiq/packages/pilotiq/src/react/fields/TextLikeInput.tsx → BoundTextInput`, `react/fields/MarkdownInput.tsx`, `react/fields/textDelta.ts`.
- Tiptap working example: `~/Projects/pilotiq-pro/packages/collab/` (or wherever RichTextField wires y-prosemirror — see how `Collaboration.configure({ document, field })` is set up).
- Memory: `[[feedback_ytext_no_client_seed]]` — concurrent-insert race; `[[feedback_usecallback_always_truthy]]` — earlier mask-gate bug in the same path.
- F.6 original plan: `docs/plans/collab-f5-row-identity.md` (Phase F.6 section).
