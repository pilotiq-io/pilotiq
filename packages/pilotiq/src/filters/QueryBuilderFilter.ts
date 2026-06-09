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
 * Top-level (or nested) shape of the QueryBuilder URL value. Each node
 * carries a connector (`'and' | 'or'`) and a list of child rules — every
 * child is either a single condition (`QueryBuilderRule`) or another
 * sub-tree, so groups can nest arbitrarily deep.
 *
 * v2 dispatches the tree through the rudder ORM's `whereGroup` /
 * `orWhereGroup` callbacks so nested OR / nested AND compose without
 * leaking conditions into surrounding `where` clauses (search / tab
 * predicate / sibling filters). When the underlying query lacks
 * `whereGroup` (custom test stubs, exotic adapters), `applyTreeToQuery`
 * falls back to flat AND chaining for compatibility.
 */
export interface QueryBuilderTree {
  operator: 'and' | 'or'
  rules:    QueryBuilderTreeChild[]
}

/** A child node in a tree — either a single rule or another sub-tree. */
export type QueryBuilderTreeChild = QueryBuilderRule | QueryBuilderTree

/** Type predicate: is this node a sub-tree (vs. a leaf rule)? */
export function isQueryBuilderTree(node: QueryBuilderTreeChild): node is QueryBuilderTree {
  if (!node || typeof node !== 'object') return false
  const o = node as unknown as Record<string, unknown>
  return Array.isArray(o['rules']) && (o['operator'] === 'and' || o['operator'] === 'or')
}

/** Empty tree — used when the URL key is absent or unparseable. */
export function emptyQueryBuilderTree(): QueryBuilderTree {
  return { operator: 'and', rules: [] }
}

/**
 * Parse the URL-encoded JSON payload back into a tree. Empty string,
 * non-object, or malformed payloads yield the empty tree (silently —
 * never throws so a tampered URL can't 500 the list page).
 *
 * Recurses into nested groups; child nodes that are neither well-formed
 * rules nor well-formed sub-trees are dropped silently.
 */
export function parseQueryBuilderValue(value: string | undefined): QueryBuilderTree {
  if (!value) return emptyQueryBuilderTree()
  try {
    const parsed = JSON.parse(value)
    return parseTreeNode(parsed) ?? emptyQueryBuilderTree()
  } catch {
    return emptyQueryBuilderTree()
  }
}

function parseTreeNode(raw: unknown): QueryBuilderTree | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const op    = (raw as { operator?: unknown }).operator
  const rules = (raw as { rules?: unknown }).rules
  if (!Array.isArray(rules)) return undefined
  const children: QueryBuilderTreeChild[] = []
  for (const r of rules) {
    if (isRawTree(r)) {
      const sub = parseTreeNode(r)
      if (sub) children.push(sub)
    } else if (isRule(r)) {
      children.push(r)
    }
  }
  return {
    operator: op === 'or' ? 'or' : 'and',
    rules:    children,
  }
}

function isRawTree(r: unknown): boolean {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return Array.isArray(o['rules']) && (o['operator'] === 'and' || o['operator'] === 'or')
}

function isRule(r: unknown): r is QueryBuilderRule {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return typeof o['constraint'] === 'string' && typeof o['operator'] === 'string'
}

/**
 * Encode a tree back into the canonical URL payload. Empty trees (zero
 * meaningful descendants) yield `''` so the caller can drop the URL key
 * entirely rather than emitting a stub envelope.
 *
 * Rules with no `value` AND a value-bearing operator are dropped on
 * encode so the URL doesn't bloat with half-typed in-progress rows.
 * Sub-trees that collapse to zero meaningful children are dropped too.
 */
export function encodeQueryBuilderValue(tree: QueryBuilderTree): string {
  const compacted = compactTree(tree)
  if (!compacted) return ''
  return JSON.stringify(compacted)
}

function compactTree(tree: QueryBuilderTree): QueryBuilderTree | undefined {
  const out: QueryBuilderTreeChild[] = []
  for (const child of tree.rules) {
    if (isQueryBuilderTree(child)) {
      const sub = compactTree(child)
      if (sub) out.push(sub)
    } else if (isMeaningfulRule(child)) {
      out.push(child)
    }
  }
  if (out.length === 0) return undefined
  return { operator: tree.operator, rules: out }
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
    return this.configured(f)
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
    const n = countLeafRules(tree)
    if (n === 0) return ''
    return `${n} condition${n === 1 ? '' : 's'}`
  }

  /**
   * Override so that a stored value of `'{"operator":"and","rules":[]}'`
   * (legitimately parsed JSON with zero rules — including trees where every
   * rule was dropped as empty) doesn't paint an empty `"Label: "` pill.
   * The base `getIndicator` only checks for raw empty-string / undefined.
   */
  override getIndicator(): string | undefined {
    const value = this.getValue()
    if (value === undefined || value === '') return undefined
    const tree = parseQueryBuilderValue(value)
    if (countLeafRules(tree) === 0) return undefined
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
 * Walk a tree against an indexed constraint set and translate it into ORM
 * `where` calls. v2 dispatches every sub-group through `whereGroup` /
 * `orWhereGroup` so nested AND/OR composes without leaking into the query's
 * surrounding `where` clauses (search / tab predicate / sibling filters).
 *
 * Falls back to flat AND chaining when the running query lacks
 * `whereGroup` (custom test stubs or exotic adapters that haven't picked
 * up the rudder ORM contract yet) — same behaviour as v1, but loses OR /
 * nesting fidelity. Real rudder ORM queries always carry `whereGroup`.
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

  const map = new Map<string, Constraint>()
  for (const c of constraints) map.set(c.name, c)

  // Without `whereGroup`, OR-root + nested groups can't be expressed safely
  // — fall back to flat AND chaining (the v1 behaviour) so the page still
  // renders, just with reduced fidelity. Leaves only; nested groups are
  // walked and their leaves chained in.
  if (typeof query.whereGroup !== 'function') {
    return applyTreeFlat(query, tree, map)
  }

  return applyTreeGrouped(query, tree, map, /* atRoot */ true)
}

