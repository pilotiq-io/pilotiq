import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  QueryBuilderFilter,
  parseQueryBuilderValue,
  encodeQueryBuilderValue,
  emptyQueryBuilderTree,
  applyTreeToQuery,
  countLeafRules,
  isQueryBuilderTree,
  type QueryBuilderTree,
} from './QueryBuilderFilter.js'
import { TextConstraint }    from './queryBuilder/TextConstraint.js'
import { NumberConstraint }  from './queryBuilder/NumberConstraint.js'
import { DateConstraint }    from './queryBuilder/DateConstraint.js'
import { SelectConstraint }  from './queryBuilder/SelectConstraint.js'
import { BooleanConstraint } from './queryBuilder/BooleanConstraint.js'
import type { ModelQuery } from '../orm/modelDefaults.js'

interface FakeOp { op: string; args: unknown[]; sub?: FakeOp[] }
class FakeQuery implements ModelQuery {
  // `with` / `withCount` are required on ModelQuery (eager-load surface);
  // stubs no-op them.
  with(): ModelQuery { return this }
  withCount(): ModelQuery { return this }
  ops: FakeOp[] = []
  where(...args: unknown[]): ModelQuery     { this.ops.push({ op: 'where', args });     return this }
  orWhere(...args: unknown[]): ModelQuery   { this.ops.push({ op: 'orWhere', args });   return this }
  whereNull(c: string): ModelQuery          { this.ops.push({ op: 'whereNull', args: [c] }); return this }
  orderBy(c: string, d: 'ASC' | 'DESC' = 'ASC'): ModelQuery { this.ops.push({ op: 'orderBy', args: [c, d] }); return this }
  async paginate() { this.ops.push({ op: 'paginate', args: [] }); return { data: [], total: 0 } }
  whereGroup(fn: (q: ModelQuery) => ModelQuery | void): ModelQuery {
    const sub = new FakeQuery()
    fn(sub)
    if (sub.ops.length > 0) this.ops.push({ op: 'whereGroup', args: [], sub: sub.ops })
    return this
  }
  orWhereGroup(fn: (q: ModelQuery) => ModelQuery | void): ModelQuery {
    const sub = new FakeQuery()
    fn(sub)
    if (sub.ops.length > 0) this.ops.push({ op: 'orWhereGroup', args: [], sub: sub.ops })
    return this
  }
}

/** Stub without `whereGroup` — used to verify the v1-compat fallback. */
class FlatFakeQuery implements ModelQuery {
  // `with` / `withCount` are required on ModelQuery (eager-load surface);
  // stubs no-op them.
  with(): ModelQuery { return this }
  withCount(): ModelQuery { return this }
  ops: FakeOp[] = []
  where(...args: unknown[]): ModelQuery     { this.ops.push({ op: 'where', args });     return this }
  orWhere(...args: unknown[]): ModelQuery   { this.ops.push({ op: 'orWhere', args });   return this }
  whereNull(c: string): ModelQuery          { this.ops.push({ op: 'whereNull', args: [c] }); return this }
  orderBy(c: string, d: 'ASC' | 'DESC' = 'ASC'): ModelQuery { this.ops.push({ op: 'orderBy', args: [c, d] }); return this }
  async paginate() { this.ops.push({ op: 'paginate', args: [] }); return { data: [], total: 0 } }
}

describe('parseQueryBuilderValue', () => {
  it('returns the empty tree for empty / undefined / unparseable / non-object', () => {
    assert.deepEqual(parseQueryBuilderValue(''),         emptyQueryBuilderTree())
    assert.deepEqual(parseQueryBuilderValue(undefined),  emptyQueryBuilderTree())
    assert.deepEqual(parseQueryBuilderValue('not-json'), emptyQueryBuilderTree())
    assert.deepEqual(parseQueryBuilderValue('"x"'),      emptyQueryBuilderTree())
    assert.deepEqual(parseQueryBuilderValue('[1,2]'),    emptyQueryBuilderTree())
    assert.deepEqual(parseQueryBuilderValue('null'),     emptyQueryBuilderTree())
  })

  it('coerces unknown root operator to "and"', () => {
    const tree = parseQueryBuilderValue('{"operator":"xor","rules":[]}')
    assert.equal(tree.operator, 'and')
  })

  it('round-trips a typical AND-root tree', () => {
    const enc = encodeQueryBuilderValue({
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'foo' },
        { constraint: 'count', operator: 'gte',      value: 5     },
      ],
    })
    const dec = parseQueryBuilderValue(enc)
    assert.equal(dec.operator, 'and')
    assert.equal(dec.rules.length, 2)
    assert.equal((dec.rules[0] as { constraint: string }).constraint, 'title')
    assert.equal((dec.rules[1] as { value: unknown }).value,          5)
  })

  it('drops malformed rule entries (missing constraint or operator)', () => {
    const tree = parseQueryBuilderValue(JSON.stringify({
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'x' },
        { constraint: 'count' /* missing operator */ },
        'oops',
        null,
        { operator: 'equals' /* missing constraint */ },
      ],
    }))
    assert.equal(tree.rules.length, 1)
    assert.equal((tree.rules[0] as { constraint: string }).constraint, 'title')
  })
})

