---
'@pilotiq/codemirror': patch
---

chore(codemirror): simplify-pass on `CollabCodeMirrorEditor` — dedupe seed read, drop stale caveat, expose stable selector hook for e2e

Follow-up housekeeping after the seed-from-`yText.toString()` fix shipped in `3.2.1`. No runtime behavior change for end users; the only DOM surface change is additive.

- Capture the seed once at mount: `const seed = yText.toString()` feeds both `EditorState.create({ doc: seed })` and the initial hidden-input mirror via `setText(seed)`. The pre-fix code called `yText.toString()` twice back-to-back inside the mount effect — harmless but redundant.
- Delete the "PK-switch row-rename caveat" paragraph from the component JSDoc. The caveat was closed end-to-end by `pilotiq-pro@5fae624`'s `rowArrayBinding.renameRow` `Y.Text` rekey branch + `@pilotiq/codemirror@3.2.1`'s seed fix. The seed-on-mount comment block at the call site already covers the operational invariant.
- Stamp `data-pilotiq-collab-code="<hiddenInputName>"` on the editor host div. Consumer-package e2e suites (e.g. `@pilotiq-pro/collab`'s collab specs) can anchor locators on this attribute instead of walking up through the FieldShell DOM via `..`, which was tightly coupled to the current JSX nesting.
- Remove the stale `eslint-disable @typescript-eslint/no-unused-vars` directive on the `import type * as Y from 'yjs'` line — `Y.Text` is used as a type cast in the mount effect.
