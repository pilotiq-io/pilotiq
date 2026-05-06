# QueryBuilder filter

`QueryBuilderFilter` lets end users compose multiple filter rules at
runtime against any pre-declared column, without requiring a developer
to add a per-column `Filter` for each query they want to enable.

It's a generalisation of `FormFilter`: instead of a fixed sub-form, the
user adds + removes condition rows, picks an operator per row, and
fills in the value. The whole tree round-trips through a single URL key.

## Quick example

```ts
import {
  QueryBuilderFilter,
  TextConstraint, NumberConstraint, DateConstraint,
  SelectConstraint, BooleanConstraint,
} from '@pilotiq/pilotiq'

table.filters([
  QueryBuilderFilter.make('runtime')
    .label('Runtime filter')
    .constraints([
      TextConstraint.make('title'),
      TextConstraint.make('slug'),
      SelectConstraint.make('status').options([
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
      ]),
      BooleanConstraint.make('featured'),
      DateConstraint.make('createdAt'),
      NumberConstraint.make('viewCount'),
    ]),
])
```

The user clicks **Filters → Runtime filter**, builds something like
*"title contains tutorial AND (status in {draft, published} OR
createdAt after 2026-01-01)"*, hits **Apply**, and the list re-runs
against the composed clause.

The active state shows up as a `Runtime filter: 3 conditions` pill in
the active-filters bar above the table, with an `×` to clear. The
counter sums all leaves across nested groups — three rules in the
example above whether they're flat or grouped.

## Scope

| | Status |
|--|--|
| Per-row constraint + operator + value | ✅ |
| Round-trip through URL | ✅ (single JSON-encoded key) |
| Indicator pill | ✅ (default: `"Label: N conditions"`) |
| `AND` / `OR` connector at every group | ✅ |
| Nested groups (`(A AND B) OR C`) | ✅ |
| Cross-table joins / relation filters | ❌ — write a custom `.handle(fn)` |
| `notContains` operator on `TextConstraint` | ❌ — Prisma adapter doesn't translate `NOT LIKE` |

The renderer ships an AND/OR toggle at the head of every group plus an
**+ Add group** button, so the user can compose arbitrarily deep trees
in-place. Server-side, `applyTreeToQuery` recurses through the tree and
dispatches each sub-group through the rudder ORM's `whereGroup` /
`orWhereGroup` so groups stay parenthesized — they don't bleed into
the table's surrounding `where` clauses (search / tab predicate /
sibling filters).

> Custom query stubs that don't implement `whereGroup` still work — the
> walker falls back to flat AND chaining (the previous v1 behaviour),
> losing OR / nesting fidelity but never throwing.

## Constraints

A `Constraint` is a value-object that declares **which column** is
queryable, **which operators** the user can pick from for that column,
and **how each (operator, value) pair maps to ORM where-clauses**.

Five built-in constraints ship with pilotiq:

### TextConstraint

```ts
TextConstraint.make('title').label('Title')
```

Operators: `contains` (default) / `equals` / `notEquals` /
`startsWith` / `endsWith` / `isEmpty` / `isNotEmpty`.

`notContains` is intentionally omitted — the rudder Prisma adapter
doesn't translate `NOT LIKE` (only `LIKE`). Re-add once the adapter
learns negation. As a workaround, wrap the `contains` rule in a group
with the AND/OR connector flipped so the surrounding clause negates
through the user-visible logic.

