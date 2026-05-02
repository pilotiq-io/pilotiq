# MarkdownEditor field

Plan #6 micro-plan — a plain-markdown editor field for users who don't
want the rich-text Tiptap surface. Stores the raw markdown string in the
column. Filament-equivalent: `MarkdownEditor`.

## Why

`RichTextField` (from `@pilotiq/tiptap`) is the right default for body
content, but it serializes to HTML/JSON. A meaningful slice of admins
want their content stored as **plain markdown** — README-style fields,
release notes, blog posts that round-trip into a static-site generator,
etc. Today they have to fall back to `TextareaField` and lose the
toolbar / preview affordances that make markdown writable for non-devs.

## Scope vs `RichTextField` / future `CodeEditor`

| | RichTextField | **MarkdownField** | CodeEditor (next) |
|---|---|---|---|
| Editing surface | Tiptap WYSIWYG | `<textarea>` + toolbar | CodeMirror |
| On-disk format | HTML / JSON | **Markdown** | Anything (raw string) |
| Live preview | n/a (WYSIWYG) | rendered side-tab | n/a |
| Syntax highlight | n/a | none | yes (lang-configurable) |
| Dep weight | tiptap (already shipped) | `marked` (~28 KB) | CodeMirror (~150 KB) |
| Package | `@pilotiq/tiptap` | **`@pilotiq/pilotiq`** | `@pilotiq/pilotiq` (or new) |

MarkdownField stays in `@pilotiq/pilotiq` proper because it's a small
addition with no ProseMirror coupling — pulling it into the tiptap
package would force apps that just want plain markdown to install
`@tiptap/*`. CodeEditor lands separately when we're ready to take on the
CodeMirror dep.

## API

```ts
MarkdownField.make('body')
  .label('Article body')
  .placeholder('Write in markdown…')
  .toolbarButtons([
    'bold', 'italic', 'strike', 'link',
    'heading', 'bulletList', 'orderedList', 'blockquote',
    'codeBlock', 'attachFiles',
  ])
  .disableToolbarButtons(['attachFiles'])  // sugar — drop a few
  .minHeight('200px')
  .maxHeight('600px')
  .fileAttachmentsDirectory('articles')    // forwarded to UploadAdapter
  .fileAttachmentsVisibility('public')
```

Sensible defaults — every method above is optional. Default toolbar:

```
['bold', 'italic', 'strike', 'link', 'heading',
 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'attachFiles']
```

Set `.toolbarButtons([])` to render a chrome-less textarea + preview tab
only. `.disableToolbarButtons(['attachFiles'])` is sugar — same effect
as listing the surviving ones in `toolbarButtons()`, just shorter when
the user only wants to drop one or two.

`MarkdownField` extends `Field` with `fieldType: 'markdown'`. Export
alias `Markdown = MarkdownField` mirroring `TagsInput / Repeater`.

## File attachments

When `'attachFiles'` is in the toolbar AND the panel has registered an
`UploadAdapter` via `Pilotiq.uploads({ adapter })`, the toolbar button +
paste-image handler upload the file and splice an
`![alt](returnedUrl)` reference into the textarea at the cursor.

- Reuses the existing `POST {base}/_uploads` route from FileUpload — no
  new endpoint.
- `fileAttachmentsDirectory(path)` and `fileAttachmentsVisibility('public'|'private')`
  are forwarded to the adapter via the upload payload (adapter-defined
  semantics; `localUpload` ignores them, S3-style adapters honor them).
- When no adapter is configured the `attachFiles` button hides itself
  at render time (server checks `pilotiq.uploads()` and strips the
  button from the resolved meta), so apps without uploads don't see a
  broken button.

## Wire format

Same as `TextareaField`: a single string under the field name. No new
coerce branch — `coerceFormValues` already passes strings through. No
new validator either; `required / minLength / maxLength` work as-is.

## Server-side rendering

`MarkdownField.toMeta()` emits the bare config (toolbar list, min/max
height, attachments config); the value stays a raw string in
`Form.values`. **Markdown → HTML conversion happens in the browser** for
the preview pane — no server-side parser. Reasoning: the preview is
local to the editor, the user is already editing live, and a server
roundtrip per keystroke would be wasteful. We accept a `marked`
client-bundle cost (~28 KB minified) in exchange for not shipping a
parser pair (server + client).

For a read-only **infolist** display of stored markdown later (Plan #6
field-types-expansion.md "Markdown / HTML rendering" prime — Tier 2),
revisit whether to render server-side or ship `marked` to the client
again. Out of scope for this plan.

## Renderer

New `react/fields/MarkdownInput.tsx`:

- `<FieldShell>` chrome (label / required / helperText) like every other field.
- Header row: tab switcher (`Write` / `Preview`) + collapsible toolbar.
- `Write` tab: `<textarea>` with `style={{ minHeight, maxHeight }}` +
  `font-mono`. `value` controlled via `useFieldState` when inside
  `FormStateProvider`, uncontrolled `defaultValue` otherwise — same
  dual-path pattern as `TextLikeInput`.
- `Preview` tab: `dangerouslySetInnerHTML` with `marked.parse(value)`
  output, scoped to a `prose dark:prose-invert` Tailwind container.
- Toolbar buttons mutate the textarea via a small `wrapSelection /
  insertBlock` helper — string splice + `setSelectionRange`. No
  `document.execCommand` (deprecated). Buttons are placeholders when
  the textarea ref is null (e.g. on first render in Preview tab).
