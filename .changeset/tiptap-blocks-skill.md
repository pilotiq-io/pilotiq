---
'@pilotiq/tiptap': patch
---

feat(tiptap): ship `pilotiq-tiptap-blocks` boost skill

First on-demand skill for `@pilotiq/tiptap`. `SKILL.md` declares `appliesTo: ['@pilotiq/tiptap']` so `@rudderjs/boost`'s `boost:install` only writes it to `.ai/skills/` when the consumer has `@pilotiq/tiptap` installed. Trigger heuristics scope the deep rules to specific authoring contexts — defining `Block.make(...)` types, wiring mentions / merge tags, customizing the toolbar, debugging slash-menu or drag-handle behavior.

Three rule files under `boost/skills/pilotiq-tiptap-blocks/rules/`:

- **`custom-blocks.md`** — `Block.make().schema([…])`, side panel V2 UX, field-type coverage inside a block (primitives, JSON-encoded, repeater / builder), `Mod-E` / `Esc` / focus trap / width memory, common authoring mistakes (including the `'block'` name collision).
- **`slash-menu-and-mentions.md`** — slash menu groups, capture-phase keys, `MentionProvider` (static + async via `itemsUsing`), merge tags, mentions inside Repeater / Builder rows.
- **`toolbar-and-extensibility.md`** — three customization styles (`toolbarButtons` / `enable+disableToolbarButtons` / hide chrome), the recognized button-id union, opt-in primitives (`lead` / `small` / `details` / `grid`), file attachments, drag-handle's three-step drop dance, Tiptap module identity (`resolve.dedupe`), toolbar-driven slash entries.

Mirrors the shape established by `pilotiq-resource` / `pilotiq-fields` / `pilotiq-relations`.