describe('encodeQueryBuilderValue', () => {
  it('returns "" for an empty tree', () => {
    assert.equal(encodeQueryBuilderValue(emptyQueryBuilderTree()), '')
  })

  it('drops rules with empty value (non-valueless operator)', () => {
    const enc = encodeQueryBuilderValue({
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: '' },
        { constraint: 'title', operator: 'contains', value: 'foo' },
      ],
    })
    assert.equal(enc, '{"operator":"and","rules":[{"constraint":"title","operator":"contains","value":"foo"}]}')
  })

  it('keeps valueless operators (isEmpty / isNotEmpty / isTrue / isFalse) without value', () => {
    const enc = encodeQueryBuilderValue({
      operator: 'and',
      rules: [
        { constraint: 'deletedAt', operator: 'isEmpty' },
        { constraint: 'featured',  operator: 'isTrue'  },
      ],
    })
    const dec = parseQueryBuilderValue(enc)
    assert.equal(dec.rules.length, 2)
  })

  it('drops range rules where both sides are empty', () => {
    const enc = encodeQueryBuilderValue({
      operator: 'and',
      rules: [{ constraint: 'amount', operator: 'between', value: ['', ''] }],
    })
    assert.equal(enc, '')
  })
})

describe('TextConstraint', () => {
  it('contains → LIKE %v%', () => {
    const q = new FakeQuery()
    TextConstraint.make('title').apply(q, 'contains', 'hello')
    assert.deepEqual(q.ops[0]!.args, ['title', 'LIKE', '%hello%'])
  })

  it('notContains → NOT LIKE %v%', () => {
    const q = new FakeQuery()
    TextConstraint.make('title').apply(q, 'notContains', 'spam')
    assert.deepEqual(q.ops[0]!.args, ['title', 'NOT LIKE', '%spam%'])
  })

  it('notContains escapes LIKE wildcards', () => {
    const q = new FakeQuery()
    TextConstraint.make('title').apply(q, 'notContains', '50% off')
    assert.deepEqual(q.ops[0]!.args, ['title', 'NOT LIKE', '%50\\% off%'])
  })

  it('notContains drops empty string', () => {
    const q = new FakeQuery()
    TextConstraint.make('title').apply(q, 'notContains', '')
    assert.equal(q.ops.length, 0)
  })

  it('startsWith / endsWith / equals / notEquals', () => {
    const checks: Array<[string, string, string]> = [
      ['startsWith', 'LIKE', 'foo%'],
      ['endsWith',   'LIKE', '%bar'],
      ['equals',     '=',    'baz'],
      ['notEquals',  '!=',   'qux'],
    ]
    for (const [op, sqlOp, val] of checks) {
      const q = new FakeQuery()
      const v = op === 'startsWith' ? 'foo' : op === 'endsWith' ? 'bar' : op === 'equals' ? 'baz' : 'qux'
      TextConstraint.make('title').apply(q, op as never, v)
      assert.deepEqual(q.ops[0]!.args, ['title', sqlOp, val])
    }
  })

  it('isEmpty falls back to whereNull + orWhere "" when whereNull is present', () => {
    const q = new FakeQuery()
    TextConstraint.make('title').apply(q, 'isEmpty', undefined)
    assert.deepEqual(q.ops.map(o => o.op), ['whereNull', 'orWhere'])
  })

  it('isNotEmpty emits where(name, "!=", "")', () => {
    const q = new FakeQuery()
    TextConstraint.make('title').apply(q, 'isNotEmpty', undefined)
    assert.deepEqual(q.ops[0]!.args, ['title', '!=', ''])
  })

  it('escapes LIKE wildcards in user input', () => {
    const q = new FakeQuery()
    TextConstraint.make('title').apply(q, 'contains', '50% off_today')
    assert.deepEqual(q.ops[0]!.args, ['title', 'LIKE', '%50\\% off\\_today%'])
  })

  it('contains drops empty strings instead of querying for everything', () => {
    const q = new FakeQuery()
    TextConstraint.make('title').apply(q, 'contains', '')
    assert.equal(q.ops.length, 0)
  })
})

