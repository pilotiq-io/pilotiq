# CLAUDE.md

Guidance for Claude Code when working in this repository. Deep, package-specific notes live in `packages/<name>/CLAUDE.md` and are auto-loaded when working in that subtree.

---

## Project Overview

**Pilotiq** is an open-source admin panel builder for RudderJS — a polished, schema-driven admin runtime for the Node.js ecosystem.

- **Monorepo:** pnpm workspaces + Turborepo
- **Language:** TypeScript (strict, ESM, NodeNext)
- **npm scope:** `@pilotiq/*`
- **Status:** Early development
- **Pro extensions:** `@pilotiq-pro/{ai,collab,workspaces}` in the `pilotiq-pro` repo

### Packages

| Package | Description |
|---|---|
| `@pilotiq/pilotiq` | View-based admin panel using `@rudderjs/view` controller routes. Auto-generates Vike pages via Vite plugin. **The active product** — see `packages/pilotiq/CLAUDE.md`. |
| `@pilotiq/tiptap` | Tiptap rich-text adapter (`@pilotiq/pilotiq` companion). Replaces `@pilotiq/lexical`. |
| `@pilotiq/media` | Media library — file browser, uploads, preview, image conversions, MediaPickerField. |
| `@pilotiq/panels` | **Legacy.** Resource builder with vendored Vike pages. **Scheduled for deletion** once the `@pilotiq/pilotiq` migration is complete. Don't extend, don't extract — see "Legacy panels" below. |
| `@pilotiq/lexical` | **Legacy.** Lexical editor adapter — sunsets with panels. |

---

## Commands

All commands run from the **repo root**:

```bash
pnpm build        # Build all packages via Turbo
pnpm dev          # Watch mode for all packages
pnpm typecheck    # Type-check all packages
pnpm clean        # Remove all dist/ directories
```

Running the playgrounds:
```bash
cd playground              # panels (legacy) demo
pnpm dev                   # vike dev on :3001 (HMR :24679)

cd playground-pilotiq      # pilotiq demo
pnpm dev                   # vike dev on :3003 (HMR :24680 — conflicts with pilotiq-pro if both are up)
```

> Always run `pnpm build` from the **rudderjs** root before running a playground — framework packages must be compiled first.

Prisma (run from whichever playground you're in):
```bash
pnpm exec prisma generate --schema prisma/schema
pnpm exec prisma db push  --schema prisma/schema
```

Both playgrounds ship the **same Prisma schema files** so the hoisted `@prisma/client` (shared via pnpm) stays consistent. Each has its own `dev.db` (via `DATABASE_URL=file:./dev.db`). If schemas drift, whichever playground runs `prisma generate` last wins and clobbers the other's client — see pitfalls.

---

## Cross-Repo Wiring

All `@rudderjs/*` packages resolve to `link:../rudder/packages/<name>` via `pnpm.overrides` in the root `package.json`. No git submodules — sibling clones on disk.

```
~/Projects/
├── rudder/         # Framework
├── pilotiq/        # This repo (free panels)
└── pilotiq-pro/    # Pro extensions (AI, collab, workspaces)
```

---

## Playgrounds

| Playground | Port | HMR | Purpose |
|---|---|---|---|
| `rudderjs/playground` | 3000 | 24678 | Framework demo — zero pilotiq deps |
| `pilotiq/playground` | 3001 | 24679 | **Panels** demo (legacy) — panels + lexical + media |
| `pilotiq/playground-pilotiq` | 3003 | 24680 | **Pilotiq** demo — view-based panel + themeEditor |
| `pilotiq-pro/playground` | 3002 | 24680 | Full stack — framework + panels + AI + collab |

Split in April 2026 because the panels `@panel/@page` parametric route kept tentatively matching pilotiq URLs on the client, breaking SPA nav. Each package now gets its own isolated dev environment.

**Providers:**
- `playground/` (panels): log, database, session, hash, cache, auth, storage, localization, panels
- `playground-pilotiq/` (pilotiq): log, orm-prisma, session, cache, pilotiq

No AI / live / queue / mail / monitoring — those are framework demos in `rudderjs/playground`.

---

## TypeScript Conventions

- All packages extend `../../tsconfig.base.json`
- `experimentalDecorators: true` + `emitDecoratorMetadata: true`
- `module: "NodeNext"` — use `.js` extensions in all imports
- `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`

---

## Legacy panels (scheduled for deletion)

`@pilotiq/panels` is being replaced by `@pilotiq/pilotiq` and will be **deleted** once the new package is ready. Implications:

- **Don't preserve the panels API for back-compat.** No compatibility shims, no shared-package extraction — the migration target is a clean cut.
- **Don't add features.** Bug fixes only, and only when blocking the playground demo.
- Panels architecture (vendored pages, framework dependencies, vendor:publish workflow) lives entirely in `packages/panels/` — read its source if you need to touch it.
- After every edit to `packages/panels/pages/`, re-run `pnpm rudder vendor:publish --tag=pilotiq-pages --force`.
- `pnpm dev` hot-reloads panels frontend only; server handlers need `pnpm build` + restart.

---

## Common Pitfalls (cross-cutting)

- **Stale `dist/`:** Run `pnpm build` from rudderjs root, then pilotiq root. Per-package: `pnpm -F <name> build` or `cd packages/<name> && pnpm dev` for watch mode.
- **Prisma hoisted client is shared:** pnpm hoists `@prisma/client` into root `node_modules/.pnpm/`. Both playgrounds share one generated client. If `prisma/schema/*.prisma` files diverge, `prisma generate` in one clobbers the other's. Keep schemas identical (each has its own `dev.db`, so data is still isolated).
- **Prisma client cross-repo resolution:** `config/database.ts` passes `PrismaClient: PrismaClient as any` to fix it.
- **Port in use:** `lsof -ti :24679 -ti :3001 | xargs kill -9` (panels) or `lsof -ti :24680 -ti :3003 | xargs kill -9` (pilotiq).
- **Pilotiq-specific pitfalls** (Vite plugin, page generation, layout persistence, Tailwind setup) live in `packages/pilotiq/CLAUDE.md`.
