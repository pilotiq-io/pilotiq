# Plan: rudder ORM nested where groups (`whereGroup`)

> **Cross-repo plan** — this doc lives in pilotiq because the QueryBuilder
> v1 ships from here, but the actual implementation is in
> `~/Projects/rudder` (`@rudderjs/orm` + `@rudderjs/orm-prisma`). Move
> this file under `~/Projects/rudder/docs/plans/where-group.md` when an
> agent picks it up.

## Why

The pilotiq `QueryBuilderFilter` (Filament-style runtime filter) ships
v1 with **AND-only root**. End users compose multiple filter rules at
runtime against any pre-declared column, but they can't currently:

- Toggle the root operator to `OR`
- Build nested groups like `(A AND B) OR (C AND D)`
- Negate text matches (no `NOT LIKE`)

All three blockers point back at the same gap in `@rudderjs/orm`: the
`QueryBuilder` contract is a flat / sequential `where` + `orWhere`
chain with no callback-based grouping. Without parenthesized groups,
`orWhere` calls merge with every other unrelated where clause already
on the query (search predicate / tab predicate / sibling filters), so
`(A OR B)` would silently rewrite to `existing AND A OR B` — wrong.

The existing Prisma adapter (`packages/orm-prisma/src/index.ts`)
flattens all `where` clauses via `Object.assign()` and groups all
`orWhere` clauses into a top-level `OR: [...]` array — only one level
of grouping is supported.

This plan adds a third primitive: **`query.whereGroup(fn => …)`** that
runs a callback on a nested QueryBuilder and emits its accumulated
clauses inside a parenthesized AND group, with `orWhereGroup(fn)` as
the OR sibling.

Once `whereGroup` ships:
- pilotiq lifts `QueryBuilderFilter` to OR-root + nested groups in v2
- the `notContains` operator on `TextConstraint` can land too (with a
  parallel `NOT LIKE` plumb-through in the adapter — see Phase 2)
- any future pilotiq feature that needs DNF/CNF queries (saved
  segments, advanced search, audit reports) gets a clean substrate

## Scope

### Phase 1 — `whereGroup` / `orWhereGroup` callbacks

**Contract** (`packages/contracts/src/index.ts`):

```ts
interface QueryBuilder {
  // …existing
  whereGroup(callback: (q: QueryBuilder) => QueryBuilder | void): this
  orWhereGroup(callback: (q: QueryBuilder) => QueryBuilder | void): this
}
```

Callback receives a fresh `QueryBuilder` instance scoped to the group.
Inside the callback the user calls the same `where / orWhere /
whereGroup` methods to compose the group's contents. Returns the parent
query (chainable). Empty groups (no clauses added) are no-ops at SQL
level — adapter should skip the parens.

Equivalent SQL:

```ts
q.where('a', 1)
 .whereGroup(g => g.where('b', 2).orWhere('c', 3))
 .orWhere('d', 4)
// → WHERE a = 1 AND (b = 2 OR c = 3) OR d = 4
```

**Internal representation** — extend `WhereClause` with a `'group'`
discriminator:

```ts
type WhereClause =
  | { kind: 'simple'; column: string; operator: WhereOperator; value: unknown }
  | { kind: 'group'; mode: 'AND' | 'OR'; clauses: WhereClause[] }
```

`whereGroup` pushes a `{ kind: 'group', mode: 'AND', clauses: [...] }`
into `_wheres`; `orWhereGroup` pushes mode `'OR'` into `_orWheres`.
Existing flat clauses become `{ kind: 'simple', ... }` — backwards
compatible at the adapter-internal level.

**Prisma adapter** (`packages/orm-prisma/src/index.ts`):

`buildWhere()` recursion — for each clause:
- `simple` → `clauseToFilter` as today
- `group` → recurse over the inner clauses, wrap in
  `{ AND: [...] }` or `{ OR: [...] }`

The top-level `Object.assign()` flattening only applies to consecutive
`simple` AND-clauses; encountering a group writes a sibling key into
the AND-array.