describe('NumberConstraint', () => {
  it('chains comparison operators', () => {
    const q = new FakeQuery()
    NumberConstraint.make('amount').apply(q, 'gte', '100')
    assert.deepEqual(q.ops[0]!.args, ['amount', '>=', 100])
  })

  it('between emits two where clauses (>= and <=)', () => {
    const q = new FakeQuery()
    NumberConstraint.make('amount').apply(q, 'between', ['10', '50'])
    assert.equal(q.ops.length, 2)
    assert.deepEqual(q.ops[0]!.args, ['amount', '>=', 10])
    assert.deepEqual(q.ops[1]!.args, ['amount', '<=', 50])
  })

  it('between with only one side emits a single clause', () => {
    const q = new FakeQuery()
    NumberConstraint.make('amount').apply(q, 'between', ['', '50'])
    assert.equal(q.ops.length, 1)
    assert.deepEqual(q.ops[0]!.args, ['amount', '<=', 50])
  })

  it('between drops non-finite numbers', () => {
    const q = new FakeQuery()
    NumberConstraint.make('amount').apply(q, 'between', ['NaN', '50'])
    assert.equal(q.ops.length, 1)
    assert.deepEqual(q.ops[0]!.args, ['amount', '<=', 50])
  })

  it('isEmpty uses whereNull when available', () => {
    const q = new FakeQuery()
    NumberConstraint.make('amount').apply(q, 'isEmpty', undefined)
    assert.equal(q.ops[0]!.op, 'whereNull')
  })
})

describe('DateConstraint', () => {
  it('emits date comparisons as ISO strings', () => {
    const q = new FakeQuery()
    DateConstraint.make('createdAt').apply(q, 'after', '2026-05-01')
    assert.deepEqual(q.ops[0]!.args, ['createdAt', '>', '2026-05-01'])
  })

  it('dateBetween emits paired where clauses', () => {
    const q = new FakeQuery()
    DateConstraint.make('createdAt').apply(q, 'dateBetween', ['2026-01-01', '2026-12-31'])
    assert.equal(q.ops.length, 2)
    assert.deepEqual(q.ops[0]!.args, ['createdAt', '>=', '2026-01-01'])
    assert.deepEqual(q.ops[1]!.args, ['createdAt', '<=', '2026-12-31'])
  })

  it('includesTime() flips operator value-kinds to dateTime', () => {
    const ops = DateConstraint.make('createdAt').includesTime().getOperators()
    const equalsOp = ops.find(o => o.name === 'equals')
    assert.equal(equalsOp?.valueKind, 'dateTime')
  })
})

describe('SelectConstraint', () => {
  it('in emits where(col, "IN", list)', () => {
    const q = new FakeQuery()
    SelectConstraint.make('status').apply(q, 'in', ['draft', 'published'])
    assert.deepEqual(q.ops[0]!.args, ['status', 'IN', ['draft', 'published']])
  })

  it('notIn emits where(col, "NOT IN", list)', () => {
    const q = new FakeQuery()
    SelectConstraint.make('status').apply(q, 'notIn', ['archived'])
    assert.deepEqual(q.ops[0]!.args, ['status', 'NOT IN', ['archived']])
  })

  it('in drops empty list', () => {
    const q = new FakeQuery()
    SelectConstraint.make('status').apply(q, 'in', [])
    assert.equal(q.ops.length, 0)
  })

  it('exposes its options on toMeta', () => {
    const meta = SelectConstraint.make('status')
      .options([{ value: 'draft', label: 'Draft' }])
      .toMeta()
    assert.deepEqual(meta.options, [{ value: 'draft', label: 'Draft' }])
  })
})

describe('BooleanConstraint', () => {
  it('isTrue / isFalse', () => {
    const q1 = new FakeQuery()
    BooleanConstraint.make('featured').apply(q1, 'isTrue',  undefined)
    assert.deepEqual(q1.ops[0]!.args, ['featured', '=', true])

    const q2 = new FakeQuery()
    BooleanConstraint.make('featured').apply(q2, 'isFalse', undefined)
    assert.deepEqual(q2.ops[0]!.args, ['featured', '=', false])
  })
})

