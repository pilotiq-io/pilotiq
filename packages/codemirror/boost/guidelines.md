# @pilotiq/codemirror

## Overview

CodeMirror 6 code-editor adapter for `@pilotiq/pilotiq`. Adds a `CodeEditorField` for SQL, JSON / YAML config, source code, templates, and other text-with-syntax content. Stores raw text under the field name; ships syntax highlighting, line numbers, bracket matching, and indent-aware tab handling.

CodeMirror 6 is modular by design — language packs are picked at integration time. Pulling them into the host package would penalize apps that don't edit code. Mirrors the `@pilotiq/tiptap` pattern: small adapter, opt-in registration.

## Setup

```bash
pnpm add @pilotiq/codemirror codemirror @uiw/react-codemirror \
  @codemirror/state @codemirror/view @codemirror/language @codemirror/commands
```

Plus whichever language packs you actually use:

```bash
pnpm add @codemirror/lang-json @codemirror/lang-sql @codemirror/lang-javascript
```

Register the plugin on the panel:

```ts
// app/Pilotiq/AdminPanel.ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { codeEditor } from '@pilotiq/codemirror'
import { json } from '@codemirror/lang-json'
import { sql }  from '@codemirror/lang-sql'

export const adminPanel = Pilotiq.make('Admin')
  .path('/admin')
  .plugins([
    codeEditor({ languages: { json, sql } }),
  ])
```

The plugin registers the editor renderer plus every language pack you pass in. Apps register only the languages they actually ship — no kitchen-sink bundle.

Without registration, `CodeEditorField` form fields render as nothing because `SchemaRenderer` can't find a renderer for `fieldType: 'code'`.

## Key Patterns

### Basic usage

```ts
import { CodeEditorField } from '@pilotiq/codemirror'

Resource.make('Settings').form((form) => form.schema([
  CodeEditorField.make('config')
    .label('Configuration')
    .language('json')                           // registry id, not a CodeMirror Extension
    .height('400px')
    .placeholder('{ "theme": "dark" }'),
]))
```

Short alias: `Code = CodeEditorField` (re-exported from `@pilotiq/codemirror`), mirroring `Markdown / TagsInput / Repeater` aliases on the host package.

### Builder API

| Method | Default | Notes |
|---|---|---|
| `.language(id: string)` | (none) | Registry id from `registerCodeLanguage` / `codeEditor({ languages })`. String only — `FieldMeta` must be JSON-serializable. |
| `.height(css: string)` | `'300px'` | Any CSS length. |
| `.lineNumbers(enabled: boolean)` | `true` | Gutter line-number column. |
| `.lineWrapping(enabled: boolean)` | `false` | Soft-wrap long lines. |
| `.indentWithTabs(enabled: boolean)` | `false` | `true` inserts real `\t`; `false` inserts `indentSize` spaces. |
| `.indentSize(n: number)` | `2` | Indent width in columns. |
| `.theme(t: 'auto' \| 'light' \| 'dark')` | `'auto'` | `'auto'` follows `prefers-color-scheme` AND the app's `<html class="dark">` toggle. |
| `.readOnly(enabled: boolean)` | `false` | Renders editable but disables typing. |

Inherits all standard `Field` builders: `.label / .placeholder / .helperText / .required / .default / .visible / .hidden / .disabled / .live / .afterStateUpdated / .formatStateUsing / .validate / .disabledOn / .hiddenOn / .visibleOn`.

### Language registry

`.language()` takes a **string id**, not a CodeMirror `Extension` value — server-resolved `FieldMeta` must be JSON-serializable; an `Extension` isn't. The registry maps id → factory:

```ts
import { registerCodeLanguage } from '@pilotiq/codemirror'

// Built-in CodeMirror language packs
import { json } from '@codemirror/lang-json'
registerCodeLanguage('json', json)

// Custom or third-party — wrap into a factory closure
import { myDsl } from './myDslExtension'
registerCodeLanguage('myDsl', () => myDsl({ strict: true }))
```

`registerCodeLanguage(id, factory)` overwrites silently (convenient for HMR). The plugin form `codeEditor({ languages: { json, sql } })` calls `registerCodeLanguage` under the hood for every key in the map.

Querying:

```ts
import { getCodeLanguage, listCodeLanguages } from '@pilotiq/codemirror'

const factory = getCodeLanguage('json')         // () => Extension | undefined
listCodeLanguages()                              // string[] — every registered id
```

### Common language packs

The CodeMirror ecosystem ships packs as separate npm packages. Install only what you use:

```bash
pnpm add @codemirror/lang-json @codemirror/lang-sql @codemirror/lang-javascript \
         @codemirror/lang-html @codemirror/lang-css @codemirror/lang-markdown \
         @codemirror/lang-python @codemirror/lang-rust @codemirror/lang-go \
         @codemirror/lang-php @codemirror/lang-yaml
```