- Paste-image handler on the textarea: when the clipboard carries an
  image AND `attachFiles` is enabled, fetch the upload URL with the
  blob, splice the resulting `![alt](url)` at the cursor.
- Keyboard shortcuts: `Cmd/Ctrl-B` bold, `Cmd/Ctrl-I` italic,
  `Cmd/Ctrl-K` link. Cmd-detection mirrors `CommandPalette.tsx`.
- Marked invoked once per Preview-tab render via `useMemo` keyed on the
  current value, so toggling tabs doesn't re-parse. Sanitize via
  marked's built-in escape (default `breaks: false, gfm: true`); we
  don't bring in DOMPurify in v1 — admin-only render context, trusted
  authors. Document the assumption in the API guide.

`SchemaRenderer.tsx` adds a `case 'markdown'` branch in `renderFormChild`
that mounts `<MarkdownInput field={meta} />`.

## Reactive integration

- `Field.live()` works for free — typing into the textarea bubbles
  through the standard `onChange` handler that `FormStateProvider`
  already listens for.
- `Field.afterStateUpdated` works for free — server resolves the field
  the same way it does any other text field.
- `formatStateUsing(fn)` runs at server-resolve time and the renderer
  reads from `meta.defaultValue`, same as today.

## Tests (~12-15 new)

| File | What |
|------|------|
| `MarkdownField.test.ts` | `make()` + builder chain (`toolbarButtons`, `disableToolbarButtons`, `minHeight`, `maxHeight`, `fileAttachmentsDirectory`, `fileAttachmentsVisibility`); meta shape; default toolbar order; `disableToolbarButtons` subtracts; `attachFiles` stripped from meta when `pilotiq.uploads()` is unset (server-side filter). |
| `coerce.test.ts` | Round-trips a markdown string under the field name (regression — confirm no new coerce branch is needed). |
| `validation.test.ts` | `required / minLength / maxLength` apply to a markdown field's raw string. |
| `pageData.test.ts` | Form with a `MarkdownField` resolves; meta carries `fieldType: 'markdown'` + the resolved toolbar list. |

## Out of scope (v1)

- **Server-side markdown rendering / sanitization** — preview is
  client-only with `marked`'s default escape. DOMPurify pass folded in
  if/when we render markdown outside the editor.
- **Custom marked extensions / footnotes / math** — defaults only.
- **Drag-and-drop file uploads** — paste-image only in v1; matches the
  existing FileUpload field's UX surface.
- **Word count / character count** — easy add, defer.
- **Distraction-free / fullscreen mode** — Filament has it, low value
  in an admin-panel context.
- **Vim / Emacs keybindings** — that's CodeEditor territory.
- **Mention / autocomplete inside the textarea** — out of scope; this
  is a markdown editor, not a content composition surface.

## Implementation map

| Step | File(s) | Notes |
|------|---------|-------|
| 1 | `packages/pilotiq/package.json` | Add `marked` dep (latest 4.x or 12.x ESM build). Bundled via Vite — no new optimizeDeps entry needed. |
| 2 | `src/fields/MarkdownField.ts` | New class + `Markdown` alias; builders + meta. |
| 3 | `src/fields/Field.ts` | Add `'markdown'` to the `FieldType` union. |
| 4 | `src/index.ts` | Export `MarkdownField` + `Markdown`. |
| 5 | `src/pageData.ts` | `attachFiles`-strip pass: when resolving form meta, drop `'attachFiles'` from any markdown field's `toolbarButtons` if `pilotiq.uploads()` is unset. (Sibling of `tagFormStateUrls`; lives wherever the upload-URL stamping is — see `uploadCtx`.) |
| 6 | `src/react/fields/MarkdownInput.tsx` | New renderer. Tab switcher + toolbar + textarea + preview pane + paste-image + keyboard shortcuts. |
| 7 | `src/react/SchemaRenderer.tsx` | `case 'markdown'` in `renderFormChild`. |
| 8 | `playground-pilotiq` | Demo route — add a `MarkdownField` to `PostResource.form()` for `excerpt` or a new `notes` column. Mirror Prisma schema change in `playground/` per `feedback_prisma_hoist_shared_schema.md`. |
| 9 | `docs/plans/admin-gap-audit.md` | Tick `MarkdownEditor` ✅. |
| 10 | `docs/packages/pilotiq/fields.md` (or new sub-page) | API reference + paste-image note + sanitization assumption. |
| 11 | README.md | Mention in field-types bullet. |

## Decisions

- **Plain textarea, not CodeMirror.** v1 is the smallest editor that
  ships markdown to disk with a usable toolbar + preview. CodeMirror
  comes with the future `CodeEditor` micro-plan, where syntax-highlight
  is the value prop.
- **`marked` over `micromark` / `remark`.** Smallest dep that handles
  the common-mark surface admins write in. Plugin ecosystem matters
  less here — we never re-export `marked` to user code.
- **Client-side preview only.** Server roundtrip per keystroke would
  defeat the live-preview UX; sending HTML in `meta.preview` would
  inflate the form payload. Accept the bundle cost.
- **No DOMPurify in v1.** Admin authors are trusted. Re-evaluate if
  rendered markdown ever escapes the admin context (e.g. an
  infolist preview surfaced to non-admin viewers).
- **`attachFiles` reuses `_uploads`.** No new route. `MarkdownField`
  stamps the upload URL onto its meta the same way `FileUpload` does
  via `pageData.uploadCtx`.
- **No `Block` / extension API.** RichTextField has one because
  Tiptap nodes can be user-extensible; markdown is its own
  user-extension layer (the user just types).