describe('applyTreeToQuery (AND-root)', () => {
  it('chains every rule via .where()', () => {
    const q = new FakeQuery()
    const tree: QueryBuilderTree = {
      operator: 'and',
      rules: [
        { constraint: 'title',     operator: 'contains', value: 'foo' },
        { constraint: 'amount',    operator: 'gte',      value: 10    },
        { constraint: 'status',    operator: 'equals',   value: 'published' },
      ],
    }
    applyTreeToQuery(q, tree, [
      TextConstraint.make('title'),
      NumberConstraint.make('amount'),
      SelectConstraint.make('status'),
    ])
    assert.equal(q.ops.length, 3)
    assert.equal(q.ops[0]!.op, 'where')
    assert.equal(q.ops[1]!.op, 'where')
    assert.equal(q.ops[2]!.op, 'where')
  })

  it('skips unknown constraint names silently', () => {
    const q = new FakeQuery()
    applyTreeToQuery(q, {
      operator: 'and',
      rules: [
        { constraint: 'title',  operator: 'contains', value: 'x' },
        { constraint: 'ghost',  operator: 'equals',   value: 'y' },
      ],
    }, [TextConstraint.make('title')])
    assert.equal(q.ops.length, 1)
  })

  it('catches throws inside Constraint.apply (malformed values)', () => {
    class ThrowingConstraint extends TextConstraint {
      static override make(name: string): ThrowingConstraint { return new ThrowingConstraint(name) }
      override apply(): never { throw new Error('boom') }
    }
    const q = new FakeQuery()
    applyTreeToQuery(q, {
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'x' },
        { constraint: 'good',  operator: 'contains', value: 'y' },
      ],
    }, [
      ThrowingConstraint.make('title'),
      TextConstraint.make('good'),
    ])
    // The good constraint still ran.
    assert.equal(q.ops.length, 1)
    assert.equal(q.ops[0]!.args[0], 'good')
  })
})

describe('QueryBuilderFilter shape', () => {
  it('emits kind:queryBuilder', () => {
    const meta = QueryBuilderFilter.make('advanced').toMeta()
    assert.equal(meta.kind, 'queryBuilder')
    assert.equal(meta.name, 'advanced')
  })

  it('emits constraints array on the meta', () => {
    const meta = QueryBuilderFilter.make('advanced')
      .constraints([
        TextConstraint.make('title').label('Title'),
        NumberConstraint.make('amount').label('Amount'),
      ])
      .toMeta()
    assert.ok(Array.isArray(meta.constraints))
    assert.equal(meta.constraints!.length, 2)
    assert.equal((meta.constraints![0] as { name: string }).name, 'title')
  })

  it('default queryFn applies the parsed tree against a query', () => {
    const f = QueryBuilderFilter.make('advanced').constraints([
      TextConstraint.make('title'),
      NumberConstraint.make('amount'),
    ])
    const handler = f.getQuery()
    assert.ok(handler)
    const q = new FakeQuery()
    handler!(q, JSON.stringify({
      operator: 'and',
      rules: [
        { constraint: 'title',  operator: 'contains', value: 'foo' },
        { constraint: 'amount', operator: 'gte',      value: 10    },
      ],
    }))
    assert.equal(q.ops.length, 2)
  })

  it('default queryFn no-ops on empty / unparseable URL value', () => {
    const f = QueryBuilderFilter.make('advanced').constraints([TextConstraint.make('title')])
    const q = new FakeQuery()
    f.getQuery()!(q, '')
    assert.equal(q.ops.length, 0)
  })

  it('handle(fn) replaces the default tree-walk', () => {
    let received: unknown
    const f = QueryBuilderFilter.make('advanced')
      .constraints([TextConstraint.make('title')])
      .handle((q, tree) => {
        received = tree
        return q.where('overridden', '=', true)
      })
    const q = new FakeQuery()
    f.getQuery()!(q, '{"operator":"and","rules":[{"constraint":"title","operator":"contains","value":"foo"}]}')
    assert.deepEqual(((received as QueryBuilderTree).rules[0] as { value: unknown }).value, 'foo')
    assert.deepEqual(q.ops[0]!.args, ['overridden', '=', true])
  })

  it('default indicator pluralises by rule count', () => {
    const f = QueryBuilderFilter.make('advanced').label('Advanced').constraints([
      TextConstraint.make('title'),
    ])
    f.withValue('{"operator":"and","rules":[{"constraint":"title","operator":"contains","value":"x"}]}')
    assert.equal(f.getIndicator(), 'Advanced: 1 condition')

    const f2 = QueryBuilderFilter.make('advanced').label('Advanced').constraints([
      TextConstraint.make('title'),
    ])
    f2.withValue('{"operator":"and","rules":[{"constraint":"title","operator":"contains","value":"x"},{"constraint":"title","operator":"equals","value":"y"}]}')
    assert.equal(f2.getIndicator(), 'Advanced: 2 conditions')
  })

  it('indicator hidden when tree has zero rules even with non-empty URL value', () => {
    const f = QueryBuilderFilter.make('advanced').label('Advanced')
    f.withValue('{"operator":"and","rules":[]}')
    assert.equal(f.getIndicator(), undefined)
  })

  it('treeIndicator(fn) overrides default formatter', () => {
    const f = QueryBuilderFilter.make('advanced')
      .constraints([TextConstraint.make('title')])
      .treeIndicator((tree) => `${tree.rules.length} rule${tree.rules.length === 1 ? '' : 's'} active`)
    f.withValue('{"operator":"and","rules":[{"constraint":"title","operator":"contains","value":"x"}]}')
    assert.equal(f.getIndicator(), '1 rule active')
  })
})

