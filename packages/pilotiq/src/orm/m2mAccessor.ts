/**
 * The M2M pivot-mutation surface exposed by `@rudderjs/orm`. Returned
 * from per-relation accessor methods installed on parent prototypes
 * (e.g. `user.roles()` → `{ attach, detach, sync }`).
 *
 * Each method is optional in the structural type because some test
 * doubles only stub the subset they exercise — `resolveM2MAccessor`
 * gates on `attach || detach` being callable to filter unrelated
 * shapes (e.g. a deferred QB Proxy from `parent.related()`).
 */
export interface M2MAccessor {
  attach?(input:      unknown): Promise<void>
  detach?(input?:     unknown): Promise<unknown>
  sync?(desiredIds:   ReadonlyArray<string | number>): Promise<unknown>
  /**
   * Update extras on an existing pivot row without touching either side
   * of the relation. Returns the number of rows updated (0 when no
   * matching pivot exists). Optional on the structural shape; pilotiq's
   * `Repeater.relationship.pivotColumns([…])` pipeline gates on its
   * presence and throws a clear error when missing (rudder ORM ships
   * it from `feat(orm): pivot-extras read/update + per-id sync` —
   * see `~/Projects/rudder/docs/plans/2026-05-06-belongs-to-many-pivot-extras.md`).
   */
  updatePivot?(relatedId: string | number, data: Record<string, unknown>): Promise<number>
}

/**
 * Resolve the M2M pivot-mutation accessor for `parent[rel]`. Two
 * shapes are supported, in this order:
 *
 *   1. `parent[rel]()` — the real `@rudderjs/orm` shape installed by
 *      `_installBelongsToManyMethods` / `_installMorphPivotMethods`
 *      (e.g. `post.tags()` returns `{ attach, detach, sync }`).
 *   2. `parent.related(rel)` — legacy / test-double shape that returns
 *      the accessor directly. Kept so existing pilotiq tests built
 *      around `parent.related(...)` mocks keep passing.
 *
 * Returns `undefined` when neither shape exposes a callable `attach`
 * AND a callable `detach` — caller should surface a clear error
 * (different copy depending on whether they're inside an Action handler
 * or a `Repeater.relationship` save).
 *
 * Note `parent.related(rel)` returns a deferred-QB Proxy in the real
 * ORM, NOT an attach/detach accessor — see
 * `feedback_m2m_accessor_shape.md`. The shape-1 instance-method form is
 * the canonical lookup; the related() fallback is purely a test-mock
 * affordance.
 */
export function resolveM2MAccessor(parent: unknown, rel: string): M2MAccessor | undefined {
  if (!parent || typeof parent !== 'object') return undefined
  // Shape 1: parent[rel]() — real ORM. Prototype-installed method.
  const inst = (parent as Record<string, unknown>)[rel]
  if (typeof inst === 'function') {
    try {
      const out = (inst as () => unknown).call(parent) as M2MAccessor | undefined
      if (out && (typeof out.attach === 'function' || typeof out.detach === 'function')) return out
    } catch { /* fall through to legacy shape */ }
  }
  // Shape 2: parent.related(rel) — legacy / test-mock shape.
  const relatedFn = (parent as { related?: (n: string) => unknown }).related
  if (typeof relatedFn === 'function') {
    const out = relatedFn.call(parent, rel) as M2MAccessor | undefined
    if (out && (typeof out.attach === 'function' || typeof out.detach === 'function')) return out
  }
  return undefined
}
