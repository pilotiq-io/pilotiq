# @pilotiq/tiptap

Tiptap rich-text adapter for `@pilotiq/pilotiq`. Adds a `RichTextField` with always-on toolbar, slash menu (`/`), draggable blocks, and a custom-block API.

```bash
pnpm add @pilotiq/tiptap \
  @tiptap/core @tiptap/pm @tiptap/react @tiptap/starter-kit @tiptap/suggestion \
  @tiptap/extension-link @tiptap/extension-placeholder \
  @tiptap/extension-underline @tiptap/extension-subscript @tiptap/extension-superscript \
  @tiptap/extension-text-align @tiptap/extension-text-style @tiptap/extension-color \
  @tiptap/extension-highlight
```

```ts
// Once, in your client entry.
import { registerTiptap } from '@pilotiq/tiptap'
registerTiptap()
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
    ['undo', 'redo'],
  ])
  .blocks([
    Block.make('callout').label('Callout').icon('💡').schema([
      TextField.make('title'),
      TextareaField.make('content').required(),
    ]),
  ])
```

Full reference: [docs/packages/tiptap.md](../../docs/packages/tiptap.md).
