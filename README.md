# Pilotiq

> The open-source admin and CMS for [RudderJS](https://github.com/rudderjs/rudder), with a built-in agent.

Pilotiq is the Filament-meets-VS-Code admin builder for the Node.js ecosystem. Define resources, fields, and forms with a Laravel-style API, then let the built-in agent help you write and edit content alongside the user.

**Status:** Early development. Extraction from [`rudderjs/rudder`](https://github.com/rudderjs/rudder) in progress — see [`docs/plans/pilotiq-extraction-plan.md`](./docs/plans/pilotiq-extraction-plan.md).

```ts
import { Panel } from '@pilotiq/panels'
import { ArticleResource } from './resources/ArticleResource.js'

export const adminPanel = Panel.make('admin')
  .path('/admin')
  .resources([ArticleResource])
```

---

## What's in this repo

| Package | Description |
|---|---|
| [`@pilotiq/panels`](./packages/panels) | Resource builder, forms, fields, schema, registries, theming, i18n, server-side handlers |
| [`@pilotiq/lexical`](./packages/lexical) | Lexical rich-text editor adapter — works in local-only mode by default |
| [`@pilotiq/media`](./packages/media) | Media library + media picker field |
| [`@pilotiq/workspaces`](./packages/workspaces) | Workspaces resource + canvas/chat field types |
| [`playground/`](./playground) | Free pilotiq dev fixture — panels + lexical (local-only) + media + workspaces on port 3001. No pro deps. |

These packages are extracted from `rudderjs/rudder`'s `packages/panels`, `packages/panels-lexical`, `packages/media`, and `packages/workspaces`. The extraction is complete (Phase 2–5 DONE). See `docs/plans/phase-6-playground-extraction.md` for the three-playground split.

---

## Pro features

Pilotiq is open core. The free packages above give you a complete admin/CMS. The pro packages add:

| Package | Adds |
|---|---|
| `@pilotiq-pro/ai` | PanelAgent runtime, chat sidebar, AI field actions, sub-agent dispatch, conversation persistence — the "VS Code for content" experience |
| `@pilotiq-pro/collab` | Yjs-based real-time collaboration: multi-user cursors, presence, persistence |

Pro packages are commercial — see [pilotiq.io](https://pilotiq.io) for licensing. They live in a separate private repo at `pilotiq-io/pilotiq-pro`.

---

## Relationship to RudderJS

Pilotiq is built on top of [RudderJS](https://github.com/rudderjs/rudder), the Laravel-inspired Node.js framework. You'll need:

- `@rudderjs/core` — DI container, application bootstrap
- `@rudderjs/router` — HTTP routing
- `@rudderjs/orm` — ORM (Prisma or Drizzle)
- `@rudderjs/auth` — auth
- Plus optional packages for cache, storage, queues, mail, etc.

Pilotiq's packages declare these as peer dependencies. Install both, register the panel provider in your RudderJS app's `bootstrap/providers.ts`, and you're done.

---

## Development

This is a pnpm + Turborepo monorepo.

```bash
pnpm install
pnpm build
pnpm test
pnpm dev
```

For active framework development across both repos (`rudderjs/rudder` + `pilotiq-io/pilotiq`), see [`docs/development.md`](./docs/development.md) for the `pnpm.overrides` recipe.

---

## License

MIT © Suleiman Shahbari
