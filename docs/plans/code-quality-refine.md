# Code Quality Refine

Targeted cleanup of code-quality debt found during the 2026-04-11 audit. Scoped to safe, mechanical changes that improve type safety without changing runtime behavior.

## Scope (in)

- Remove dead private state in field subclasses
- Replace `as any` casts at framework integration points with shared typed helpers
- Type the `pageContext` / authenticated `req` shapes used across vendored pages and handlers
- Add a `pnpm lint` workflow + run it in CI

## Scope (out)

- Splitting vendored UI files (`SchemaDataView.tsx`, `SchemaForm.tsx`, etc.) — high effort, low payoff unless we're actively editing them
- Refactoring the schema builder hierarchy — `Field` is already a clean abstract base; subclasses are short and idiomatic
- Removing `as any` from tests — mock typing is acceptable noise
- Removing dynamic-import escape hatches that gate optional pro packages — that pattern is the open-core seam, not a bug

---

## Phase 1 — Dead state in field subclasses

Several `Field` subclasses declare private fields that are written but never read; the values are mirrored to `_extra`, which is what `toMeta()` actually serializes.

**Files to edit:**

| File | Dead members |
|---|---|
| `packages/panels/src/schema/fields/TextField.ts:5-7` | `_minLength`, `_maxLength`, `_placeholder` |
| `packages/panels/src/schema/fields/NumberField.ts:5-7` | `_min`, `_max`, `_step` |
| `packages/panels/src/schema/fields/TextareaField.ts:5` | `_rows` |
| `packages/panels/src/schema/fields/RelationField.ts:5` | `_resourceSlug` (verify) |

**Verification:** grep each symbol across `packages/panels/src` and `packages/panels/pages` to confirm zero readers before deletion. Run `pnpm typecheck` + `pnpm test` after each file.

**Risk:** none — protected fields with no readers cannot affect behavior.

---

## Phase 2 — Typed dynamic-import helper

There are ~15 sites that do `await import(/* @vite-ignore */ pkg) as any` to load optional `@rudderjs/*` packages. Each site re-implements the cast and then narrows ad-hoc.

**Add:** `packages/panels/src/util/loadOptional.ts`

```ts
export async function loadOptional<T>(pkg: string): Promise<T | undefined> {
  try {
    return (await import(/* @vite-ignore */ pkg)) as T
  } catch {
    return undefined
  }
}
```

**Replace at these sites** (from grep `as any` audit):

- `packages/panels/src/handlers/meta/shared.ts:50`
- `packages/panels/src/handlers/meta/formRoutes.ts:104`
- `packages/panels/src/handlers/meta/tableRoutes.ts:317,372`
- `packages/panels/src/handlers/versionRoutes.ts:211`
- `packages/panels/src/resolvers/resolveForm.ts:145`
- `packages/panels/src/handlers/panelMiddleware.ts:17`
- `packages/panels/pages/_hooks/useCollaborativeForm.ts:133,199,225`

Each replacement supplies a narrow `interface` for the imported surface (e.g. `interface BroadcastModule { broadcast(...): void }`). The cast moves from "every use site" to "one declaration per consumer".

**Risk:** low — same runtime behavior, narrower types. Catches package-shape drift earlier.

---

## Phase 3 — `PageContext` + `AuthenticatedRequest` types

The vendored pages (`pages/@panel/**/+data.ts`, `+guard.ts`) and a few handlers cast `req`/`pageContext` to `any` to read `user`, `headers.cookie`, `session`, etc. This is the largest concentrated cluster of unsafe casts.

**Add:** `packages/panels/src/types/context.ts`

```ts
export interface PanelUser {
  id: string | number
  role?: string
  [key: string]: unknown
}

export interface AuthenticatedRequest {
  user?: PanelUser
  session?: { put(key: string, value: unknown): void }
  raw?: { [key: string]: unknown }
}

export interface PanelPageContext {
  headers?: { cookie?: string; [key: string]: string | undefined }
  user?: PanelUser
}
```

**Replace at:**

- `packages/panels/src/handlers/shared/context.ts:7`
- `packages/panels/src/handlers/notificationRoutes.ts:23`
- `packages/panels/src/handlers/panelMiddleware.ts:13,41`
- `packages/panels/src/handlers/meta/formRoutes.ts:49`
- `packages/panels/src/handlers/meta/tabsRoutes.ts:24`
- `packages/panels/src/handlers/meta/tableRoutes.ts:110`
- `packages/panels/pages/@panel/+guard.ts:42-43`
- `packages/panels/pages/_lib/buildPanelContext.ts:31`
- `packages/panels/pages/@panel/globals/@global/+data.ts` and `pages/@panel/resources/@resource/**/+data.ts` for the `ResourceClass.model as any` pattern (separate type for `ResourceConstructor`)

**Risk:** medium — touches the cross-cutting auth flow. Run the playground end-to-end after the change (login, edit a resource, save, version restore).

---

## Phase 4 — Lint step + CI

Currently no lint runs in CI. Add:

1. Root `pnpm lint` script that delegates to each package's `lint` (panels already has one; lexical and media don't).
2. Add `lint` script + ESLint config to `packages/lexical` and `packages/media` matching panels' setup.
3. New `lint` job in `.github/workflows/ci.yml` (separate job, runs in parallel with typecheck).

**Risk:** low — purely additive. Expect a first-pass batch of fixable lint findings; address in the same PR.

---

## Execution order

Phases are independent and can land as separate commits/PRs:

1. **Phase 1** first — smallest, zero risk, builds confidence in the test suite for later phases.
2. **Phase 4** second — get lint into CI before adding more code, so Phase 2/3 land already-linted.
3. **Phase 2** third — mechanical replacement, contained blast radius.
4. **Phase 3** last — needs end-to-end verification in the playground.

## Done criteria

- `pnpm typecheck` clean
- `pnpm test` green
- `pnpm lint` green (after Phase 4)
- Playground smoke test: login → list articles → edit → save → version restore
- `as any` count in `packages/panels/src` (excluding tests) drops from ~35 to <10
