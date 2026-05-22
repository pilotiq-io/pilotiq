---
'@pilotiq/pilotiq': patch
---

feat(pilotiq): ship `boost/guidelines.md` for `@rudderjs/boost` discovery

Consumer Rudder apps with `@rudderjs/boost` installed now pick up `@pilotiq/pilotiq` AI coding guidelines automatically. Running `rudder boost:install` in the consumer writes the contents to `.ai/guidelines/pilotiq.md`, and the per-agent config files (`CLAUDE.md` / `.cursorrules` / `AGENTS.md` / etc.) include them in the concatenated guideline body.

The guidelines cover Resource definition (with `static model` auto-fill), folder-per-resource layout, the form-field catalog + common setters, layout primitives (Section / Tabs / Group / Wizard / Split / Fieldset), tables (columns + filters + groups + actions + reorder), Action with the four dispatch modes and modal-form variant, Page base classes (`ListPage` / `CreatePage` / `EditPage` / `ViewPage`) with override hooks, authorization via `Pilotiq.user()` + `can*` statics, Globals, Relations (`RelationManager` + `Repeater.relationship()`), reactive fields, theming, common pitfalls, and the key import surface.

Phase A of the boost-producer rollout — skills (`boost/skills/<name>/SKILL.md`) follow in subsequent releases. Adapter packages (`@pilotiq/tiptap` / `@pilotiq/codemirror` / `@pilotiq/recharts`) ship their own guidelines + `appliesTo`-gated skills separately.