describe('applyTreeToQuery (OR-root + nested groups, v2)', () => {
  it('OR-root with three leaves wraps every leaf after the first in orWhereGroup', () => {
    const q = new FakeQuery()
    applyTreeToQuery(q, {
      operator: 'or',
      rules: [
        { constraint: 'title',  operator: 'contains', value: 'foo' },
        { constraint: 'amount', operator: 'gte',      value: 10    },
        { constraint: 'status', operator: 'equals',   value: 'published' },
      ],
    }, [
      TextConstraint.make('title'),
      NumberConstraint.make('amount'),
      SelectConstraint.make('status'),
    ])
    // First leaf joins to the running query as AND (the parent's
    // surrounding wheres haven't established a connector yet).
    assert.equal(q.ops[0]!.op, 'where')
    // Subsequent leaves wrap in orWhereGroup so the OR connector wins.
    assert.equal(q.ops[1]!.op, 'orWhereGroup')
    assert.equal(q.ops[2]!.op, 'orWhereGroup')
    // Each wrapped leaf records the underlying where call inside its sub.
    assert.equal(q.ops[1]!.sub![0]!.op, 'where')
    assert.deepEqual(q.ops[2]!.sub![0]!.args, ['status', '=', 'published'])
  })

  it('AND-root with one nested OR group produces (a AND (b OR c))', () => {
    const q = new FakeQuery()
    applyTreeToQuery(q, {
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'foo' },
        {
          operator: 'or',
          rules: [
            { constraint: 'amount', operator: 'gte',    value: 10 },
            { constraint: 'status', operator: 'equals', value: 'archived' },
          ],
        },
      ],
    }, [
      TextConstraint.make('title'),
      NumberConstraint.make('amount'),
      SelectConstraint.make('status'),
    ])
    assert.equal(q.ops.length, 2)
    assert.equal(q.ops[0]!.op, 'where')
    assert.equal(q.ops[1]!.op, 'whereGroup')
    const inner = q.ops[1]!.sub!
    // Inside the group: first leaf as AND, second as OR-wrapped.
    assert.equal(inner[0]!.op, 'where')
    assert.equal(inner[1]!.op, 'orWhereGroup')
  })

  it('three-level nesting (A AND (B OR (C AND D))) preserves the shape', () => {
    const q = new FakeQuery()
    applyTreeToQuery(q, {
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'A' },
        {
          operator: 'or',
          rules: [
            { constraint: 'title', operator: 'contains', value: 'B' },
            {
              operator: 'and',
              rules: [
                { constraint: 'amount', operator: 'gte', value: 1 },
                { constraint: 'amount', operator: 'lte', value: 9 },
              ],
            },
          ],
        },
      ],
    }, [TextConstraint.make('title'), NumberConstraint.make('amount')])

    // Top: `where(title)` then `whereGroup(...)`
    assert.equal(q.ops.length, 2)
    assert.equal(q.ops[0]!.op, 'where')
    assert.equal(q.ops[1]!.op, 'whereGroup')

    // Inside the OR group: `where(title=B)` then `orWhereGroup(...)`
    const orGroup = q.ops[1]!.sub!
    assert.equal(orGroup[0]!.op, 'where')
    assert.equal(orGroup[1]!.op, 'orWhereGroup')

    // The deepest AND group records both `where` calls flat under whereGroup.
    const deep = orGroup[1]!.sub!
    assert.equal(deep.length, 2)
    assert.equal(deep[0]!.op, 'where')
    assert.equal(deep[1]!.op, 'where')
  })

  it('empty sub-trees are no-ops (whereGroup never fires)', () => {
    const q = new FakeQuery()
    applyTreeToQuery(q, {
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'foo' },
        { operator: 'or', rules: [] },
      ],
    }, [TextConstraint.make('title')])
    // FakeQuery.whereGroup skips empty sub-builders entirely.
    assert.equal(q.ops.length, 1)
    assert.equal(q.ops[0]!.op, 'where')
  })

  it('falls back to flat AND chaining when whereGroup is missing', () => {
    const q = new FlatFakeQuery()
    applyTreeToQuery(q, {
      operator: 'or',
      rules: [
        { constraint: 'title',  operator: 'contains', value: 'foo' },
        { constraint: 'amount', operator: 'gte',      value: 10    },
      ],
    }, [TextConstraint.make('title'), NumberConstraint.make('amount')])
    // Without whereGroup, OR semantics are lost — both leaves chain via .where.
    assert.equal(q.ops.length, 2)
    assert.equal(q.ops[0]!.op, 'where')
    assert.equal(q.ops[1]!.op, 'where')
  })
})

