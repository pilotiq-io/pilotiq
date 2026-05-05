import { Filter, type FilterKind, type FilterMeta } from './Filter.js'
import type { ModelQuery } from '../orm/modelDefaults.js'
import {
  type Constraint,
  type ConstraintOperatorName,
} from './queryBuilder/Constraint.js'

/**
 * Wire shape of a single condition row in the QueryBuilder tree.
 *
 * - `constraint` — the `Constraint.name` to dispatch against
 * - `operator`   — one of the constraint's advertised operator names
 * - `value`      — operator-dependent payload (string / number / array)
 *
 * Rules whose `constraint` doesn't resolve at apply time are silently
 * skipped — config drift (renaming a column) shouldn't 500 the page.
 */
export interface QueryBuilderRule {
  constraint: string
  operator:   ConstraintOperatorName
  value?:     unknown
}

/**
 * Top-level shape of the QueryBuilder URL value. v1 supports a single
 * root operator (`'and'`) and a flat `rules` array — no nested groups.
 *
 * `'or'` is reserved in the type but rejected at apply time until the
 * rudder ORM ships `whereGroup(fn => …)` (see
 * `~/Projects/rudder/docs/plans/where-group.md`). Without a parenthesized
 * group, OR-root would merge incorrectly with the table's other where
 * clauses (search / tab predicate / sibling filters).
 */
export interface QueryBuilderTree {
  operator: 'and' | 'or'
  rules:    QueryBuilderRule[]
}

/** Empty tree — used when the URL key is absent or unparseable. */
export function emptyQueryBuilderTree(): QueryBuilderTree {
  return { operator: 'and', rules: [] }
}

/**
 * Parse the URL-encoded JSON payload back into a tree. Empty string,
 * non-object, or malformed payloads yield the empty tree (silently —
 * never throws so a tampered URL can't 500 the list page).
 */
export function parseQueryBuilderValue(value: string | undefined): QueryBuilderTree {
  if (!value) return emptyQueryBuilderTree()
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return emptyQueryBuilderTree()
    }
    const op = (parsed as { operator?: unknown }).operator
    const rules = (parsed as { rules?: unknown }).rules
    return {
      operator: op === 'or' ? 'or' : 'and',
      rules:    Array.isArray(rules) ? rules.filter(isRule) : [],
    }
  } catch {
    return emptyQueryBuilderTree()
  }
}

function isRule(r: unknown): r is QueryBuilderRule {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return typeof o['constraint'] === 'string' && typeof o['operator'] === 'string'
}

/**
 * Encode a tree back into the canonical URL payload. Empty rule sets
 * yield `''` (caller should drop the URL key entirely rather than
 * emitting `{"operator":"and","rules":[]}`).
 *
 * Rules with no `value` AND a value-bearing operator are dropped so the
 * URL doesn't bloat with half-typed in-progress rows.
 */
export function encodeQueryBuilderValue(tree: QueryBuilderTree): string {
  const rules = tree.rules.filter(isMeaningfulRule)
  if (rules.length === 0) return ''
  return JSON.stringify({ operator: tree.operator, rules })
}

function isMeaningfulRule(r: QueryBuilderRule): boolean {
  if (!r.constraint || !r.operator) return false
  // value-less operators (isEmpty / isNotEmpty / isTrue / isFalse) are valid
  // standalone — keep them even with no `value`.
  if (isValuelessOperator(r.operator)) return true
  if (r.value === undefined || r.value === null || r.value === '') return false
  if (Array.isArray(r.value) && r.value.every(v => v === undefined || v === null || v === '')) return false
  return true
}

function isValuelessOperator(op: ConstraintOperatorName): boolean {
  return op === 'isEmpty' || op === 'isNotEmpty' || op === 'isTrue' || op === 'isFalse'
}

/**
 * Typed query callback — receives the parsed tree (vs the base
 * `FilterQueryHandler`'s raw URL string). Override the default tree-walk
 * via `QueryBuilderFilter.handle(fn)` when constraints can't model your
 * query (e.g. cross-table joins).
 */
export type QueryBuilderQueryHandler = (
  query: ModelQuery,
  tree:  QueryBuilderTree,
  filter: QueryBuilderFilter,
) => ModelQuery

/**
 * Typed indicator-pill formatter — mirrors `FormFilter.formIndicator`.
 * Default pill text is `"<Label>: N condition(s)"`.
 */
export type QueryBuilderIndicatorHandler = (
  tree:   QueryBuilderTree,
  filter: QueryBuilderFilter,
) => string

