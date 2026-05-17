# @pilotiq/codemirror

CodeMirror 6 code-editor adapter for `@pilotiq/pilotiq`. Adds a `CodeEditorField` for SQL, JSON / YAML config, source code, templates, and other text-with-syntax content. Stores raw text under the field name; ships syntax highlighting, line numbers, bracket matching, and indent-aware tab handling.

## Why a separate package?

CodeMirror 6 is modular by design — language packs (`@codemirror/lang-*`), themes, and linters are picked at integration time. Pulling them into `@pilotiq/pilotiq` would penalize apps that don't edit code. Mirrors the `@pilotiq/tiptap` pattern: small adapter package, opt-in registration.

## Installation

```bash
pnpm add @pilotiq/codemirror codemirror @uiw/react-codemirror \
  @codemirror/state @codemirror/view @codemirror/language @codemirror/commands
```

Plus whichever language packs you actually use:

```bash
pnpm add @codemirror/lang-json @codemirror/lang-sql @codemirror/lang-javascript
```

## Setup

Register the plugin on your `Pilotiq.make(...)` panel (typically `app/Pilotiq/AdminPanel.ts`):

```ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { codeEditor } from '@pilotiq/codemirror'
import { json } from '@codemirror/lang-json'
import { sql }  from '@codemirror/lang-sql'

Pilotiq.make('Admin').plugins([
  codeEditor({ languages: { json, sql } }),
])
```

The plugin registers the editor renderer plus every language pack you pass in. Apps register only the languages they actually ship.

> Prefer to register manually? `import { registerCodeEditor, registerCodeLanguage }` from `@pilotiq/codemirror` and call them from your client entry (`pages/+Layout.tsx`). The plugin form is just sugar over those calls.

Without one of the two, `CodeEditorField` form fields render as nothing — `SchemaRenderer` can't find a renderer for the `'code'` type.

## Usage

```ts
import { CodeEditorField } from '@pilotiq/codemirror'

Resource.make('Settings')
  .form((form) => form.schema([
    CodeEditorField.make('config')
      .label('Configuration')
      .language('json')
      .height('400px')
      .placeholder('{ "theme": "dark" }'),
  ]))
```

Short alias `Code = CodeEditorField`, mirroring `Markdown / TagsInput / Repeater`.

## Builder API

| Method | Default | Notes |
|---|---|---|
| `.language(id: string)` | (none) | Registry id from `registerCodeLanguage`. String only — see "Why string-only?" below. |
| `.height(css: string)` | `'300px'` | Editor surface height. Accepts any CSS length. |
| `.lineNumbers(enabled: boolean)` | `true` | Show the gutter line-number column. |
| `.lineWrapping(enabled: boolean)` | `false` | Soft-wrap long lines instead of horizontal scroll. |
| `.indentWithTabs(enabled: boolean)` | `false` | `true` inserts a real `\t`; `false` inserts `indentSize` spaces. |
| `.indentSize(n: number)` | `2` | Indent width in columns. |
| `.theme(t: 'auto' \| 'light' \| 'dark')` | `'auto'` | `'auto'` follows `prefers-color-scheme` AND the app's `<html class="dark">` toggle. |
| `.readOnly(enabled: boolean)` | `false` | Renders editable but disables typing. |

Inherits the standard `Field` builders: `.label / .placeholder / .helperText / .required / .default / .visible / .hidden / .disabled / .live / .afterStateUpdated / .formatStateUsing / .validate`. All work as on any text field.

## Language registry

`.language()` accepts a **string id**, not a CodeMirror `Extension` value. Server-resolved `FieldMeta` must be JSON-serializable; an `Extension` isn't. Mirrors how the icon system works.

```ts
import { registerCodeLanguage } from '@pilotiq/codemirror'

// Built-in CodeMirror language packs
import { json } from '@codemirror/lang-json'
registerCodeLanguage('json', json)

// Custom or third-party language — wrap into a factory
import { myDsl } from './myDslExtension'
registerCodeLanguage('myDsl', () => myDsl({ strict: true }))
```

`registerCodeLanguage(id, factory)` returns nothing and overwrites silently — convenient for HMR.

```ts
import { getCodeLanguage, listCodeLanguages } from '@pilotiq/codemirror'

const factory = getCodeLanguage('json')   // () => Extension | undefined
listCodeLanguages()                        // string[] — every registered id
```

## Theming