**`whereHas` interaction** — `whereHas`'s constrain callback also gets
the new `whereGroup` method, so users can compose nested groups inside
relation predicates. The existing v1 limitation ("`orWhere` inside
constrain throws") is unrelated and stays.

### Phase 2 — `NOT LIKE` operator (small follow-up)

Add `'NOT LIKE'` to the `WhereOperator` union in
`packages/contracts/src/index.ts` and to the adapter's
`clauseToFilter` switch:

```ts
case 'NOT LIKE': {
  // mirror LIKE pattern detection (%foo% / foo% / %foo)
  // but emit Prisma's `not: { contains | startsWith | endsWith }`
  …
}
```

Mirror in pilotiq's `ModelWhereOperator` union
(`packages/pilotiq/src/orm/modelDefaults.ts`) so its
`TextConstraint.notContains` operator can land in v2.

### Phase 3 — Adapter-level transaction wrapper (deferred)

Out of scope for this plan but worth tracking — pilotiq's import,
`Repeater.relationship` parent + child diff, etc. all want a
`q.transaction(fn)` wrapper. Today they're partial-failure-soft.

## Tests

In `packages/orm/src/whereGroup.test.ts`:

- `whereGroup` with single inner clause emits `WHERE col1 = v1 AND (col2 = v2)`
- `whereGroup` with mixed AND + OR inner clauses parens correctly
- Nested `whereGroup` inside `whereGroup` (3 levels deep)
- `orWhereGroup` produces top-level OR with parens
- Empty `whereGroup` callback is a no-op (no `()` in emitted SQL)
- `whereGroup` composes with `whereHas` constrain callbacks
- Prisma adapter `buildWhere` produces `{ AND: [{a:1}, { OR: [...] }] }`

Existing `where / orWhere / whereHas` tests should be unchanged —
group support is additive.

## Migration

Zero breaking changes. Existing call sites keep working unchanged.
Adapter internals change but `WhereClause` is package-private — no
public API impact. Pilotiq stays on the existing `where / orWhere`
chain in v1; opts into `whereGroup` in QueryBuilder v2.

## Pilotiq integration (after both phases ship)

In `packages/pilotiq/src/filters/QueryBuilderFilter.ts`:

```ts
export function applyTreeToQuery(
  query:       ModelQuery,
  tree:        QueryBuilderTree,
  constraints: Constraint[],
): ModelQuery {
  if (tree.rules.length === 0) return query
  const map = new Map<string, Constraint>()
  for (const c of constraints) map.set(c.name, c)

  // Wrap the whole tree in a group so OR-root doesn't bleed into
  // surrounding clauses (search / tab predicate / sibling filters).
  return query.whereGroup(g => {
    for (const rule of tree.rules) {
      const c = map.get(rule.constraint)
      if (!c) continue
      try {
        if (tree.operator === 'or') {
          // For OR-root: push every rule via orWhere inside the group
          // so they all OR-combine within the parens.
          g = c.applyAsOr(g, rule.operator, rule.value)
        } else {
          g = c.apply(g, rule.operator, rule.value)
        }
      } catch { /* skip malformed rule */ }
    }
    return g
  })
}
```

`Constraint.apply` adds an optional `applyAsOr` sibling for the OR
case. Subclasses default to delegating through `orWhere(...)` instead
of `where(...)` — most operators are simple enough that a shared
helper handles the dispatch.

Nested groups (next-after-OR-root): tree shape grows a `'group'` rule
type:

```ts
type QueryBuilderRule =
  | { type: 'rule'; constraint: string; operator: …; value?: … }
  | { type: 'group'; operator: 'and' | 'or'; rules: QueryBuilderRule[] }
```

`applyTreeToQuery` recurses on the group case, calling `whereGroup`
again. Renderer adds an "Add group" button alongside the existing
"Add condition" button.

## Estimated effort

- Phase 1 (`whereGroup` core + Prisma adapter): ~400 LOC + tests
- Phase 2 (`NOT LIKE`): ~30 LOC + 2 tests
- Pilotiq follow-up (V2 `QueryBuilderFilter` with OR + nested):
  ~500 LOC (new tree schema + renderer recursion + tests)

## References

- Pilotiq guide: `~/Projects/pilotiq/docs/guide/query-builder.md`
- Pilotiq filter source:
  `~/Projects/pilotiq/packages/pilotiq/src/filters/QueryBuilderFilter.ts`
- Existing Prisma adapter `buildWhere`:
  `~/Projects/rudder/packages/orm-prisma/src/index.ts:258-283`
- Existing v1 limitation note (`orWhere` in `whereHas` constrain):
  `~/Projects/rudder/packages/orm/CLAUDE.md` + `CHANGELOG.md`
