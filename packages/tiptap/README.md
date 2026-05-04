# @pilotiq/tiptap

Tiptap rich-text adapter for `@pilotiq/pilotiq`. Adds a `RichTextField` with always-on toolbar, slash menu (`/`), draggable blocks, and a custom-block API.

```bash
pnpm add @pilotiq/tiptap \
  @tiptap/core @tiptap/pm @tiptap/react @tiptap/starter-kit @tiptap/suggestion \
  @tiptap/extension-link @tiptap/extension-placeholder \
  @tiptap/extension-underline @tiptap/extension-subscript @tiptap/extension-superscript \
  @tiptap/extension-text-align @tiptap/extension-text-style @tiptap/extension-color \
  @tiptap/extension-highlight @tiptap/extension-image
```

```ts
// Once, in your client entry. Wires the editor for `RichTextField` AND the
// server-side rich-text renderer used by `TextEntry` / `Table` columns.
import { registerTiptap } from '@pilotiq/tiptap'
registerTiptap()
```

```ts
// Render Tiptap content to HTML on the server. Pure function — no DOM,
// no Tiptap runtime. Safe to call from any server context.
import { renderRichTextToHtml } from '@pilotiq/tiptap'
renderRichTextToHtml({ type: 'doc', content: [...] })
```

```ts
import { RichTextField, Block } from '@pilotiq/tiptap'

RichTextField.make('body')
  .label('Body')
  .placeholder('Start writing…')
  .toolbarButtons([
    ['bold', 'italic', 'underline', 'strike', 'link'],
    ['h2', 'h3'],
    ['textColor', 'highlight'],
    ['bulletList', 'orderedList'],
    ['attachFiles'],
    ['undo', 'redo'],
  ])
  .resizableImages()
  .fileAttachmentsAcceptedFileTypes(['image/*'])
  .fileAttachmentsMaxSize(2_000_000)
  .blocks([
    Block.make('callout').label('Callout').icon('💡').schema([
      TextField.make('title'),
      TextareaField.make('content').required(),
    ]),
  ])
```

`attachFiles` reuses the panel's `UploadAdapter` (`Pilotiq.uploads({ adapter })`); the button is stripped server-side when no adapter is wired.

Full reference: [docs/packages/tiptap.md](../../docs/packages/tiptap.md).