`'auto'` (the default) tracks two signals:

1. The app's manual theme toggle — pilotiq's `ThemeProvider` adds `.dark` to `<html>` when the user picks dark mode. The editor observes the class via `MutationObserver` and switches.
2. OS-level `prefers-color-scheme` — for users who haven't manually overridden.

Force a fixed theme with `.theme('light')` or `.theme('dark')`. Custom CodeMirror themes (full `Extension` passthrough) are not supported in v1 — register a custom language pack with the theme bundled if you need this.

## Reactive integration

Free. Typing into the editor fires standard `onChange(newString)`, which `FormStateProvider` already observes. `Field.live()`, `afterStateUpdated`, and `formatStateUsing(fn)` work identically to any other text field.

```ts
CodeEditorField.make('query')
  .language('sql')
  .live({ debounce: 400 })
  .afterStateUpdated(({ state }) => {
    state.set('lastEdited', new Date().toISOString())
  })
```

## Collaborative editing

When `@pilotiq-pro/collab` is installed and a `<RecordCollabRoom>` is mounted up-tree (the standard pilotiq-pro form chrome), every `CodeEditorField` in the form automatically binds to a per-field `Y.Text` via [`y-codemirror.next`](https://github.com/yjs/y-codemirror.next). Two peers editing the same record see character-level convergence with proper undo/redo and (when the room exposes awareness) remote cursor decorations.

Opt out per-field — useful for read-only or private content:

```ts
CodeEditorField.make('debug_log')
  .language('json')
  .collab(false)   // local-only — never sees a remote update
```

Top-level fields bind to a doc-root share keyed by the bare field name. Repeater / Builder row leaves bind to `${arrayName}.${rowId}.${fieldName}` so the shared text survives row reorders (keyed by stable rowId, not array index).

### Install the optional peers

```bash
pnpm add y-codemirror.next yjs
```

Both are declared as **optional** peer deps on `@pilotiq/codemirror` — panels that don't ship realtime collab (most of them) leave them out entirely and the local editor path runs as before.

### Known caveat — relationship-row text on PK switch

`y-codemirror.next` binds against `Y.Text`. `@pilotiq-pro/collab`'s row-rename path (`rowArrayBinding.renameRow`, used when a freshly-created Repeater / Builder row gets its UUID swapped for a real DB primary key on first save) only rekeys `Y.XmlFragment` shares today. The submitter's text content survives because they hold the local edits in memory; peer B re-seeds from the DB column on next mount.

In practice this means: row-leaf `CodeEditorField` content in a brand-new relationship-row converges live across peers until the form is saved; after save, the row's PK changes and peer B falls back to the persisted DB column (which is identical content). No data is lost — only the live CRDT identity is reset for that row's text fields. Top-level code editors and any code editor on an already-saved row are unaffected.

Tracked as a `@pilotiq-pro/collab` follow-up: extend `rowArrayBinding.renameRow` with a parallel `Y.Text` clone branch.

## Wire format

Raw string under the field name. No new coerce branch — `coerceFormValues` passes strings through unchanged. `required / minLength / maxLength` validators apply as on any text field. JSON / YAML *parse* validation isn't built in; add a custom `Validator` if you need it:

```ts
import { CodeEditorField } from '@pilotiq/codemirror'

CodeEditorField.make('config')
  .language('json')
  .validate((value) => {
    if (!value) return null
    try { JSON.parse(value); return null }
    catch (e) { return `Invalid JSON: ${(e as Error).message}` }
  })
```

A hidden `<input type="hidden" name>` mirrors the editor value, so plain HTML form-post submissions work without `FormStateProvider` — same fallback shape as `MarkdownField`.

## SSR

The editor mounts client-side after hydration. During SSR, `CodeMirrorEditor` renders a placeholder div + the hidden mirror input so the form structure is intact for crawlers and the no-JS path. Once mounted, the placeholder is replaced with the live editor.

## Out of scope (v1)

- **Custom keymaps** (vim / emacs / sublime) — easy to add via an optional builder later.
- **Linting / autocomplete / language-server integration** — each is its own micro-plan.
- **Diff / merge view** — separate field if ever needed.
- **Foldable code regions / minimap** — defer.
- **Multi-file tabs** — single-buffer field by design.
- **Custom inline themes** — `'auto' | 'light' | 'dark'` only in v1.

## Plan doc

`docs/plans/code-editor.md` — design rationale and decisions.
