# CodeEditor field

Tier-2 micro-plan following Plan #6 — a CodeMirror-backed editor field
for source code, SQL, JSON / YAML config, scripts, and similar
text-with-syntax content. Stores the raw string in the column. Ships as
a separate adapter package **`@pilotiq/codemirror`**, mirroring
`@pilotiq/tiptap`.

## Why

`MarkdownField` covers prose; `RichTextField` covers WYSIWYG body
content; `TextareaField` covers everything else with no affordances.
None of them handle code well — no syntax highlight, no bracket
matching, no line numbers, no tab-aware indentation. Admins that store
SQL queries, JSON config, templates, or snippets want a real code
editor surface, not a textarea.

CodeMirror 6 is the canonical option: modular (~150 KB core + per-language
packages), excellent React story, used by VS Code-class apps in the
browser. Bundling it into `@pilotiq/pilotiq` would push that weight onto
every consumer — most don't need it. Following the tiptap precedent we
ship it as **`@pilotiq/codemirror`** and gate it behind a one-line
`registerCodeEditor()` call.

## Scope vs `RichTextField` / `MarkdownField`

| | RichTextField | MarkdownField | **CodeEditorField** |
|---|---|---|---|
| Editing surface | Tiptap WYSIWYG | `<textarea>` + toolbar | CodeMirror 6 |
| On-disk format | HTML / JSON | Markdown | Anything (raw string) |
| Syntax highlight | n/a | none | yes (per-language) |
| Line numbers | n/a | n/a | yes (default on) |
| Bracket matching / indent | n/a | n/a | yes |
| Dep weight | tiptap (~150 KB) | `marked` (~28 KB) | CodeMirror (~150 KB + lang packs) |
| Package | `@pilotiq/tiptap` | `@pilotiq/pilotiq` | **`@pilotiq/codemirror`** |

CodeEditor lands in its own adapter package because the CodeMirror
ecosystem is opt-in by design — language packs (`@codemirror/lang-*`),
themes, and linters are picked at integration time. Bundling them into
core would penalize apps that never edit code.

## API

```ts
import { CodeEditorField, registerCodeLanguage, registerCodeEditor } from '@pilotiq/codemirror'
import { json } from '@codemirror/lang-json'
import { sql } from '@codemirror/lang-sql'

// app boot — once
registerCodeEditor()
registerCodeLanguage('json', json)
registerCodeLanguage('sql', sql)

// field definition
CodeEditorField.make('config')
  .label('Configuration')
  .language('json')              // id from the registry
  .height('400px')
  .lineNumbers(true)             // default true
  .lineWrapping(false)           // default false
  .indentWithTabs(false)         // default false (spaces)
  .indentSize(2)                 // default 2
  .theme('auto')                 // 'auto' | 'light' | 'dark'
  .placeholder('Paste JSON…')
  .readOnly(false)               // default false
```

`Code = CodeEditorField` alias for ergonomics, matching `Markdown`,
`TagsInput`, `Repeater`.

Every method above is optional. With zero builders the field renders a
plain text editor with line numbers and indent — usable as a generic
multi-line input.

## Wire format

Raw string under the field name. No coerce branch — `coerceFormValues`
already passes strings through. `required / minLength / maxLength`
validators apply unchanged. JSON / YAML *parse* validators are out of
scope (separate validators micro-plan if/when we want them).

## Server-side rendering

`CodeEditorField.toMeta()` emits config: language **id** (string), line
numbers, line wrapping, indent settings, height, placeholder, theme
keyword, readOnly. The renderer maps the language id to a CodeMirror
`Extension` via the language registry on the client.

The language extension itself is **never serialized into meta** —
CodeMirror `Extension` values aren't JSON, and bundling per-language
factories into the server-resolved page payload would defeat the
opt-in installation model. Mirrors the icon-system registry pattern.

`.language(id)` accepts only a string — no Extension overload — so meta
stays serializable in every code path. To use a custom or third-party
language, register it first:

```ts
registerCodeLanguage('myDsl', () => myDslExtension())
```

## Renderer

New `react/CodeMirrorEditor.tsx` in `@pilotiq/codemirror`:

- `<FieldShell>` chrome (label / required / helperText) imported from
  `@pilotiq/pilotiq/react`, same as every other field.
