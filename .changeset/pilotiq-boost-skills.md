---
'@pilotiq/pilotiq': patch
---

feat(pilotiq): ship boost skills — pilotiq-resource, pilotiq-fields, pilotiq-relations

Phase B of the boost-producer rollout. Adds three task-specific skill modules under `packages/pilotiq/boost/skills/`:

- **pilotiq-resource** — `SKILL.md` + 3 rules: defining-resources, page-overrides, authorization
- **pilotiq-fields** — `SKILL.md` + 3 rules: field-catalog (24 field types), validation (built-ins + `unique` + `distinct`), reactive-fields (`live` + `afterStateUpdated` + `$get`/`$set`)
- **pilotiq-relations** — `SKILL.md` + 2 rules: relation-managers (hasMany / morph / M2M), repeater-relationship (`Repeater.relationship` + `Builder.relationship`)

Each SKILL.md declares `appliesTo: ['@pilotiq/pilotiq']` so `@rudderjs/boost`'s `boost:install` only writes them to `.ai/skills/` when the consumer has `@pilotiq/pilotiq` installed. Triggers are scoped to specific work contexts — defining a Resource, adding a form field, wiring a relation — so AI agents load the deeper rule files on-demand rather than always-on.

Phase C (adapter packages — `@pilotiq/tiptap` / `@pilotiq/codemirror` / `@pilotiq/recharts`) and the remaining four skill candidates (pilotiq-actions, pilotiq-widgets, pilotiq-theme, pilotiq-vite-plugin) follow in subsequent releases.