LIKE wildcards (`%` `_` `\`) in user input are escaped server-side, so
typing `50%` searches for the literal string instead of a wildcard.

### NumberConstraint

```ts
NumberConstraint.make('amount').label('Amount')
```

Operators: `equals` / `notEquals` / `gt` / `gte` / `lt` / `lte` /
`between` / `isEmpty` / `isNotEmpty`.

`between` takes a `[min, max]` tuple — both sides optional. An empty
side skips the matching clause (e.g. `between [10, '']` becomes
`amount >= 10`).

### DateConstraint

```ts
DateConstraint.make('createdAt').label('Created')
DateConstraint.make('postedAt').includesTime()
```

Operators: `equals` (`On`) / `before` / `after` / `dateBetween` /
`isEmpty` / `isNotEmpty`.

`includesTime()` flips the value inputs to `datetime-local` and the
wire `valueKind` to `'dateTime'`. Values are passed through as ISO
strings (`'2026-05-04'` / `'2026-05-04T13:00'`).

### SelectConstraint

```ts
SelectConstraint.make('status')
  .options([
    { value: 'draft',     label: 'Draft' },
    { value: 'published', label: 'Published' },
  ])
```

Operators: `equals` / `notEquals` / `in` / `notIn` /
`isEmpty` / `isNotEmpty`.

`in` / `notIn` mount a multi-select chip stack so the user can pick
several values; `equals` / `notEquals` mount a single-select dropdown.

### BooleanConstraint

```ts
BooleanConstraint.make('featured').label('Featured')
```

Operators: `isTrue` / `isFalse` / `isEmpty` / `isNotEmpty`. No value
input — every operator is binary.

## URL shape

Active state JSON-encodes into a single URL key matching the filter
name. Each node carries an `operator` (`'and' | 'or'`) and a `rules`
array, where every entry is either a leaf rule (`constraint` + operator
+ value) or another sub-tree:

```
?runtime={"operator":"and","rules":[
  {"constraint":"title","operator":"contains","value":"tutorial"},
  {"operator":"or","rules":[
    {"constraint":"status",   "operator":"in",   "value":["draft","published"]},
    {"constraint":"createdAt","operator":"after","value":"2026-01-01"}
  ]}
]}
```

Empty trees drop the URL key entirely. Empty sub-trees and rules with
empty values (except `isEmpty / isNotEmpty / isTrue / isFalse` which
are valueless) are pruned on encode so the URL stays compact.

Helpers `parseQueryBuilderValue / encodeQueryBuilderValue /
isQueryBuilderTree / countLeafRules` are exported from `@pilotiq/pilotiq`
for tests + custom server-side handling.

## Custom query handler

Override the default tree-walk via `.handle(fn)` when constraints
can't model your query (e.g. cross-table joins). The handler is called
with the parsed tree — including any nested sub-trees — so a
relation-aware override has to walk the tree itself if it wants to
preserve grouping:

```ts
import { isQueryBuilderTree, applyTreeToQuery } from '@pilotiq/pilotiq'

QueryBuilderFilter.make('runtime')
  .constraints([…])
  .handle((q, tree, filter) => {
    // Pre-process: every rule with constraint='authorName' is a join
    // we need to handle separately before delegating to the standard
    // applyTreeToQuery walker for the rest.
    const flatLeaves = (t) => t.rules.flatMap(r =>
      isQueryBuilderTree(r) ? flatLeaves(r) : [r],
    )
    const authorRules = flatLeaves(tree).filter(r => r.constraint === 'authorName')
    for (const r of authorRules) {
      q = q.where('authorId', 'IN', /* join lookup */)
    }
    return applyTreeToQuery(q, tree, filter.getConstraints())
  })
```

## Custom indicator

```ts
import { countLeafRules } from '@pilotiq/pilotiq'

QueryBuilderFilter.make('runtime')
  .constraints([…])
  .treeIndicator((tree) => {
    const n = countLeafRules(tree)
    if (n === 0) return 'Filter'
    if (n === 1) return `1 active rule`
    return `${n} active rules`
  })
```

The default formatter pluralises across all leaves regardless of
nesting: `1 condition` / `2 conditions`. Pair with `.label('Custom')`
to override the prefix.

## Resource policy

`canAccess / canViewAny` apply to the table that owns the filter, so
QueryBuilder inherits whatever authorization the resource declares.
There's no per-constraint policy hook in v1 — if you need to gate a
constraint behind a role, drop it from the `.constraints([…])` array
based on the resolved user (the slot is a plain JS array).

## Limitations to plan around

- **No relation traversal** — constraints query columns on the parent
  model only. For relation-aware filters, write a `.handle(fn)`
  callback that consults `Resource.model.relations[name]` and emits
  `whereHas` / join clauses manually.
- **No `notContains` on `TextConstraint`** — the rudder Prisma
  adapter doesn't translate `NOT LIKE`. Expect this to land alongside a
  `WhereOperator` widening on the rudder side.
- **No saved filter sets** — every page visit needs the user to
  re-build their filter from scratch (or arrive via a bookmarked URL).
  Pair with `Resource.persistFiltersInSession = true` to remember the
  last-used filter across navigations within a session.