function applyTreeGrouped(
  query: ModelQuery,
  tree:  QueryBuilderTree,
  map:   Map<string, Constraint>,
  atRoot: boolean,
): ModelQuery {
  // The tree's connector tells us how each child JOINS to its sibling. AND
  // → child as `where(...)` / `whereGroup(...)`; OR → child as
  // `orWhere(...)` / `orWhereGroup(...)`. The first child of an OR-rooted
  // group still uses `whereGroup` at the parent boundary so the whole
  // group is parenthesized correctly — the inner connector handles
  // sibling-to-sibling joining.
  let q = query
  for (let i = 0; i < tree.rules.length; i++) {
    const child   = tree.rules[i]!
    const useOr   = tree.operator === 'or' && i > 0
    if (isQueryBuilderTree(child)) {
      // Nested group — recurse inside whereGroup / orWhereGroup so the
      // sub-tree's clauses stay parenthesized.
      // The group sub-builder is typed `ModelQueryGroup` (where-chain
      // subset). The recursion + `Constraint.apply` want the full
      // `ModelQuery` — safe to cast here: rudder hands the callback a
      // full QueryBuilder at runtime, and this walker only ever emits
      // where-family calls on it.
      q = useOr
        ? q.orWhereGroup!(g => { applyTreeGrouped(g as ModelQuery, child, map, false) })
        : q.whereGroup!  (g => { applyTreeGrouped(g as ModelQuery, child, map, false) })
    } else {
      const c = map.get(child.constraint)
      if (!c) continue
      try {
        q = useOr
          ? applyAsOr(q, c, child)
          : c.apply(q, child.operator, child.value)
      } catch {
        // Malformed values shouldn't 500 the page — skip the offending rule
        // and continue with the rest. The list still loads.
      }
    }
  }
  // Suppress unused-variable warning for atRoot — kept on the signature so
  // future expansion (e.g. wrapping the root in its own group when mixing
  // with other top-level wheres) has the discriminator handy.
  void atRoot
  return q
}

/**
 * Run a single rule against the query inside an `orWhereGroup` so its OR
 * connector composes correctly. `Constraint.apply()` always emits AND
 * (`.where()`); to flip the connector we wrap the leaf in a 1-element
 * orWhereGroup. Multi-clause operators (e.g. `between` → two `.where()`
 * calls) get AND'd inside the group, then the whole group OR's against
 * the running query — which is exactly what the user means by
 * "OR (amount BETWEEN 10 AND 50)".
 */
function applyAsOr(q: ModelQuery, c: Constraint, rule: QueryBuilderRule): ModelQuery {
  if (typeof q.orWhereGroup !== 'function') {
    // No grouping support — fall back to flat AND so the page still loads.
    return c.apply(q, rule.operator, rule.value)
  }
  // Same `ModelQueryGroup` → `ModelQuery` cast rationale as applyTreeGrouped.
  return q.orWhereGroup(g => { c.apply(g as ModelQuery, rule.operator, rule.value) })
}

/**
 * Legacy fallback — chain every leaf through `.where()`, recurse into
 * sub-trees as if they were AND-ed. Mirrors v1 behaviour for query
 * builders that don't implement `whereGroup`.
 */
function applyTreeFlat(
  query: ModelQuery,
  tree:  QueryBuilderTree,
  map:   Map<string, Constraint>,
): ModelQuery {
  let q = query
  for (const child of tree.rules) {
    if (isQueryBuilderTree(child)) {
      q = applyTreeFlat(q, child, map)
    } else {
      const c = map.get(child.constraint)
      if (!c) continue
      try {
        q = c.apply(q, child.operator, child.value)
      } catch {
        // Same fail-soft posture as the grouped walker.
      }
    }
  }
  return q
}

/**
 * Recursive count of leaf rules in a tree — used by the indicator pill so
 * "5 conditions" reflects all leaves regardless of how they're grouped.
 * Exposed for tests + custom indicator formatters.
 */
export function countLeafRules(tree: QueryBuilderTree): number {
  let n = 0
  for (const child of tree.rules) {
    n += isQueryBuilderTree(child) ? countLeafRules(child) : 1
  }
  return n
}
