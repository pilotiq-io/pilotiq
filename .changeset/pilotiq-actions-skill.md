---
'@pilotiq/pilotiq': patch
---

feat(pilotiq): ship `pilotiq-actions` boost skill — Phase B residual #1

First of the four still-open Phase B skill candidates. `SKILL.md` declares `appliesTo: ['@pilotiq/pilotiq']` so `@rudderjs/boost`'s `boost:install` writes it under `.ai/skills/` only when the consumer has `@pilotiq/pilotiq` installed. Trigger scopes to specific action-authoring contexts — adding header/row/bulk buttons, wiring a modal-form action, customizing per-row visibility, reaching for a built-in factory.

Three rule files under `boost/skills/pilotiq-actions/rules/`:

- **`dispatch-modes.md`** — 4 mutually-exclusive modes (`href` / `method` / `handler` / `submit`), modal-form as a flavor of handler, return shape, `ctx` shape, 12 modal chrome setters, `.confirm()` + `.formField()` interactions.
- **`visibility-and-authorization.md`** — 4 conditional setters (`visible / hidden / disabled / authorize`), `ActionVisibilityContext`, fail-closed semantics (opposite of layout-visible), per-row gating cost model, composing with Resource policies.
- **`factories.md`** — 25 pre-built factories (`create / edit / view / delete / replicate / restore / forceDelete / markAsRead`, bulk variants, `import / export`, relation* variants including M2M `attach / detach`), `ReplicateOptions` with `getCreatedNotificationTitle / getRedirectUrl` callbacks, when to skip factories for compound flows.

Mirrors the shape established by `pilotiq-resource` / `pilotiq-fields` / `pilotiq-relations` / `pilotiq-tiptap-blocks`.

Remaining Phase B residuals (lower priority — `guidelines.md` already covers most of what they'd add): `pilotiq-widgets`, `pilotiq-theme`, `pilotiq-vite-plugin`.
