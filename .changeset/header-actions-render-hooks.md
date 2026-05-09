---
"@pilotiq/pilotiq": minor
---

Add 8 header-actions render-hook slots — `panels::resource.pages.{list-records,create-record,edit-record,view-record}.header.actions.{before,after}`. Plugins (AI assistants, collab presence, workspace switchers, custom toolbar widgets) can now contribute action chips alongside the built-in `Create / View / Edit / Delete / Save` buttons on resource pages without forking page renderers. Contributions splice into the first top-level page heading's children; only `Action` / `ActionGroup` elements end up rendered (matches the existing heading-children filter). Drops silently when a custom page header lacks a `Heading` anchor — fall back to `panels::page.start` for toolbar-style mounts in that case.