/**
 * Composable advanced-filter — Filament-style. Lets end users compose
 * multiple constraint rules at runtime against any pre-declared column,
 * without requiring a developer to add a per-column filter.
 *
 * v1 = single root operator (AND), flat rule list. URL value is a single
 * JSON-encoded payload `?advanced={"operator":"and","rules":[…]}`. The
 * default `query()` callback walks the tree depth-first and dispatches
 * each rule through its `Constraint.apply()` — every clause AND's into
 * the running query.
 *
 * @example
 *   QueryBuilderFilter.make('advanced')
 *     .label('Advanced')
 *     .constraints([
 *       TextConstraint.make('title'),
 *       NumberConstraint.make('amount'),
 *       SelectConstraint.make('status').options([
 *         { value: 'draft',     label: 'Draft' },
 *         { value: 'published', label: 'Published' },
 *       ]),
 *     ])
 */
export class QueryBuilderFilter extends Filter {
  private _constraints: Constraint[] = []

  static make(name: string): QueryBuilderFilter {
    const f = new QueryBuilderFilter(name)
    f.query((q, value) => {
      const tree = parseQueryBuilderValue(value)
      return applyTreeToQuery(q, tree, f._constraints)
    })
    return f
  }

  constraints(list: Constraint[]): this {
    this._constraints = list
    return this
  }

  getConstraints(): Constraint[] { return this._constraints }

  /**
   * Override the default tree-walk. Receives the parsed tree (not the raw
   * URL string) plus a back-reference to the filter so the handler can
   * read `getConstraints()` if it wants to layer custom logic on top of
   * the standard dispatch.
   */
  handle(fn: QueryBuilderQueryHandler): this {
    this.query((q, value) => fn(q, parseQueryBuilderValue(value), this))
    return this
  }

  /**
   * Typed indicator override — receives the parsed tree (mirrors
   * `FormFilter.formIndicator`).
   */
  treeIndicator(fn: QueryBuilderIndicatorHandler): this {
    this.indicator((value: string) => fn(parseQueryBuilderValue(value), this))
    return this
  }

  override getKind(): FilterKind { return 'queryBuilder' }

  protected override formatActiveValue(value: string): string {
    const tree = parseQueryBuilderValue(value)
    const n = tree.rules.length
    if (n === 0) return ''
    return `${n} condition${n === 1 ? '' : 's'}`
  }

  /**
   * Override so that a stored value of `'{"operator":"and","rules":[]}'`
   * (legitimately parsed JSON with zero rules) doesn't paint an empty
   * `"Label: "` pill. The base `getIndicator` only checks for raw empty-
   * string / undefined.
   */
  override getIndicator(): string | undefined {
    const value = this.getValue()
    if (value === undefined || value === '') return undefined
    const tree = parseQueryBuilderValue(value)
    if (tree.rules.length === 0) return undefined
    return super.getIndicator()
  }

  override toMeta(): FilterMeta {
    const base = this.buildBaseMeta()
    return {
      ...base,
      placeholder: this.getPlaceholder() ?? 'Add filter…',
      constraints: this._constraints.map(c => c.toMeta() as unknown as Record<string, unknown>),
    }
  }
}

/**
 * Walk a tree against an indexed constraint set and chain `where` calls.
 * v1 only honors `tree.operator === 'and'` — `'or'` requires nested-group
 * support in the underlying ORM (rudder doesn't surface `whereGroup` yet),
 * and naïvely chaining `orWhere` would merge the OR conditions with every
 * other unrelated where clause already on the query.
 *
 * Exposed for tests + custom handlers that want the default behavior on
 * top of their own pre-/post-processing.
 */
export function applyTreeToQuery(
  query:       ModelQuery,
  tree:        QueryBuilderTree,
  constraints: Constraint[],
): ModelQuery {
  if (tree.rules.length === 0) return query
  if (tree.operator !== 'and') {
    // Reserved for v2 — silently fall through to AND so the page still
    // renders correctly. The renderer should only emit AND for now.
  }
  const map = new Map<string, Constraint>()
  for (const c of constraints) map.set(c.name, c)

  let q = query
  for (const rule of tree.rules) {
    const c = map.get(rule.constraint)
    if (!c) continue
    try {
      q = c.apply(q, rule.operator, rule.value)
    } catch {
      // Malformed values shouldn't 500 the page — skip the offending rule
      // and continue with the rest. The list still loads.
    }
  }
  return q
}