describe('parseQueryBuilderValue (nested groups)', () => {
  it('round-trips a nested tree', () => {
    const enc = encodeQueryBuilderValue({
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'foo' },
        {
          operator: 'or',
          rules: [
            { constraint: 'amount', operator: 'gte',    value: 10 },
            { constraint: 'status', operator: 'equals', value: 'archived' },
          ],
        },
      ],
    })
    const dec = parseQueryBuilderValue(enc)
    assert.equal(dec.rules.length, 2)
    const inner = dec.rules[1]
    assert.ok(isQueryBuilderTree(inner!))
    assert.equal((inner as QueryBuilderTree).operator, 'or')
    assert.equal((inner as QueryBuilderTree).rules.length, 2)
  })

  it('drops empty sub-trees on encode', () => {
    const enc = encodeQueryBuilderValue({
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'foo' },
        { operator: 'or', rules: [] },
        { operator: 'and', rules: [{ constraint: 'amount', operator: 'gte', value: '' }] },
      ],
    })
    const dec = parseQueryBuilderValue(enc)
    assert.equal(dec.rules.length, 1)
    assert.equal((dec.rules[0] as { constraint: string }).constraint, 'title')
  })

  it('drops malformed sub-trees but keeps siblings', () => {
    const dec = parseQueryBuilderValue(JSON.stringify({
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'foo' },
        { operator: 'or' /* missing rules */ },
        { operator: 'or', rules: [{ constraint: 'amount', operator: 'gte', value: 10 }] },
      ],
    }))
    assert.equal(dec.rules.length, 2)
  })
})

describe('countLeafRules', () => {
  it('counts every rule across nested sub-trees', () => {
    const tree: QueryBuilderTree = {
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'a' },
        {
          operator: 'or',
          rules: [
            { constraint: 'title', operator: 'contains', value: 'b' },
            { constraint: 'title', operator: 'contains', value: 'c' },
          ],
        },
        {
          operator: 'and',
          rules: [
            {
              operator: 'or',
              rules: [{ constraint: 'title', operator: 'contains', value: 'd' }],
            },
          ],
        },
      ],
    }
    assert.equal(countLeafRules(tree), 4)
  })

  it('returns 0 for an empty tree', () => {
    assert.equal(countLeafRules(emptyQueryBuilderTree()), 0)
  })

  it('feeds the indicator pluraliser', () => {
    const f = QueryBuilderFilter.make('adv').label('Adv').constraints([TextConstraint.make('title')])
    f.withValue(JSON.stringify({
      operator: 'and',
      rules: [
        { constraint: 'title', operator: 'contains', value: 'a' },
        {
          operator: 'or',
          rules: [
            { constraint: 'title', operator: 'contains', value: 'b' },
            { constraint: 'title', operator: 'contains', value: 'c' },
          ],
        },
      ],
    }))
    assert.equal(f.getIndicator(), 'Adv: 3 conditions')
  })
})
