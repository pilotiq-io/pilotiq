---
'@pilotiq/tiptap': patch
'@pilotiq/codemirror': patch
'@pilotiq/recharts': patch
---

feat(adapters): ship `boost/guidelines.md` for `@rudderjs/boost` discovery

Phase C of the boost-producer rollout. Each adapter now ships its own `boost/guidelines.md` so consumer Rudder apps with `@rudderjs/boost` installed pick them up automatically via `rudder boost:install`. Per-agent config files (`CLAUDE.md` / `.cursorrules` / `AGENTS.md` / etc.) include all installed adapter guidelines in the concatenated body.

- **`@pilotiq/tiptap`** — RichTextField + Block (custom-block side panel), toolbar customization, mentions (static + async) + merge tags, file attachments, JSON vs HTML storage, server-side rendering via `renderRichTextToHtml`.
- **`@pilotiq/codemirror`** — CodeEditorField + Code alias, language registry (`registerCodeLanguage` / `codeEditor({ languages })`), theming (auto / light / dark), reactive integration, validation, common language packs.
- **`@pilotiq/recharts`** — Chart class + fluent form, chart types (line / bar / pie / doughnut), Chart.js-shaped data normalized to Recharts internally, per-chart filter dropdown, polling, resource header/footer placement, escape hatch via `static options`.

Each guideline closes with a "Common Pitfalls" section distilled from project memory + a "Key Imports" reference. No skills shipped in this phase — adapter usage is single-surface enough that the always-loaded `guidelines.md` covers it; skill modules can follow if a consumer asks.
