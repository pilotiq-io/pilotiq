# @pilotiq/lexical

Lexical rich-text editor adapter for `@pilotiq/panels`. Provides rich text editing, real-time collaborative plain text, block editor with slash commands, and AI integration.

## Installation

```bash
pnpm add @pilotiq/lexical
```

## Setup

Register the plugin on your panel:

```ts
// app/Panels/AdminPanel.ts
import { Panel } from '@pilotiq/panels'
import { panelsLexical } from '@pilotiq/lexical'

export default Panel.make('admin')
  .use(panelsLexical())
  .resources([/* ... */])
```

The plugin registers its components using the `_lexical:` prefix (`_lexical:richcontent`, `_lexical:collaborativePlainText`) to avoid collision with the default `FieldInput` registry.

## Usage

### RichContentField

Full rich-text editor with configurable toolbar, slash commands, and floating link editor:

```ts
import { RichContentField } from '@pilotiq/lexical'

Resource.make('Article')
  .form((form) => [
    form.text('title'),
    RichContentField.make('body')
      .toolbar('default')
      .collaborative(),
  ])
```

### Toolbar Profiles

Control the toolbar complexity per field:

| Profile | Description |
|---|---|
| `document` | Full toolbar -- headings, lists, quotes, code blocks, images, tables |
| `default` | Standard editing -- headings, lists, bold, italic, links |
| `simple` | Reduced set -- bold, italic, underline, links |
| `minimal` | Inline formatting only -- bold, italic |
| `none` | No toolbar -- content only |

```ts
RichContentField.make('notes').toolbar('simple')
RichContentField.make('content').toolbar('document')
```

### CollaborativePlainText

Real-time collaborative plain text field backed by Yjs:

```ts
import { CollaborativePlainText } from '@pilotiq/lexical'

Resource.make('Document')
  .form((form) => [
    CollaborativePlainText.make('content'),
  ])
```

### Block Editor

The rich-text editor includes a slash command menu for inserting blocks. Type `/` to open the menu:

- Headings (H1, H2, H3)
- Bullet list, numbered list
- Quote, code block
- Horizontal rule
- Custom blocks registered by plugins

### Floating Toolbar

Selecting text reveals a floating toolbar with formatting options and an "Ask AI" button. The AI button opens the panels chat sidebar with the selected text as context, constrained to that specific field.

### useYjsCollab Hook (open-core seam)

`useYjsCollab` is exported from `@pilotiq/lexical` but ships as a **stub** by default. The free package has zero Yjs runtime — `yjs`, `y-websocket`, and `y-indexeddb` are not dependencies, and calling `useYjsCollab(...)` in the default build returns a local-only state shape (`collabReady: false`, no provider).

Real collaboration is delivered by **[`@pilotiq-pro/collab`](https://pilotiq.io)** (commercial). Installing and registering it does two things:

1. `CollabServiceProvider` enables the `websocket` + `indexeddb` entries in `CollabSupportRegistry`, so `Field.persist(['websocket'])` schema calls stop throwing.
2. `<CollabProvider>` overrides `CollabHookContext` (also exported from `@pilotiq/lexical`) with the real `useYjsCollabImpl`, which spins up a per-editor `Y.Doc` + `WebsocketProvider` + `IndexeddbPersistence` on mount.

The `@pilotiq/panels` layout auto-wraps the panel tree in `<CollabProvider>` via dynamic import when `@pilotiq-pro/collab` is installed, so the only step apps take is registering `CollabServiceProvider` in their bootstrap:

```ts
// bootstrap/providers.ts
import { CollabServiceProvider } from '@pilotiq-pro/collab'

export default [
  // ...
  CollabServiceProvider,
]
```

Without `@pilotiq-pro/collab` installed: `LexicalEditor` renders in local-only mode (no `CollaborationPlugin`), and `CollaborativePlainText` shows its read-only fallback. `Field.persist(['websocket'])` throws a helpful build-time error pointing apps here.

Rationale: the free package guarantees a zero-Yjs dependency surface and a fully-functional local-only Lexical editor. Multi-user collab is the paid upgrade.

See `pilotiq/docs/plans/phase-5-collab-extraction.md` for the open-core split rationale and the five mechanism options that were evaluated.

### SelectionAiPlugin

Adds an "Ask AI" button when text is selected in `CollaborativePlainText` fields:

```ts
CollaborativePlainText.make('content')
  // SelectionAiPlugin is enabled automatically
```

Selected text is sent to the AI chat sidebar with field context, enabling field-locked `edit_text` operations.

## Notes

- `@pilotiq/panels` must NOT depend on `@pilotiq/lexical` -- the plugin is loaded client-side via dynamic import to avoid circular dependencies.
- Registration keys use the `_lexical:` prefix to separate from the core field registry.
- IndexedDB provider must be created before WebSocket provider to prevent server rooms from overwriting local content (enforced inside `@pilotiq-pro/collab`'s `useYjsCollabImpl`).
- Imperative editor refs (`EditorRefPlugin.setContent()`) are used for version restore -- writes propagate through the Yjs binding to all connected users.
- The free package has no `yjs` / `y-websocket` / `y-indexeddb` runtime. `YjsCollabRef.doc` and `YjsCollabRef.Y` are typed as `unknown` and cast at the use site (see `SeedPlugin` in `LexicalEditor.tsx` / `CollaborativePlainText.tsx`).
- Collaborative fields each get their own Y.Doc and WebSocket room, named `panel:{resource}:{recordId}:{type}:{fieldName}`.
