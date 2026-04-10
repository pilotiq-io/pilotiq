# Pilotiq — Architecture Document
> Open-source admin panel builder for RudderJS — Filament meets VS Code.

---

## Philosophy

| Principle | Description |
|-----------|-------------|
| **Resource-first** | Every admin screen maps to a Model via a Resource class. |
| **Schema-driven** | Fields, columns, filters, actions — all declared in code, rendered automatically. |
| **Extensible** | Panel.use() plugins, custom fields, registerElement(), theme presets. |
| **Framework-native** | Built on @rudderjs/core — uses the same DI, ORM, auth, and routing primitives. |

---

## Monorepo Structure

```
pilotiq/
├── packages/
│   ├── panels/             # Resource builder, forms, fields, schema elements,
│   │                       #   registries, theming, i18n, handlers, dashboard,
│   │                       #   widgets, wizard, import, version history
│   │   └── pages/          # Vendored React pages (vendor:publish source)
│   ├── lexical/            # Lexical rich-text editor adapter — RichContentField,
│   │                       #   block editor, local-only by default
│   └── media/              # Media library — file browser, uploads, preview,
│                           #   image conversions, MediaPickerField
├── docs/                   # Documentation
└── playground/             # Free pilotiq dev fixture (port 3001)
                            #   Panels + Lexical + Media, no AI, no collab
```

---

## Package Details

### @pilotiq/panels

The core admin panel builder. Provides:

- **Resources**: CRUD views with fields, columns, filters, actions
- **Schema elements**: Field (20+ types), Column, Section, Tabs, Form, Table, List, Stats, Chart, Dashboard, Widget, Wizard, Step, RelationManager, Import
- **Filters**: Select, Search, Date, Boolean, Number, Query
- **Actions**: Action (.form()), ActionGroup, headerActions, bulk actions
- **Themes**: 4 presets, colors, fonts, icons, themeEditor()
- **Notifications**: Panel.notifications() widget
- **Plugins**: Panel.use() — extensible with lexical, media, etc.
- **Vendored pages**: React UI published to apps via `pnpm rudder vendor:publish --tag=pilotiq-pages --force`

### @pilotiq/lexical

Lexical rich-text editor adapter for panels:

- RichContentField — block-aware rich text editor
- Local-only by default (no yjs dependency)
- Collab mode enabled by @pilotiq-pro/collab (pro tier)
- registerLexical() — client-side field registration

### @pilotiq/media

Media library plugin for panels:

- File browser, uploads, image preview
- Image conversions (resize, crop via @rudderjs/image)
- MediaPickerField for resource forms
- Integrates with @rudderjs/storage

---

## Dependency Flow

```
@rudderjs/* (framework)
  └── @pilotiq/panels          Resource builder, schema, theming
       ├── @pilotiq/lexical     Rich text editor (Panel.use(panelsLexical()))
       └── @pilotiq/media       Media library (Panel.use(media(config)))
```

**Requires**: `@rudderjs/{core,router,orm,auth}` + optional packages (cache, localization, storage).

**Pro extensions** (pilotiq-pro repo):
- `@pilotiq-pro/ai` — PanelAgent runtime, chat sidebar, AI field actions
- `@pilotiq-pro/collab` — Yjs real-time collab, multi-user cursors, persistence

---

## Cross-Repo Wiring

All `@rudderjs/*` packages resolve to `link:../rudderjs/packages/<name>` via `pnpm.overrides` in the root `package.json`. No git submodules — sibling clones on disk.

```
~/Projects/
├── rudderjs/       # Framework (pnpm.overrides: none)
├── pilotiq/        # Free panels (pnpm.overrides: @rudderjs/* → link:../rudderjs/...)
└── pilotiq-pro/    # Pro extensions (pnpm.overrides: @rudderjs/* + @pilotiq/* → links)
```

---

## Playground

Port 3001, HMR 24679. Pure free pilotiq — no AI, no collab, no pro packages.

**Providers**: log, database, session, hash, cache, auth, storage, localization, panels.

```bash
cd ~/Projects/rudderjs && pnpm build     # build framework first
cd ~/Projects/pilotiq/playground && pnpm dev
```