- `<CodeMirror>` from **`@uiw/react-codemirror`** (thin React wrapper
  around CM6's `EditorView`). Saves us writing the imperative editor
  lifecycle ourselves.
- `value` controlled via `useFieldState` when inside `FormStateProvider`,
  uncontrolled `defaultValue` otherwise — same dual-path pattern as
  `MarkdownInput` / `TextLikeInput`.
- Extensions assembled at render time: line numbers, gutter, indent
  unit, language extension (looked up from `getCodeLanguage(id)`),
  theme. Memoized on the meta hash so toggling tabs / unrelated state
  doesn't rebuild the editor.
- Theme: `'auto'` resolves to CM's built-in light/dark via
  `prefers-color-scheme`; `'light' | 'dark'` force.
- Tab key inserts spaces (or a tab character if `indentWithTabs(true)`),
  honoring `indentSize`. Shift-Tab outdents. Standard CM6 behavior.
- A hidden `<input type="hidden" name={field.name}>` mirrors the
  current value so plain form-post submission carries the string —
  matches how `MarkdownInput` falls through to native form behavior.

`registerCodeEditor()` from `@pilotiq/codemirror/register` calls
`registerFieldRenderer('code', CodeMirrorEditor)` — same shape as
`registerTiptap()`.

## Reactive integration

Free. Typing fires `onChange(newString)` which `FormStateProvider`
already observes. `Field.live()`, `afterStateUpdated`, and
`formatStateUsing(fn)` work identically to any other text field — the
field renders re-render with the resolved `defaultValue` when state
changes.

## Tests (~10-12 new)

| File | What |
|---|---|
| `CodeEditorField.test.ts` (in `@pilotiq/codemirror`) | `make()` + builder chain (`language`, `height`, `lineNumbers`, `lineWrapping`, `indentWithTabs`, `indentSize`, `theme`, `placeholder`, `readOnly`); meta shape; defaults; `Code` alias |
| `languageRegistry.test.ts` (in `@pilotiq/codemirror`) | `registerCodeLanguage()` adds entries; `getCodeLanguage()` returns the factory; duplicate registration overwrites with warning; missing id returns `undefined` |
| `register.test.ts` (in `@pilotiq/codemirror`) | `registerCodeEditor()` registers `'code'` field renderer |
| `coerce.test.ts` (in `@pilotiq/pilotiq`) | Round-trips a code string under the field name (regression — confirm no new branch needed) |
| `validation.test.ts` (in `@pilotiq/pilotiq`) | `required / minLength / maxLength` apply to a code field's raw string |
| `pageData.test.ts` (in `@pilotiq/pilotiq`) | Form with a CodeEditorField (cast `fieldType: 'code'` like `richtext`) resolves; meta carries the configured language id + render config |

## Out of scope (v1)

- **Custom keymaps** (vim / emacs / sublime) — easy to add via an
  optional builder later (`.keymap('vim')`); not in v1.
- **Linting / autocomplete / language-server integration** — each is
  its own micro-plan; v1 is "highlight + indent + line numbers."
- **Diff / merge view** — separate field if ever needed.
- **Foldable code regions / minimap** — defer.
- **Multi-file tabs** — out of scope; this is a single-buffer field.
- **Custom inline themes** — `'auto' | 'light' | 'dark'` only in v1;
  full theme passthrough lands when a user actually asks for it.
- **JSON / YAML parse validators** — separate validators micro-plan.

## Implementation map

| Step | File(s) | Notes |
|------|---------|-------|
| 1 | `packages/codemirror/` | Scaffold package directory. Mirror `packages/tiptap/`: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `tsconfig.test.json`. |
| 2 | `packages/codemirror/package.json` | Name `@pilotiq/codemirror`. peerDeps: `@pilotiq/pilotiq`, `react`, `react-dom`, `codemirror`, `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`, `@uiw/react-codemirror`. Language packs (`@codemirror/lang-*`) are end-user peer deps — **not** declared here. |
| 3 | `src/CodeEditorField.ts` | `CodeEditorField` class extending `Field` with `fieldType: 'code' as FieldType` (matches the `RichTextField` cast pattern — no core union edit needed); builders + meta. Export `Code` alias. |
| 4 | `src/languageRegistry.ts` | `registerCodeLanguage(id, factory)` / `getCodeLanguage(id)` over a module-level `Map<string, () => Extension>`. Warn on duplicate. |
| 5 | `src/react/CodeMirrorEditor.tsx` | Renderer. Memoize extensions on meta + value-id. Hidden input for native form-post compatibility. |
| 6 | `src/register.ts` | `registerCodeEditor()` → `registerFieldRenderer('code', CodeMirrorEditor)`. |
| 7 | `src/index.ts` | Public exports: `CodeEditorField`, `Code`, `registerCodeLanguage`, `getCodeLanguage`. |
| 8 | `src/index.ts` (subpath `./register`) | Re-export `registerCodeEditor`. |
| 9 | Root `pnpm-workspace.yaml` | Already covers `packages/*` — no edit. |
| 10 | `playground-pilotiq` | Demo route. Add `@pilotiq/codemirror` + `@codemirror/lang-json` to the playground. Wire `registerCodeEditor()` + `registerCodeLanguage('json', json)` in the providers / client entry. Add a `CodeEditorField` to a resource (e.g. existing `Settings.value` JSON column or a new `Snippet` resource). |
| 11 | `docs/plans/admin-gap-audit.md` | Tick CodeEditor ✅. |
| 12 | `docs/packages/codemirror.md` (new) | API reference + language-registry usage + bundle-size note. |
| 13 | `README.md` | Mention in field-types bullet; add `@pilotiq/codemirror` to the package table. |

## Decisions

- **Separate package `@pilotiq/codemirror`.** CodeMirror 6 + language
  packs is meaningful weight. Tiptap precedent makes the open-core seam
  pattern obvious. Apps that don't edit code pay zero.
- **Language registry, not Extension-in-meta.** Server-resolved meta
  must be JSON-serializable; CM `Extension` values aren't. Same shape
  as the icon registry. `.language()` accepts a string id only — to use
  a custom or third-party language, register it first.
- **`@uiw/react-codemirror` over hand-rolled.** Small, well-maintained
  React wrapper around `EditorView`. Saves us writing the imperative
  lifecycle. Reconsider if it ever blocks us.
- **No core `FieldType` union edit.** Cast `'code' as FieldType` at
  construction time — same pattern `RichTextField` already uses.
  Adapter packages add their own field types without touching core.
- **No linting / completion / LSP in v1.** Each is its own micro-plan;
  v1 ships the smallest editor that gives admins syntax highlight +
  indentation + line numbers.
- **Hidden mirror input for native form-post.** Lets the field
  participate in plain `<form method=POST>` submissions without
  requiring `FormStateProvider`. Matches `MarkdownInput`'s fallback.
