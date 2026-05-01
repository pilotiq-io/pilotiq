import { makeValidator, type Validator, type ValidatorContext } from './Validator.js'
import { getPrimaryKey, type ModelLike } from '../orm/modelDefaults.js'

export interface UniqueOptions {
  /**
   * The model to probe. Any `ModelLike` works — `query().where(col, value)
   * .paginate(1, 2)` is the only contract used, so no new ORM method is
   * required. A class extending `@rudderjs/orm`'s `Model` satisfies this
   * automatically.
   */
  model: ModelLike

  /**
   * Column to match the field's value against. Defaults to the field's own
   * name — sufficient for the common `email` / `slug` / `username` case.
   */
  column?: string

  /**
   * Whether to exclude the record under edit from the probe. Defaults to
   * `true` — on edit, the validator skips when the only matching row IS
   * the current record (so saving "no change" doesn't trigger a conflict).
   * Pass `false` to forbid all matches even when editing the same row.
   *
   * Has no effect on create — there's no `ctx.record` to ignore.
   */
  ignoreRecord?: boolean

  /**
   * Extra equality clauses for scoped uniqueness. Receives the validator
   * context (`{ values, record }`) so the scope can read sibling fields:
   *
   *     unique({ model: Project, where: ({ values }) => ({ tenantId: values.tenantId }) })
   *
   * Each entry is applied as `query().where(key, value)`. Skipped entirely
   * when the function returns `undefined` or an empty object.
   */
  where?: (ctx: ValidatorContext) => Record<string, unknown> | undefined

  /**
   * Treat string comparisons as case-insensitive. Implemented via SQL
   * `LIKE` on the value with `%` / `_` / `\` escaped — so it stays an
   * exact match, just collation-folded. Works on SQLite (default `NOCASE`
   * for ASCII) and MySQL (default collation), and is collation-dependent
   * on Postgres. For Postgres apps that need locale-aware folding, use a
   * `citext` column or a custom `where(fn)` against a generated lower-cased
   * column instead of this flag.
   */
  caseInsensitive?: boolean

  /** Override the default error message. */
  message?: string
}

/**
 * Async validator: rejects when another row in the table already has the
 * same value in `column` (subject to `where` / `ignoreRecord`). Empty
 * values pass — pair with `required()` if the field is mandatory.
 *
 * The probe is `M.query().where(column, value).paginate(1, 2)` — pulls at
 * most 2 rows so we can distinguish "no match" / "only own record" /
 * "real conflict" without a `count(*)` contract.
 *
 * Carries no `serialized` descriptor, so the client doesn't try to mirror
 * the rule for live UX. The roundtrip happens once on submit.
 */
export function unique(opts: UniqueOptions): Validator {
  const message = opts.message ?? 'Already taken'
  const ignoreRecord = opts.ignoreRecord ?? true

  return makeValidator(async (value, ctx) => {
    if (value === undefined || value === null || value === '') return null

    // Resolve column lazily: validators don't know their owning Field's name,
    // so we accept that the caller either passes `column` explicitly or we
    // fall back to whichever key in `ctx.values` matches `value`. The
    // explicit `column` path is the recommended one — the fallback is a
    // best-effort convenience for the trivial single-field case.
    const column = opts.column ?? findColumnForValue(ctx, value)
    if (!column) return null

    let q = opts.model.query()

    if (opts.caseInsensitive && typeof value === 'string') {
      q = q.where(column, 'LIKE', escapeLikeLiteral(value))
    } else {
      q = q.where(column, value)
    }

    const extra = opts.where?.(ctx ?? {})
    if (extra) {
      for (const [key, val] of Object.entries(extra)) {
        if (val === undefined) continue
        q = q.where(key, val)
      }
    }

    const { data } = await q.paginate(1, 2)
    if (data.length === 0) return null

    if (ignoreRecord && ctx?.record) {
      const pk = getPrimaryKey(opts.model)
      const ownPk = (ctx.record as Record<string, unknown>)[pk]
      if (ownPk !== undefined && ownPk !== null) {
        const onlyOwn = data.every(row => {
          const rowPk = (row as Record<string, unknown>)[pk]
          return rowPk === ownPk
        })
        if (onlyOwn) return null
      }
    }

    return message
  })
}

function findColumnForValue(ctx: ValidatorContext | undefined, value: unknown): string | undefined {
  const values = ctx?.values
  if (!values) return undefined
  for (const [k, v] of Object.entries(values)) {
    if (v === value) return k
  }
  return undefined
}

/**
 * Escape SQL `LIKE`'s wildcard chars so the comparison stays an exact
 * match. `%` matches any sequence, `_` any single char, `\` is the
 * escape char itself (with the default LIKE escape).
 */
function escapeLikeLiteral(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&')
}