```ts
import { json }       from '@codemirror/lang-json'
import { sql }        from '@codemirror/lang-sql'
import { javascript } from '@codemirror/lang-javascript'
import { html }       from '@codemirror/lang-html'
import { css }        from '@codemirror/lang-css'
import { markdown }   from '@codemirror/lang-markdown'
import { python }     from '@codemirror/lang-python'
import { yaml }       from '@codemirror/lang-yaml'

codeEditor({
  languages: { json, sql, javascript, html, css, markdown, python, yaml },
})
```

### Theming

`'auto'` (the default) tracks two signals:

1. The app's manual theme toggle — pilotiq's `ThemeProvider` adds `.dark` to `<html>` when the user picks dark mode. The editor observes the class via `MutationObserver` and switches.
2. OS-level `prefers-color-scheme` — for users who haven't manually overridden.

Force a fixed theme with `.theme('light')` or `.theme('dark')`. Custom CodeMirror themes (full `Extension` passthrough) aren't supported in v1 — register a custom language pack with the theme bundled if you need this.

### Reactive integration

Free. Typing into the editor fires standard `onChange(newString)`, which `FormStateProvider` already observes. `Field.live()`, `afterStateUpdated`, and `formatStateUsing(fn)` work identically to any other text field.

```ts
CodeEditorField.make('query')
  .language('sql')
  .live({ debounce: 400 })
  .afterStateUpdated(async (sql, ctx) => {
    const validation = await validateSqlSyntax(sql)
    if (!validation.ok) ctx.$set('queryError', validation.message)
  })
```

### Validation

Standard pattern — `.validate([fn, fn, …])` with any validator that returns `string | null | Promise<string | null>`:

```ts
CodeEditorField.make('config')
  .language('json')
  .validate(async (value) => {
    if (typeof value !== 'string' || value.trim() === '') return null
    try {
      JSON.parse(value)
      return null
    } catch (err) {
      return `Invalid JSON: ${(err as Error).message}`
    }
  })
```

For richer JSON validation (against a schema), combine with `Field.unique()`-style async helpers — the validator just needs to return a string error or null.

### Collab mode

When the host panel's `collab` slot is wired (via `@pilotiq-pro/collab`), `CodeEditorField` participates in record-room collaborative editing via `y-codemirror.next` — peers see each other's cursors, edits merge via Y.js CRDT. No opt-in needed on the field itself; the pro package handles the awareness + sync wiring.

For a remount onto a populated Y.Text (e.g. after a peer joins late), the field seeds the CodeMirror `EditorState` from `yText.toString()` — `ySyncPlugin` doesn't pull pre-existing content on its own. This is automatic; you don't need to wire it.

## Common Pitfalls

- **Forgetting `.plugins([codeEditor({ languages: {...} })])`** — `CodeEditorField` form fields render as nothing because `SchemaRenderer` can't find a renderer for `fieldType: 'code'`. The plugin form is the recommended path; loads on both server + client through the panel module.
- **Passing a CodeMirror `Extension` to `.language(...)` directly** — TypeScript flags it (the parameter is `string`), but a runtime cast won't help. `FieldMeta` is JSON-serialized between server and client; only string ids round-trip.
- **Registering languages from outside the panel module** — `registerCodeLanguage` calls from `pages/+Layout.tsx` work on the client but not the server. Server-side validation / SSR render needs the language registered on both sides. Use the plugin form or call `registerCodeLanguage` from a shared module imported by both.
- **CodeMirror size budget** — CodeMirror 6 itself plus `@uiw/react-codemirror` is ~150 KB gzipped (a fraction of Monaco's 3-5 MB). Each language pack adds 10-30 KB. Only register the languages you actually need.
- **Hot-reload of language factories** — `registerCodeLanguage(id, newFactory)` overwrites silently but mounted editors don't pick up the new factory until remount. For HMR, key the field on a stable formId so React doesn't remount on every save.
- **`@pilotiq/codemirror` peer dep** — declares `@pilotiq/pilotiq` as a peer with the literal range `">=0.7.0 <1.0.0"` (not `workspace:^`). Pre-1.0 caret on workspace:^ would break on every pilotiq minor bump.

## Key Imports

```ts
import {
  CodeEditorField,            // the form field
  Code,                       // alias for CodeEditorField
  codeEditor,                 // plugin factory for .plugins([])
  registerCodeEditor,         // installs the renderer (alternative to .plugins([codeEditor()]))
  registerCodeLanguage,       // register a language pack: registerCodeLanguage('json', json)
  getCodeLanguage,            // lookup: getCodeLanguage('json') → () => Extension | undefined
  listCodeLanguages,          // every registered id
} from '@pilotiq/codemirror'
```
