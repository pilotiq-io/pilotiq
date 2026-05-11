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
| `@pilotiq/tiptap` | Tiptap rich-text adapter — `RichTextField` with custom blocks, mention/merge tags, slash menu. |
| `@pilotiq/codemirror` | CodeMirror 6 adapter — `CodeEditorField` for syntax-highlighted code input. |
| `@pilotiq/recharts` | Recharts widget adapter — `Chart` element for the dashboard / resource header / footer slots. |

---

## Commands

All commands run from the **repo root**:

```bash
pnpm build        # Build all packages via Turbo
pnpm dev          # Watch mode for all packages
pnpm typecheck    # Type-check all packages
pnpm clean        # Remove all dist/ directories
```

Running the playground:
```bash
cd playground      # pilotiq demo
pnpm dev                   # vike dev on :3003 (HMR :24680 — conflicts with pilotiq-pro if both are up)
```

> Always run `pnpm build` from the **rudderjs** root before running the playground — framework packages must be compiled first.

Prisma (run from `playground/`):
```bash
pnpm exec prisma generate --schema prisma/schema
pnpm exec prisma db push  --schema prisma/schema
```

---

## Cross-Repo Wiring

All `@rudderjs/*` packages resolve to `link:../rudder/packages/<name>` via `pnpm.overrides` in the root `package.json`. No git submodules — sibling clones on disk.

```
~/Projects/
├── rudder/         # Framework
├── pilotiq/        # This repo (open-source admin panel)
└── pilotiq-pro/    # Pro extensions (AI, collab, workspaces)
```

---

## Playgrounds

| Playground | Port | HMR | Purpose |
|---|---|---|---|
| `rudderjs/playground` | 3000 | 24678 | Framework demo — zero pilotiq deps |
| `pilotiq/playground` | 3003 | 24680 | Pilotiq demo — view-based panel + themeEditor |
| `pilotiq-pro/playground` | 3002 | 24680 | Full stack — framework + pilotiq + AI + collab |

**Providers** (`playground/`): log, orm-prisma, session, cache, pilotiq.

No AI / live / queue / mail / monitoring — those are framework demos in `rudderjs/playground`.

> **Archived:** the legacy `@pilotiq/panels` resource builder + its companion `@pilotiq/lexical` rich-text adapter + `@pilotiq/media` library + the panels playground (port 3001) were removed in 2026-05. The full tree lives on the `archive/legacy-panels` branch — `git checkout archive/legacy-panels -- packages/panels` to recover any file.

---

## TypeScript Conventions

- All packages extend `../../tsconfig.base.json`
- `experimentalDecorators: true` + `emitDecoratorMetadata: true`
- `module: "NodeNext"` — use `.js` extensions in all imports
- `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`

---

## Common Pitfalls (cross-cutting)

- **Stale `dist/`:** Run `pnpm build` from rudderjs root, then pilotiq root. Per-package: `pnpm -F <name> build` or `cd packages/<name> && pnpm dev` for watch mode.
- **Prisma client cross-repo resolution:** `config/database.ts` passes `PrismaClient: PrismaClient as any` to fix it.
- **Port in use:** `lsof -ti :24680 -ti :3003 | xargs kill -9`.
- **Pilotiq-specific pitfalls** (Vite plugin, page generation, layout persistence, Tailwind setup) live in `packages/pilotiq/CLAUDE.md`.
- **Adapter peer ranges (`@pilotiq/{codemirror,recharts,tiptap}`):** declare `peerDependencies."@pilotiq/pilotiq"` as the literal range `">=0.6.0 <1.0.0"`, **not** `workspace:^`. `workspace:^` publishes as `^<version>`, which under pre-1.0 caret breaks on every pilotiq minor — and changesets' peer-cascade hardcodes a MAJOR bump on dependents when the range breaks (`@changesets/assemble-release-plan` source verified). devDep stays on `workspace:^` for local resolution. Adding a new adapter? Mirror this shape. Background in `~/.claude/projects/-Users-sleman-Projects-pilotiq/memory/project_pilotiq_npm_release.md`.
