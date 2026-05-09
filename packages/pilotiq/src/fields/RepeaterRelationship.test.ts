import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { RepeaterField } from './RepeaterField.js'
import { TextField } from './TextField.js'
import { Form } from '../elements/Form.js'
import { dispatchFormSubmit, extractRelationshipRepeaters, loadRelationRows } from '../elements/dispatchForm.js'
import { applyRelationshipRepeaterFill } from '../pageData.js'
import type { ModelLike, ModelQuery } from '../orm/modelDefaults.js'

/**
 * Test harness: a tiny in-memory ModelLike with a `paginate`-shaped
 * query and basic CRUD methods that record their calls. Lets the
 * relationship tests assert the exact sequence of create / update /
 * delete operations against a shared fake without spinning up a
 * database.
 */
interface FakeRecord extends Record<string, unknown> {
  id?: string | number
}

function makeFakeChildModel(initial: FakeRecord[] = []) {
  let nextId = 1
  const rows: FakeRecord[] = initial.map(r => ({ ...r }))
  const calls: Array<
    | { kind: 'create'; data: Record<string, unknown> }
    | { kind: 'update'; id: string | number; data: Record<string, unknown> }
    | { kind: 'delete'; id: string | number }
  > = []

  const model: ModelLike = {
    primaryKey: 'id',
    find: async (id) => rows.find(r => String(r.id) === String(id)) ?? null,
    create: async (data) => {
      calls.push({ kind: 'create', data: { ...data } })
      const id = (data['id'] as string | number | undefined) ?? `c${nextId++}`
      const fresh: FakeRecord = { ...data, id }
      rows.push(fresh)
      return fresh
    },
    update: async (id, data) => {
      calls.push({ kind: 'update', id, data: { ...data } })
      const idx = rows.findIndex(r => String(r.id) === String(id))
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...data, id }
      }
      return rows[idx]
    },
    delete: async (id) => {
      calls.push({ kind: 'delete', id })
      const idx = rows.findIndex(r => String(r.id) === String(id))
      if (idx >= 0) rows.splice(idx, 1)
    },
    query: () => makeQuery(rows),
  }

  return { model, rows, calls }
}

/** Fake `ModelQuery` — only `paginate` is wired since that's all the
 * relationship pipeline calls. Other methods chain back to the same
 * query so `where` / `orderBy` are silently ignored. */
function makeQuery(rows: FakeRecord[]): ModelQuery {
  const q: ModelQuery = {
    where: () => q,
    orWhere: () => q,
    orderBy: () => q,
    paginate: async () => ({ data: rows.slice(), total: rows.length }),
  }
  return q
}

/**
 * Fake parent model with a `relations` map matching the rudder ORM
 * convention. The `relatedQuery` override pipes through to the child
 * model's rows filtered by FK so calls behave like a real hasMany.
 */
function makeFakeParentModel(opts: {
  childModel:    ModelLike
  childRows:     FakeRecord[]
  relationName:  string
  foreignKey:    string
}): ModelLike {
  const { childModel, childRows, relationName, foreignKey } = opts
  const parent: ModelLike & { relations: Record<string, unknown> } = {
    primaryKey: 'id',
    find:   async () => null,
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => {},
    query:  () => makeQuery([]),
    relatedQuery: (parentRecord) => {
      const parentId = (parentRecord as Record<string, unknown>)['id']
      const filtered = childRows.filter(r => String(r[foreignKey]) === String(parentId))
      return makeQuery(filtered)
    },
    relations: {
      [relationName]: { type: 'hasMany', model: () => childModel, foreignKey },
    },
  }
  return parent
}

describe('Repeater.relationship — extraction', () => {
  it('extractRelationshipRepeaters pulls the field value out of data', () => {
    const repeater = RepeaterField.make('items')
      .relationship('items')
      .schema([TextField.make('label').required()])
    const data: Record<string, unknown> = {
      title: 'Order #1',
      items: [{ __id: '1', label: 'A' }, { label: 'B' }],
      otherJsonRepeater: [{ x: 1 }],
    }
    const deferrals = extractRelationshipRepeaters([repeater], data)
    assert.equal(deferrals.length, 1)
    assert.equal(deferrals[0]!.cfg.name, 'items')
    assert.deepEqual(deferrals[0]!.rows, [{ __id: '1', label: 'A' }, { label: 'B' }])
    // Pulled out of `data`.
    assert.equal('items' in data, false)
    // Non-relationship keys untouched.
    assert.equal(data['title'], 'Order #1')
    assert.deepEqual(data['otherJsonRepeater'], [{ x: 1 }])
  })

  it('extractRelationshipRepeaters skips non-relationship Repeaters', () => {
    const json = RepeaterField.make('jsonItems').schema([TextField.make('x')])
    const rel  = RepeaterField.make('relItems').relationship('relItems').schema([TextField.make('y')])
    const data: Record<string, unknown> = { jsonItems: [{ x: 1 }], relItems: [{ y: 2 }] }
    const deferrals = extractRelationshipRepeaters([json, rel], data)
    assert.equal(deferrals.length, 1)
    assert.equal(deferrals[0]!.cfg.name, 'relItems')
    assert.equal('jsonItems' in data, true)
    assert.equal('relItems' in data,  false)
  })
})

describe('Repeater.relationship — full pipeline', () => {
  it('create — submits new rows with FK stamped, no existing rows', async () => {
    const child = makeFakeChildModel([])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })

    const form = Form.make()
      .schema([
        TextField.make('title'),
        RepeaterField.make('items').relationship('items').schema([
          TextField.make('label').required(),
        ]),
      ])
      .save(async (data) => {
        // Parent never sees the relationship key — extracted before save.
        assert.equal('items' in data, false)
        return { id: 'p1', title: data['title'] }
      })

    const result = await dispatchFormSubmit(
      form,
      { title: 'Order', items: [{ label: 'A' }, { label: 'B' }] },
      { values: { title: 'Order', items: [{ label: 'A' }, { label: 'B' }] }, parentModel: parent },
    )

    assert.equal(result.ok, true)
    // Two creates, no updates, no deletes.
    assert.equal(child.calls.filter(c => c.kind === 'create').length, 2)
    assert.equal(child.calls.filter(c => c.kind === 'update').length, 0)
    assert.equal(child.calls.filter(c => c.kind === 'delete').length, 0)
    // FK stamped on each create payload.
    const creates = child.calls.filter(c => c.kind === 'create') as Array<{ kind: 'create'; data: Record<string, unknown> }>
    assert.equal(creates[0]!.data['orderId'], 'p1')
    assert.equal(creates[1]!.data['orderId'], 'p1')
    assert.equal(creates[0]!.data['label'],   'A')
    assert.equal(creates[1]!.data['label'],   'B')
  })

  it('update — submits __id matching existing PK; routed through update without overwriting FK', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', orderId: 'p1', label: 'old A' },
      { id: 'c2', orderId: 'p1', label: 'old B' },
    ])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('items').relationship('items').schema([
          TextField.make('label').required(),
        ]),
      ])
      .save(async () => ({ id: 'p1' }))

    const result = await dispatchFormSubmit(
      form,
      { items: [{ __id: 'c1', label: 'new A' }, { __id: 'c2', label: 'new B' }] },
      {
        values:      { items: [{ __id: 'c1', label: 'new A' }, { __id: 'c2', label: 'new B' }] },
        record:      { id: 'p1' },
        parentModel: parent,
      },
    )
    assert.equal(result.ok, true)
    const updates = child.calls.filter(c => c.kind === 'update') as Array<{ kind: 'update'; id: string | number; data: Record<string, unknown> }>
    assert.equal(updates.length, 2)
    // FK NOT in update payload — stays as it was on the existing row.
    assert.equal('orderId' in updates[0]!.data, false)
    assert.equal('orderId' in updates[1]!.data, false)
    assert.equal(updates[0]!.data['label'], 'new A')
    assert.equal(updates[1]!.data['label'], 'new B')
    assert.equal(child.calls.filter(c => c.kind === 'create').length, 0)
    assert.equal(child.calls.filter(c => c.kind === 'delete').length, 0)
  })

  it('delete — existing PK omitted from submitted set is deleted', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', orderId: 'p1', label: 'A' },
      { id: 'c2', orderId: 'p1', label: 'B' },
      { id: 'c3', orderId: 'p1', label: 'C' },
    ])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('items').relationship('items').schema([
          TextField.make('label').required(),
        ]),
      ])
      .save(async () => ({ id: 'p1' }))

    const result = await dispatchFormSubmit(
      form,
      { items: [{ __id: 'c1', label: 'A' }] },
      {
        values:      { items: [{ __id: 'c1', label: 'A' }] },
        record:      { id: 'p1' },
        parentModel: parent,
      },
    )
    assert.equal(result.ok, true)
    const deletes = child.calls.filter(c => c.kind === 'delete') as Array<{ kind: 'delete'; id: string | number }>
    assert.deepEqual(deletes.map(c => String(c.id)).sort(), ['c2', 'c3'])
  })

  it('mixed — single submit performs creates, updates, and deletes in one diff', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', orderId: 'p1', label: 'A' },
      { id: 'c2', orderId: 'p1', label: 'B' },
    ])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('items').relationship('items').schema([
          TextField.make('label').required(),
        ]),
      ])
      .save(async () => ({ id: 'p1' }))

    // c1 stays (renamed), c2 gone, plus a new row.
    const result = await dispatchFormSubmit(
      form,
      { items: [{ __id: 'c1', label: 'A renamed' }, { label: 'fresh' }] },
      {
        values:      { items: [{ __id: 'c1', label: 'A renamed' }, { label: 'fresh' }] },
        record:      { id: 'p1' },
        parentModel: parent,
      },
    )
    assert.equal(result.ok, true)
    assert.equal(child.calls.filter(c => c.kind === 'create').length, 1)
    assert.equal(child.calls.filter(c => c.kind === 'update').length, 1)
    assert.equal(child.calls.filter(c => c.kind === 'delete').length, 1)
    // Spot-check the create stamps the FK.
    const created = child.calls.find(c => c.kind === 'create') as { kind: 'create'; data: Record<string, unknown> }
    assert.equal(created.data['orderId'], 'p1')
    assert.equal(created.data['label'],   'fresh')
  })

  it('orderColumn writes 0-based index on every create + update', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', orderId: 'p1', label: 'A', sort: 5 },
    ])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .orderColumn('sort')
          .schema([TextField.make('label').required()]),
      ])
      .save(async () => ({ id: 'p1' }))

    const result = await dispatchFormSubmit(
      form,
      { items: [{ label: 'fresh first' }, { __id: 'c1', label: 'A second' }] },
      {
        values:      { items: [{ label: 'fresh first' }, { __id: 'c1', label: 'A second' }] },
        record:      { id: 'p1' },
        parentModel: parent,
      },
    )
    assert.equal(result.ok, true)
    const create = child.calls.find(c => c.kind === 'create') as { kind: 'create'; data: Record<string, unknown> }
    const update = child.calls.find(c => c.kind === 'update') as { kind: 'update'; id: string | number; data: Record<string, unknown> }
    assert.equal(create.data['sort'], 0)
    assert.equal(update.data['sort'], 1)
  })

  it('throws when parentModel is missing on the FormContext', async () => {
    const form = Form.make()
      .schema([
        RepeaterField.make('items').relationship('items').schema([TextField.make('label')]),
      ])
      .save(async () => ({ id: 'p1' }))

    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { items: [{ label: 'A' }] },
        { values: { items: [{ label: 'A' }] } },
      ),
      /parentModel on the FormContext/,
    )
  })

  it('throws when descriptor lookup fails and no override is set', async () => {
    const child = makeFakeChildModel()
    // Parent missing the `relations` map entry for 'phantom'.
    const parent: ModelLike = {
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => makeQuery([]),
      relatedQuery: () => makeQuery([]),
    }

    const form = Form.make()
      .schema([
        RepeaterField.make('phantom').relationship('phantom').schema([TextField.make('x').required()]),
      ])
      .save(async () => ({ id: 'p1' }))

    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { phantom: [{ x: 'a' }] },
        {
          values:      { phantom: [{ x: 'a' }] },
          parentModel: parent,
        },
      ),
      /could not resolve the child model/,
    )
    void child
  })

  it('honors explicit model + foreignKey overrides on the field config (no descriptor needed)', async () => {
    const child = makeFakeChildModel()
    // Parent with NO relations map — overrides have to carry the day.
    const parent: ModelLike = {
      primaryKey: 'id',
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => makeQuery([]),
      relatedQuery: () => makeQuery(child.rows),
    }

    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship({ name: 'items', model: child.model, foreignKey: 'orderId' })
          .schema([TextField.make('label').required()]),
      ])
      .save(async () => ({ id: 'p1' }))

    const result = await dispatchFormSubmit(
      form,
      { items: [{ label: 'A' }] },
      {
        values:      { items: [{ label: 'A' }] },
        parentModel: parent,
      },
    )
    assert.equal(result.ok, true)
    assert.equal(child.calls.length, 1)
    const created = child.calls[0] as { kind: 'create'; data: Record<string, unknown> }
    assert.equal(created.data['orderId'], 'p1')
  })
})

describe('Repeater.relationship — load (applyRelationshipRepeaterFill)', () => {
  it('stamps __id from PK and strips PK + FK from each row', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', orderId: 'p1', label: 'A' },
      { id: 'c2', orderId: 'p1', label: 'B' },
    ])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })

    const form = Form.make().schema([
      TextField.make('title'),
      RepeaterField.make('items').relationship('items').schema([
        TextField.make('label').required(),
      ]),
    ])

    const out = await applyRelationshipRepeaterFill(
      form,
      { title: 'Order' },
      { id: 'p1' },
      parent,
    )
    assert.deepEqual(out['items'], [
      { __id: 'c1', label: 'A' },
      { __id: 'c2', label: 'B' },
    ])
    // Non-relationship values untouched.
    assert.equal(out['title'], 'Order')
  })

  it('no-op when record is null, parentModel is missing, or there are no relationship Repeaters', async () => {
    const form = Form.make().schema([
      RepeaterField.make('items').relationship('items').schema([TextField.make('label')]),
    ])
    const parent = makeFakeParentModel({
      childModel:   makeFakeChildModel().model,
      childRows:    [],
      relationName: 'items',
      foreignKey:   'orderId',
    })
    // null record
    assert.deepEqual(
      await applyRelationshipRepeaterFill(form, { x: 1 }, null, parent),
      { x: 1 },
    )
    // missing parentModel
    assert.deepEqual(
      await applyRelationshipRepeaterFill(form, { x: 1 }, { id: 'p1' }, undefined),
      { x: 1 },
    )
    // form without relationship Repeaters
    const plain = Form.make().schema([TextField.make('title')])
    assert.deepEqual(
      await applyRelationshipRepeaterFill(plain, { title: 't' }, { id: 'p1' }, parent),
      { title: 't' },
    )
  })

  it('loadRelationRows reads through resolveRelatedQuery (paginate)', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', orderId: 'p1', label: 'A' },
    ])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })
    const rows = await loadRelationRows(parent, { id: 'p1' }, 'items')
    assert.equal(rows.length, 1)
    assert.equal((rows[0] as Record<string, unknown>)['label'], 'A')
  })
})

describe('Repeater.relationship — morphMany', () => {
  // Parent shape: `Order.items: morphMany(Item, 'itemable')` — child
  // carries `itemableId` + `itemableType` instead of an FK column.
  // `computeMorphPayload(parent, descriptor)` reads the discriminator off
  // the parent **record**'s `constructor.morphAlias ?? constructor.name`,
  // so the parent record returned by `Form.save()` has to be a class
  // instance (not a plain object literal).
  function makeMorphParentSetup(opts: {
    childModel:    ModelLike
    childRows:     FakeRecord[]
    relationName:  string
    morphName:     string
  }) {
    const { childModel, childRows, relationName, morphName } = opts
    const idCol   = `${morphName}Id`
    const typeCol = `${morphName}Type`

    class Order {
      id?: string
      constructor(init?: Partial<{ id: string }>) { Object.assign(this, init) }
    }

    const parentModel: ModelLike & { relations: Record<string, unknown> } = {
      primaryKey: 'id',
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => makeQuery([]),
      relatedQuery: (parentRecord) => {
        const parentId   = (parentRecord as Record<string, unknown>)['id']
        const parentType = (parentRecord as { constructor?: { morphAlias?: string; name?: string } })
          .constructor?.morphAlias
          ?? (parentRecord as { constructor?: { name?: string } }).constructor?.name
        const filtered = childRows.filter(r =>
          String(r[idCol]) === String(parentId) && r[typeCol] === parentType,
        )
        return makeQuery(filtered)
      },
      relations: {
        [relationName]: { type: 'morphMany', morphName, model: () => childModel },
      },
    }
    return { parentModel, makeRecord: (id: string) => new Order({ id }) }
  }

  it('create — stamps <morphName>Id + <morphName>Type instead of an FK column', async () => {
    const child = makeFakeChildModel([])
    const { parentModel, makeRecord } = makeMorphParentSetup({
      childModel: child.model, childRows: child.rows,
      relationName: 'items', morphName: 'itemable',
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .schema([TextField.make('label').required()]),
      ])
      .save(async () => makeRecord('p1'))

    const submittedRows = [{ label: 'A' }, { label: 'B' }]
    const result = await dispatchFormSubmit(
      form,
      { items: submittedRows },
      { values: { items: submittedRows }, parentModel },
    )
    assert.equal(result.ok, true)
    const creates = child.calls.filter(c => c.kind === 'create') as Array<{ kind: 'create'; data: Record<string, unknown> }>
    assert.equal(creates.length, 2)
    for (const c of creates) {
      assert.equal(c.data['itemableId'],   'p1')
      assert.equal(c.data['itemableType'], 'Order')
      assert.equal('orderId' in c.data, false)
    }
    assert.equal(creates[0]!.data['label'], 'A')
    assert.equal(creates[1]!.data['label'], 'B')
  })

  it('update — does not overwrite morph cols on update (defense against re-link)', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', itemableId: 'p1', itemableType: 'Order', label: 'A' },
      { id: 'c2', itemableId: 'p1', itemableType: 'Order', label: 'B' },
    ])
    const { parentModel, makeRecord } = makeMorphParentSetup({
      childModel: child.model, childRows: child.rows,
      relationName: 'items', morphName: 'itemable',
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .schema([TextField.make('label')]),
      ])
      .save(async () => makeRecord('p1'))

    const submittedRows = [
      // Tampered client tries to send itemableType=Invoice; framework wins last.
      { __id: 'c1', label: 'A2', itemableType: 'Invoice' },
      { __id: 'c2', label: 'B2' },
    ]
    const result = await dispatchFormSubmit(
      form,
      { items: submittedRows },
      { values: { items: submittedRows }, record: makeRecord('p1'), parentModel },
    )
    assert.equal(result.ok, true)
    const updates = child.calls.filter(c => c.kind === 'update') as Array<{ kind: 'update'; id: string | number; data: Record<string, unknown> }>
    assert.equal(updates.length, 2)
    for (const u of updates) {
      assert.equal('itemableId'   in u.data, false)
      assert.equal('itemableType' in u.data, false)
    }
  })

  it('delete — existing PKs missing from submitted set are deleted (same shape as hasMany)', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', itemableId: 'p1', itemableType: 'Order', label: 'A' },
      { id: 'c2', itemableId: 'p1', itemableType: 'Order', label: 'B' },
      { id: 'c3', itemableId: 'p1', itemableType: 'Order', label: 'C' },
    ])
    const { parentModel, makeRecord } = makeMorphParentSetup({
      childModel: child.model, childRows: child.rows,
      relationName: 'items', morphName: 'itemable',
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .schema([TextField.make('label')]),
      ])
      .save(async () => makeRecord('p1'))

    const submittedRows = [{ __id: 'c1', label: 'A' }]
    const result = await dispatchFormSubmit(
      form,
      { items: submittedRows },
      { values: { items: submittedRows }, record: makeRecord('p1'), parentModel },
    )
    assert.equal(result.ok, true)
    const deletes = child.calls.filter(c => c.kind === 'delete') as Array<{ kind: 'delete'; id: string | number }>
    assert.deepEqual(deletes.map(c => String(c.id)).sort(), ['c2', 'c3'])
  })

  it('orderColumn writes 0-based index on every morph create + update', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', itemableId: 'p1', itemableType: 'Order', label: 'A', sort: 5 },
    ])
    const { parentModel, makeRecord } = makeMorphParentSetup({
      childModel: child.model, childRows: child.rows,
      relationName: 'items', morphName: 'itemable',
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .orderColumn('sort')
          .schema([TextField.make('label')]),
      ])
      .save(async () => makeRecord('p1'))

    const submittedRows = [
      {            label: 'first' },
      { __id: 'c1', label: 'second' },
    ]
    const result = await dispatchFormSubmit(
      form,
      { items: submittedRows },
      { values: { items: submittedRows }, record: makeRecord('p1'), parentModel },
    )
    assert.equal(result.ok, true)
    const create = child.calls.find(c => c.kind === 'create') as { kind: 'create'; data: Record<string, unknown> }
    const update = child.calls.find(c => c.kind === 'update') as { kind: 'update'; id: string | number; data: Record<string, unknown> }
    assert.equal(create.data['sort'], 0)
    assert.equal(update.data['sort'], 1)
  })

  it('morphType — explicit override on the relation entry wins over constructor name', async () => {
    const child = makeFakeChildModel([])
    class Order {
      id?: string
      constructor(init?: Partial<{ id: string }>) { Object.assign(this, init) }
    }
    const parentModel: ModelLike & { relations: Record<string, unknown> } = {
      primaryKey: 'id',
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => makeQuery([]),
      relatedQuery: () => makeQuery([]),
      relations: {
        items: { type: 'morphMany', morphName: 'itemable', morphType: 'CustomDiscriminator', model: () => child.model },
      },
    }

    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .schema([TextField.make('label')]),
      ])
      .save(async () => new Order({ id: 'p1' }))

    const submittedRows = [{ label: 'A' }]
    const result = await dispatchFormSubmit(
      form,
      { items: submittedRows },
      { values: { items: submittedRows }, parentModel },
    )
    assert.equal(result.ok, true)
    const create = child.calls.find(c => c.kind === 'create') as { kind: 'create'; data: Record<string, unknown> }
    assert.equal(create.data['itemableType'], 'CustomDiscriminator')
  })

  it('load — applyRelationshipRepeaterFill strips morph cols from rendered rows', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', itemableId: 'p1', itemableType: 'Order', label: 'A' },
      { id: 'c2', itemableId: 'p1', itemableType: 'Order', label: 'B' },
    ])
    const { parentModel, makeRecord } = makeMorphParentSetup({
      childModel: child.model, childRows: child.rows,
      relationName: 'items', morphName: 'itemable',
    })

    const form = Form.make().schema([
      TextField.make('title'),
      RepeaterField.make('items')
        .relationship('items')
        .schema([TextField.make('label')]),
    ])

    const out = await applyRelationshipRepeaterFill(form, { title: 'P' }, makeRecord('p1'), parentModel)
    assert.deepEqual(out['items'], [
      { __id: 'c1', label: 'A' },
      { __id: 'c2', label: 'B' },
    ])
    // Morph cols should NOT leak into the rendered row payload.
    for (const row of out['items'] as Array<Record<string, unknown>>) {
      assert.equal('itemableId'   in row, false)
      assert.equal('itemableType' in row, false)
      assert.equal('id'           in row, false)
    }
  })

  it('morphMany config without the model thunk surfaces a clear error', async () => {
    const child = makeFakeChildModel([])
    class Order {
      id?: string
      constructor(init?: Partial<{ id: string }>) { Object.assign(this, init) }
    }
    const parentModel: ModelLike & { relations: Record<string, unknown> } = {
      primaryKey: 'id',
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => makeQuery([]),
      relatedQuery: () => makeQuery([]),
      relations: {
        // No `model` thunk — getMorphRelationDescriptor returns
        // undefined, so the resolver falls through to the hasMany
        // branch which then asks for foreignKey. The user-facing fix
        // is the same: configure-the-relation.
        items: { type: 'morphMany', morphName: 'itemable' },
      },
    }

    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .schema([TextField.make('label')]),
      ])
      .save(async () => new Order({ id: 'p1' }))

    const submittedRows = [{ label: 'A' }]
    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { items: submittedRows },
        { values: { items: submittedRows }, parentModel },
      ),
      /could not resolve the child model/,
    )
    void child
  })
})

/**
 * Test harness for M2M relations — `parent[rel]()` returns a recorded
 * accessor with `attach` / `detach` / `sync`. Mirrors `_makeBelongsToManyAccessor`
 * from the rudder ORM (the per-relation accessor returned by
 * `Model.belongsToMany`). Tests assert against `pivotCalls` directly so
 * we can verify the exact sequence of operations against the pivot.
 */
function makeM2MParentSetup(opts: {
  childModel:    ModelLike
  childRows:     FakeRecord[]
  relationName:  string
  /** When set, the related rows on load are filtered to those whose
   *  PK appears in the pivot. Lets `applyRelationshipRepeaterFill`
   *  return the right slice. */
  attachedIds?:  Set<string | number>
}) {
  const { childModel, childRows, relationName } = opts
  const attachedIds = opts.attachedIds ?? new Set<string | number>(childRows.map(r => r['id'] as string | number))
  const pivotCalls: Array<
    | { kind: 'attach'; ids: Array<string | number> }
    | { kind: 'detach'; ids: Array<string | number> | undefined }
    | { kind: 'sync';   desired: Array<string | number> }
  > = []

  class Parent {
    id?: string
    constructor(init?: Partial<{ id: string }>) { Object.assign(this, init) }
    [relationName]() {
      return {
        attach: async (input: ReadonlyArray<string | number> | Record<string, Record<string, unknown>>) => {
          const ids = Array.isArray(input)
            ? [...input]
            : Object.keys(input).map(k => /^\d+$/.test(k) ? Number(k) : k)
          for (const id of ids) attachedIds.add(id)
          pivotCalls.push({ kind: 'attach', ids })
        },
        detach: async (ids?: ReadonlyArray<string | number>) => {
          if (ids === undefined) {
            const removed = [...attachedIds]
            attachedIds.clear()
            pivotCalls.push({ kind: 'detach', ids: undefined })
            return removed.length
          }
          for (const id of ids) attachedIds.delete(id)
          pivotCalls.push({ kind: 'detach', ids: [...ids] })
          return ids.length
        },
        sync: async (desiredIds: ReadonlyArray<string | number>) => {
          pivotCalls.push({ kind: 'sync', desired: [...desiredIds] })
          return { attached: [], detached: [] }
        },
      }
    }
  }

  const parentModel: ModelLike & { relations: Record<string, unknown> } = {
    primaryKey: 'id',
    find:   async () => null,
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => {},
    query:  () => makeQuery([]),
    // Resolve "currently attached" rows for the parent — read from the
    // pivot snapshot. Drives both `loadRelationRows` (in the diff loop)
    // and `applyRelationshipRepeaterFill` (in load mode).
    relatedQuery: () => makeQuery(childRows.filter(r => attachedIds.has(r['id'] as string | number))),
    relations: {
      [relationName]: { type: 'belongsToMany', model: () => childModel, pivotTable: 'pivot' },
    },
  }
  return {
    parentModel,
    pivotCalls,
    attachedIds,
    makeRecord: (id: string) => new Parent({ id }),
  }
}

describe('Repeater.relationship — belongsToMany', () => {
  // Parent shape: `Article.tags: belongsToMany(Tag, pivotTable: 'article_tag')`.
  // Child Tag rows have NO FK column — pivot table holds the link.
  // Submit semantics: create-row → M.create + accessor.attach; update-row
  // → M.update (pivot untouched); delete-row → accessor.detach (no
  // M.delete, child may be attached to other parents).

  it('create — M.create the related child then attach via accessor (no FK on payload)', async () => {
    const child = makeFakeChildModel([])
    const setup = makeM2MParentSetup({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'tags',
      attachedIds:  new Set(),
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .schema([TextField.make('name').required()]),
      ])
      .save(async () => setup.makeRecord('a1'))

    const submittedRows = [{ name: 'red' }, { name: 'blue' }]
    const result = await dispatchFormSubmit(
      form,
      { tags: submittedRows },
      { values: { tags: submittedRows }, parentModel: setup.parentModel },
    )
    assert.equal(result.ok, true)
    const creates = child.calls.filter(c => c.kind === 'create') as Array<{ kind: 'create'; data: Record<string, unknown> }>
    assert.equal(creates.length, 2)
    assert.equal(creates[0]!.data['name'], 'red')
    assert.equal(creates[1]!.data['name'], 'blue')
    // No FK / morph cols stamped on the related child — pivot covers it.
    for (const c of creates) {
      assert.equal('articleId'   in c.data, false)
      assert.equal('taggableId'   in c.data, false)
      assert.equal('taggableType' in c.data, false)
    }
    // One attach per new row, in row order.
    const attachCalls = setup.pivotCalls.filter(c => c.kind === 'attach') as Array<{ kind: 'attach'; ids: Array<string | number> }>
    assert.equal(attachCalls.length, 2)
    assert.equal(attachCalls[0]!.ids.length, 1)
    assert.equal(attachCalls[1]!.ids.length, 1)
    // No pivot detach.
    assert.equal(setup.pivotCalls.filter(c => c.kind === 'detach').length, 0)
  })

  it('update — __id matching an attached PK routes through M.update; pivot untouched', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', name: 'red' },
      { id: 'c2', name: 'blue' },
    ])
    const setup = makeM2MParentSetup({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'tags',
      attachedIds:  new Set(['c1', 'c2']),
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .schema([TextField.make('name')]),
      ])
      .save(async () => setup.makeRecord('a1'))

    const submittedRows = [
      { __id: 'c1', name: 'crimson' },
      { __id: 'c2', name: 'navy' },
    ]
    const result = await dispatchFormSubmit(
      form,
      { tags: submittedRows },
      { values: { tags: submittedRows }, record: setup.makeRecord('a1'), parentModel: setup.parentModel },
    )
    assert.equal(result.ok, true)
    const updates = child.calls.filter(c => c.kind === 'update') as Array<{ kind: 'update'; id: string | number; data: Record<string, unknown> }>
    assert.equal(updates.length, 2)
    assert.equal(updates[0]!.data['name'], 'crimson')
    assert.equal(updates[1]!.data['name'], 'navy')
    // No pivot operations — update doesn't touch attach/detach.
    assert.equal(setup.pivotCalls.length, 0)
  })

  it('delete — existing attached PK omitted from submitted set is detached only (no M.delete)', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', name: 'red' },
      { id: 'c2', name: 'blue' },
      { id: 'c3', name: 'green' },
    ])
    const setup = makeM2MParentSetup({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'tags',
      attachedIds:  new Set(['c1', 'c2', 'c3']),
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .schema([TextField.make('name')]),
      ])
      .save(async () => setup.makeRecord('a1'))

    const submittedRows = [{ __id: 'c1', name: 'red' }]
    const result = await dispatchFormSubmit(
      form,
      { tags: submittedRows },
      { values: { tags: submittedRows }, record: setup.makeRecord('a1'), parentModel: setup.parentModel },
    )
    assert.equal(result.ok, true)
    // No M.delete on the related child — only pivot detach.
    assert.equal(child.calls.filter(c => c.kind === 'delete').length, 0)
    const detachCalls = setup.pivotCalls.filter(c => c.kind === 'detach') as Array<{ kind: 'detach'; ids: Array<string | number> | undefined }>
    // Each missing PK gets its own detach call.
    const detachedIds = detachCalls
      .flatMap(c => c.ids ?? [])
      .map(id => String(id))
      .sort()
    assert.deepEqual(detachedIds, ['c2', 'c3'])
  })

  it('mixed — single submit performs create+attach, update, and detach in one diff', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', name: 'red' },
      { id: 'c2', name: 'blue' },
    ])
    const setup = makeM2MParentSetup({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'tags',
      attachedIds:  new Set(['c1', 'c2']),
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .schema([TextField.make('name')]),
      ])
      .save(async () => setup.makeRecord('a1'))

    const submittedRows = [
      { __id: 'c1', name: 'crimson' },
      {            name: 'fresh' },
    ]
    const result = await dispatchFormSubmit(
      form,
      { tags: submittedRows },
      { values: { tags: submittedRows }, record: setup.makeRecord('a1'), parentModel: setup.parentModel },
    )
    assert.equal(result.ok, true)
    assert.equal(child.calls.filter(c => c.kind === 'create').length, 1)
    assert.equal(child.calls.filter(c => c.kind === 'update').length, 1)
    assert.equal(child.calls.filter(c => c.kind === 'delete').length, 0)
    assert.equal(setup.pivotCalls.filter(c => c.kind === 'attach').length, 1)
    const detachCalls = setup.pivotCalls.filter(c => c.kind === 'detach') as Array<{ kind: 'detach'; ids: Array<string | number> | undefined }>
    const detachedIds = detachCalls.flatMap(c => c.ids ?? []).map(id => String(id))
    assert.deepEqual(detachedIds, ['c2'])
  })

  it('descriptor lookup — explicit cfg.model wins over the relation entry thunk', async () => {
    const child = makeFakeChildModel([])
    const otherChild = makeFakeChildModel([])
    const setup = makeM2MParentSetup({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'tags',
      attachedIds:  new Set(),
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship({ name: 'tags', model: otherChild.model })
          .schema([TextField.make('name')]),
      ])
      .save(async () => setup.makeRecord('a1'))

    const submittedRows = [{ name: 'red' }]
    const result = await dispatchFormSubmit(
      form,
      { tags: submittedRows },
      { values: { tags: submittedRows }, parentModel: setup.parentModel },
    )
    assert.equal(result.ok, true)
    // Override model received the create, NOT the descriptor's model.
    assert.equal(otherChild.calls.filter(c => c.kind === 'create').length, 1)
    assert.equal(child.calls.filter(c => c.kind === 'create').length, 0)
  })

  it('orderColumn — rejected under M2M v1 with a clear error', async () => {
    const child = makeFakeChildModel([])
    const setup = makeM2MParentSetup({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'tags',
      attachedIds:  new Set(),
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .orderColumn('sort')
          .schema([TextField.make('name')]),
      ])
      .save(async () => setup.makeRecord('a1'))

    const submittedRows = [{ name: 'red' }]
    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { tags: submittedRows },
        { values: { tags: submittedRows }, parentModel: setup.parentModel },
      ),
      /orderColumn\(\) is not supported under 'belongsToMany'/,
    )
  })

  it('missing accessor — clear error when parent exposes neither parent[rel]() nor a legacy related() shape', async () => {
    const child = makeFakeChildModel([])
    // Parent missing the prototype `tags()` method AND missing `related`.
    const parentModel: ModelLike & { relations: Record<string, unknown> } = {
      primaryKey: 'id',
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => makeQuery([]),
      relatedQuery: () => makeQuery([]),
      relations: {
        tags: { type: 'belongsToMany', model: () => child.model, pivotTable: 'pivot' },
      },
    }

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .schema([TextField.make('name')]),
      ])
      .save(async () => ({ id: 'a1' }))

    const submittedRows = [{ name: 'red' }]
    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { tags: submittedRows },
        { values: { tags: submittedRows }, parentModel },
      ),
      /could not resolve the pivot-mutation accessor/,
    )
  })
})

describe('Repeater.relationship — morphToMany', () => {
  // Parent shape: `Post.tags: morphToMany(Tag, pivotTable: 'taggable',
  // morphName: 'taggable')`. The accessor handles the polymorphic stamp
  // on the pivot row internally — pilotiq doesn't see the morph cols.
  // Behavior is identical to belongsToMany from pilotiq's perspective.

  it('create — same path as belongsToMany; the accessor handles polymorphic stamping internally', async () => {
    const child = makeFakeChildModel([])
    const attachedIds = new Set<string | number>()
    const pivotCalls: Array<{ kind: 'attach'; ids: Array<string | number> }> = []
    class Post {
      id?: string
      constructor(init?: Partial<{ id: string }>) { Object.assign(this, init) }
      tags() {
        return {
          attach: async (input: ReadonlyArray<string | number>) => {
            for (const id of input) attachedIds.add(id)
            pivotCalls.push({ kind: 'attach', ids: [...input] })
          },
          detach: async () => 0,
          sync:   async () => ({ attached: [], detached: [] }),
        }
      }
    }
    const parentModel: ModelLike & { relations: Record<string, unknown> } = {
      primaryKey: 'id',
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => makeQuery([]),
      relatedQuery: () => makeQuery([]),
      relations: {
        tags: { type: 'morphToMany', model: () => child.model, pivotTable: 'taggable', morphName: 'taggable' },
      },
    }

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .schema([TextField.make('name').required()]),
      ])
      .save(async () => new Post({ id: 'p1' }))

    const submittedRows = [{ name: 'red' }, { name: 'blue' }]
    const result = await dispatchFormSubmit(
      form,
      { tags: submittedRows },
      { values: { tags: submittedRows }, parentModel },
    )
    assert.equal(result.ok, true)
    assert.equal(child.calls.filter(c => c.kind === 'create').length, 2)
    assert.equal(pivotCalls.filter(c => c.kind === 'attach').length, 2)
  })
})

describe('Repeater.relationship — morphedByMany', () => {
  // Parent shape: `Tag.posts: morphedByMany(Post, pivotTable: 'taggable',
  // morphName: 'taggable')`. Inverse polymorphic side. Same accessor surface.

  it('detach-only on row removal (parallel to belongsToMany / morphToMany)', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', title: 'first' },
      { id: 'c2', title: 'second' },
    ])
    const attachedIds = new Set<string | number>(['c1', 'c2'])
    const pivotCalls: Array<{ kind: 'detach'; ids: Array<string | number> | undefined }> = []
    class Tag {
      id?: string
      constructor(init?: Partial<{ id: string }>) { Object.assign(this, init) }
      posts() {
        return {
          attach: async () => {},
          detach: async (ids?: ReadonlyArray<string | number>) => {
            if (ids === undefined) { attachedIds.clear(); pivotCalls.push({ kind: 'detach', ids: undefined }); return 0 }
            for (const id of ids) attachedIds.delete(id)
            pivotCalls.push({ kind: 'detach', ids: [...ids] })
            return ids.length
          },
          sync: async () => ({ attached: [], detached: [] }),
        }
      }
    }
    const parentModel: ModelLike & { relations: Record<string, unknown> } = {
      primaryKey: 'id',
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => makeQuery([]),
      relatedQuery: () => makeQuery(child.rows.filter(r => attachedIds.has(r['id'] as string | number))),
      relations: {
        posts: { type: 'morphedByMany', model: () => child.model, pivotTable: 'taggable', morphName: 'taggable' },
      },
    }

    const form = Form.make()
      .schema([
        RepeaterField.make('posts')
          .relationship('posts')
          .schema([TextField.make('title')]),
      ])
      .save(async () => new Tag({ id: 't1' }))

    const submittedRows = [{ __id: 'c1', title: 'first' }]
    const result = await dispatchFormSubmit(
      form,
      { posts: submittedRows },
      { values: { posts: submittedRows }, record: new Tag({ id: 't1' }), parentModel },
    )
    assert.equal(result.ok, true)
    // Detach c2; never touch M.delete.
    assert.equal(child.calls.filter(c => c.kind === 'delete').length, 0)
    const detachedIds = pivotCalls.flatMap(c => c.ids ?? []).map(id => String(id))
    assert.deepEqual(detachedIds, ['c2'])
  })
})

/**
 * Test harness for M2M pivot-extras — `withPivot(...cols)` projection on
 * the load query + `updatePivot(id, data)` + per-id-pivot `attach({ id:
 * data })` on the accessor. Mirrors rudder ORM's
 * `feat(orm): pivot-extras read/update + per-id sync` (PR #251).
 *
 * Each child row has an associated pivot row keyed by the child's PK.
 * `withPivot` stamps the listed pivot columns onto each row under
 * `row.pivot = { … }`. `updatePivot` patches the matching pivot row.
 */
function makeM2MParentSetupWithPivot(opts: {
  childModel:    ModelLike
  childRows:     FakeRecord[]
  relationName:  string
  /** Pivot rows keyed by child PK. Each entry holds the extra columns. */
  pivot:         Map<string, Record<string, unknown>>
  attachedIds?:  Set<string | number>
}) {
  const { childModel, childRows, relationName, pivot } = opts
  const attachedIds = opts.attachedIds
    ?? new Set<string | number>(childRows.map(r => r['id'] as string | number))
  const pivotCalls: Array<
    | { kind: 'attach';      ids: Array<string | number>; pivot?: Record<string, Record<string, unknown>> }
    | { kind: 'detach';      ids: Array<string | number> | undefined }
    | { kind: 'updatePivot'; id: string | number; data: Record<string, unknown> }
  > = []

  function projectPivot(rows: FakeRecord[], cols: string[]): FakeRecord[] {
    return rows.map(r => {
      const pk = String(r['id'])
      const pe = pivot.get(pk) ?? {}
      const proj: Record<string, unknown> = {}
      for (const c of cols) proj[c] = pe[c] ?? null
      return { ...r, pivot: proj }
    })
  }

  /** Pivot-aware fake query — adds `withPivot` to the chain. */
  function makePivotAwareQuery(rows: FakeRecord[]): ModelQuery {
    let pivotCols: string[] | undefined
    const q: ModelQuery = {
      where:    () => q,
      orWhere:  () => q,
      orderBy:  () => q,
      withPivot(...cols: string[]) {
        pivotCols = cols
        return q
      },
      paginate: async () => {
        const projected = pivotCols ? projectPivot(rows, pivotCols) : rows.slice()
        return { data: projected, total: projected.length }
      },
    }
    return q
  }

  class Parent {
    id?: string
    constructor(init?: Partial<{ id: string }>) { Object.assign(this, init) }
    [relationName]() {
      return {
        attach: async (input: ReadonlyArray<string | number> | Record<string, Record<string, unknown>>) => {
          if (Array.isArray(input)) {
            const ids = [...input]
            for (const id of ids) attachedIds.add(id)
            pivotCalls.push({ kind: 'attach', ids })
          } else {
            const map = input as Record<string, Record<string, unknown>>
            const ids = Object.keys(map).map(k => /^\d+$/.test(k) ? Number(k) : k) as Array<string | number>
            for (const id of ids) {
              attachedIds.add(id)
              pivot.set(String(id), { ...(pivot.get(String(id)) ?? {}), ...map[String(id)] })
            }
            pivotCalls.push({ kind: 'attach', ids, pivot: map })
          }
        },
        detach: async (ids?: ReadonlyArray<string | number>) => {
          if (ids === undefined) {
            const removed = [...attachedIds]
            attachedIds.clear()
            for (const id of removed) pivot.delete(String(id))
            pivotCalls.push({ kind: 'detach', ids: undefined })
            return removed.length
          }
          for (const id of ids) {
            attachedIds.delete(id)
            pivot.delete(String(id))
          }
          pivotCalls.push({ kind: 'detach', ids: [...ids] })
          return ids.length
        },
        updatePivot: async (id: string | number, data: Record<string, unknown>): Promise<number> => {
          pivotCalls.push({ kind: 'updatePivot', id, data: { ...data } })
          const key = String(id)
          if (!pivot.has(key)) return 0
          pivot.set(key, { ...pivot.get(key), ...data })
          return 1
        },
      }
    }
  }

  const parentModel: ModelLike & { relations: Record<string, unknown> } = {
    primaryKey: 'id',
    find:   async () => null,
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => {},
    query:  () => makeQuery([]),
    relatedQuery: () => makePivotAwareQuery(
      childRows.filter(r => attachedIds.has(r['id'] as string | number)),
    ),
    relations: {
      [relationName]: { type: 'belongsToMany', model: () => childModel, pivotTable: 'pivot' },
    },
  }
  return {
    parentModel,
    pivotCalls,
    pivotState: pivot,
    attachedIds,
    makeRecord: (id: string) => new Parent({ id }),
  }
}

describe('Repeater.relationship — pivotColumns', () => {
  // Surface check: setter requires .relationship() first; round-trips into cfg.
  it('Repeater.pivotColumns([…]) requires .relationship() first', () => {
    assert.throws(
      () => RepeaterField.make('tags').pivotColumns(['role']),
      /requires relationship\(\) to be configured first/,
    )
  })

  it('Repeater.pivotColumns([…]) writes to the relationship cfg', () => {
    const r = RepeaterField.make('tags')
      .relationship('tags')
      .pivotColumns(['role', 'assignedAt'])
    assert.deepEqual(r.getRelationship()?.pivotColumns, ['role', 'assignedAt'])
  })

  it('load — withPivot ferries the configured columns; row values flatten onto the form data', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', name: 'red' },
      { id: 'c2', name: 'blue' },
    ])
    const setup = makeM2MParentSetupWithPivot({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'tags',
      pivot:        new Map([
        ['c1', { role: 'owner' }],
        ['c2', { role: 'editor' }],
      ]),
      attachedIds:  new Set(['c1', 'c2']),
    })

    const form = Form.make().schema([
      RepeaterField.make('tags')
        .relationship('tags')
        .pivotColumns(['role'])
        .schema([TextField.make('name'), TextField.make('role')]),
    ])

    const filled = await applyRelationshipRepeaterFill(
      form, {}, setup.makeRecord('a1'), setup.parentModel,
    )

    const rows = filled['tags'] as Array<Record<string, unknown>>
    assert.equal(rows.length, 2)
    assert.equal(rows[0]?.['name'], 'red')
    assert.equal(rows[0]?.['role'], 'owner')
    assert.equal(rows[0]?.['__id'], 'c1')
    assert.equal(rows[1]?.['name'], 'blue')
    assert.equal(rows[1]?.['role'], 'editor')
    // pivot envelope is dropped — it's an internal carrier, not form data.
    assert.equal('pivot' in (rows[0] ?? {}), false)
  })

  it('save (existing row) — pivot extras route through updatePivot, child fields through M.update', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', name: 'red' },
    ])
    const setup = makeM2MParentSetupWithPivot({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'tags',
      pivot:        new Map([['c1', { role: 'editor' }]]),
      attachedIds:  new Set(['c1']),
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .pivotColumns(['role'])
          .schema([TextField.make('name'), TextField.make('role')]),
      ])
      .save(async () => setup.makeRecord('a1'))

    const submittedRows = [{ __id: 'c1', name: 'crimson', role: 'owner' }]
    const result = await dispatchFormSubmit(
      form,
      { tags: submittedRows },
      { values: { tags: submittedRows }, record: setup.makeRecord('a1'), parentModel: setup.parentModel },
    )
    assert.equal(result.ok, true)

    // Child row got the non-pivot field; pivot col was NOT smuggled through.
    const updates = child.calls.filter(c => c.kind === 'update') as Array<{ kind: 'update'; id: string | number; data: Record<string, unknown> }>
    assert.equal(updates.length, 1)
    assert.equal(updates[0]?.data['name'], 'crimson')
    assert.equal('role' in (updates[0]?.data ?? {}), false)

    // Pivot row patched via updatePivot.
    const pivotUpdates = setup.pivotCalls.filter(c => c.kind === 'updatePivot') as Array<{ kind: 'updatePivot'; id: string | number; data: Record<string, unknown> }>
    assert.equal(pivotUpdates.length, 1)
    assert.equal(pivotUpdates[0]?.id, 'c1')
    assert.deepEqual(pivotUpdates[0]?.data, { role: 'owner' })
  })

  it('save (new row) — attach uses the per-id-pivot map shape', async () => {
    const child = makeFakeChildModel([])
    const setup = makeM2MParentSetupWithPivot({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'tags',
      pivot:        new Map(),
      attachedIds:  new Set(),
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .pivotColumns(['role'])
          .schema([TextField.make('name'), TextField.make('role')]),
      ])
      .save(async () => setup.makeRecord('a1'))

    const submittedRows = [{ name: 'red', role: 'owner' }]
    const result = await dispatchFormSubmit(
      form,
      { tags: submittedRows },
      { values: { tags: submittedRows }, parentModel: setup.parentModel },
    )
    assert.equal(result.ok, true)

    // Child created without `role` (pivot column).
    const creates = child.calls.filter(c => c.kind === 'create') as Array<{ kind: 'create'; data: Record<string, unknown> }>
    assert.equal(creates.length, 1)
    assert.equal(creates[0]?.data['name'], 'red')
    assert.equal('role' in (creates[0]?.data ?? {}), false)

    // attach received the per-id-pivot map.
    const attachCalls = setup.pivotCalls.filter(c => c.kind === 'attach') as Array<{ kind: 'attach'; pivot?: Record<string, Record<string, unknown>> }>
    assert.equal(attachCalls.length, 1)
    assert.ok(attachCalls[0]?.pivot, 'attach should have received a per-id pivot map')
    const map = attachCalls[0]!.pivot!
    const onlyKey = Object.keys(map)[0]!
    assert.deepEqual(map[onlyKey], { role: 'owner' })
  })

  it('save (existing row, no pivot edit) — skips updatePivot when payload has no pivot keys', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', name: 'red' },
    ])
    const setup = makeM2MParentSetupWithPivot({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'tags',
      pivot:        new Map([['c1', { role: 'editor' }]]),
      attachedIds:  new Set(['c1']),
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .pivotColumns(['role'])
          .schema([TextField.make('name'), TextField.make('role')]),
      ])
      .save(async () => setup.makeRecord('a1'))

    // Submit only changes the child column; role omitted entirely.
    const submittedRows = [{ __id: 'c1', name: 'crimson' }]
    const result = await dispatchFormSubmit(
      form,
      { tags: submittedRows },
      { values: { tags: submittedRows }, record: setup.makeRecord('a1'), parentModel: setup.parentModel },
    )
    assert.equal(result.ok, true)
    assert.equal(setup.pivotCalls.filter(c => c.kind === 'updatePivot').length, 0)
  })

  it('save — throws a clear error when accessor lacks updatePivot but pivot extras changed', async () => {
    const child = makeFakeChildModel([{ id: 'c1', name: 'red' }])
    // Build a parent whose accessor does NOT expose updatePivot.
    const accessorWithoutUpdate = {
      attach: async () => {},
      detach: async () => 0,
    }
    class Parent {
      id?: string
      constructor(init?: Partial<{ id: string }>) { Object.assign(this, init) }
      tags() { return accessorWithoutUpdate }
    }
    const parentModel: ModelLike & { relations: Record<string, unknown> } = {
      primaryKey: 'id',
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => makeQuery([]),
      relatedQuery: () => makeQuery([{ id: 'c1', name: 'red' }]),
      relations: {
        tags: { type: 'belongsToMany', model: () => child.model, pivotTable: 'pivot' },
      },
    }

    const form = Form.make()
      .schema([
        RepeaterField.make('tags')
          .relationship('tags')
          .pivotColumns(['role'])
          .schema([TextField.make('name'), TextField.make('role')]),
      ])
      .save(async () => new Parent({ id: 'a1' }))

    const submittedRows = [{ __id: 'c1', name: 'red', role: 'owner' }]
    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { tags: submittedRows },
        { values: { tags: submittedRows }, record: new Parent({ id: 'a1' }), parentModel },
      ),
      /requires a rudder ORM with `updatePivot`/,
    )
  })

  it('loadRelationRows — passes pivotColumns into withPivot when supported', async () => {
    let seenCols: string[] | undefined
    const q: ModelQuery = {
      where:    () => q,
      orWhere:  () => q,
      orderBy:  () => q,
      withPivot(...cols: string[]) {
        seenCols = cols
        return q
      },
      paginate: async () => ({ data: [], total: 0 }),
    }
    const M: ModelLike = {
      primaryKey: 'id',
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => q,
      relatedQuery: () => q,
    }
    await loadRelationRows(M, {}, 'tags', ['role', 'assignedAt'])
    assert.deepEqual(seenCols, ['role', 'assignedAt'])
  })

  it('loadRelationRows — silently skips withPivot on a model that does not implement it', async () => {
    // A model whose query has no `withPivot` method — pilotiq should
    // call paginate without throwing.
    const q: ModelQuery = {
      where:    () => q,
      orWhere:  () => q,
      orderBy:  () => q,
      paginate: async () => ({ data: [], total: 0 }),
    }
    const M: ModelLike = {
      primaryKey: 'id',
      find:   async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
      query:  () => q,
      relatedQuery: () => q,
    }
    const rows = await loadRelationRows(M, {}, 'tags', ['role'])
    assert.deepEqual(rows, [])
  })
})

describe('Repeater.relationship — afterCreate / afterUpdate / afterDelete hooks', () => {
  it('afterCreate fires once per created child with parent + index + mode in ctx', async () => {
    const child = makeFakeChildModel([])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })

    const calls: Array<{ record: unknown; ctx: Record<string, unknown> }> = []
    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .schema([TextField.make('label').required()])
          .afterCreate((record, ctx) => {
            calls.push({ record, ctx: { ...ctx } as Record<string, unknown> })
          }),
      ])
      .save(async () => ({ id: 'p1', title: 'Order' }))

    await dispatchFormSubmit(
      form,
      { items: [{ label: 'A' }, { label: 'B' }] },
      { values: { items: [{ label: 'A' }, { label: 'B' }] }, parentModel: parent },
    )

    assert.equal(calls.length, 2)
    assert.equal((calls[0]!.record as Record<string, unknown>)['label'], 'A')
    assert.equal((calls[1]!.record as Record<string, unknown>)['label'], 'B')
    assert.equal(calls[0]!.ctx['index'], 0)
    assert.equal(calls[1]!.ctx['index'], 1)
    assert.equal(calls[0]!.ctx['field'], 'items')
    assert.equal(calls[0]!.ctx['mode'],  'hasMany')
    assert.equal(calls[0]!.ctx['parentId'], 'p1')
    assert.deepEqual(calls[0]!.ctx['parent'], { id: 'p1', title: 'Order' })
  })

  it('afterUpdate fires per updated child (skipping pure-create rows)', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', orderId: 'p1', label: 'old A' },
    ])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })

    const updates: Array<{ record: unknown; index: number }> = []
    const creates: Array<{ record: unknown; index: number }> = []
    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .schema([TextField.make('label').required()])
          .afterCreate((record, ctx) => { creates.push({ record, index: ctx.index }) })
          .afterUpdate((record, ctx) => { updates.push({ record, index: ctx.index }) }),
      ])
      .save(async () => ({ id: 'p1' }))

    await dispatchFormSubmit(
      form,
      { items: [{ __id: 'c1', label: 'new A' }, { label: 'fresh B' }] },
      {
        values: { items: [{ __id: 'c1', label: 'new A' }, { label: 'fresh B' }] },
        record: { id: 'p1' },
        parentModel: parent,
      },
    )

    assert.equal(updates.length, 1)
    assert.equal((updates[0]!.record as Record<string, unknown>)['label'], 'new A')
    assert.equal(updates[0]!.index, 0)
    assert.equal(creates.length, 1)
    assert.equal((creates[0]!.record as Record<string, unknown>)['label'], 'fresh B')
    assert.equal(creates[0]!.index, 1)
  })

  it('afterDelete fires once per removed child with the previous row data', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', orderId: 'p1', label: 'A' },
      { id: 'c2', orderId: 'p1', label: 'B' },
      { id: 'c3', orderId: 'p1', label: 'C' },
    ])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })

    const removed: Array<{ record: unknown; ctx: Record<string, unknown> }> = []
    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .schema([TextField.make('label').required()])
          .afterDelete((record, ctx) => {
            removed.push({ record, ctx: { ...ctx } as Record<string, unknown> })
          }),
      ])
      .save(async () => ({ id: 'p1' }))

    // Submit only c1 — c2 and c3 disappear.
    await dispatchFormSubmit(
      form,
      { items: [{ __id: 'c1', label: 'A' }] },
      {
        values: { items: [{ __id: 'c1', label: 'A' }] },
        record: { id: 'p1' },
        parentModel: parent,
      },
    )

    assert.equal(removed.length, 2)
    const labels = removed.map(r => (r.record as Record<string, unknown>)['label']).sort()
    assert.deepEqual(labels, ['B', 'C'])
    assert.equal(removed[0]!.ctx['index'], -1)
    assert.equal(removed[0]!.ctx['mode'],  'hasMany')
    assert.equal(removed[0]!.ctx['parentId'], 'p1')
  })

  it('hooks are no-op outside relationship() mode (throw at config time)', () => {
    assert.throws(() =>
      RepeaterField.make('json').afterCreate(() => {}),
      /requires relationship/,
    )
    assert.throws(() =>
      RepeaterField.make('json').afterUpdate(() => {}),
      /requires relationship/,
    )
    assert.throws(() =>
      RepeaterField.make('json').afterDelete(() => {}),
      /requires relationship/,
    )
  })

  it('throwing handler propagates and aborts the rest of the persist diff', async () => {
    const child = makeFakeChildModel([])
    const parent = makeFakeParentModel({
      childModel:   child.model,
      childRows:    child.rows,
      relationName: 'items',
      foreignKey:   'orderId',
    })

    const form = Form.make()
      .schema([
        RepeaterField.make('items')
          .relationship('items')
          .schema([TextField.make('label').required()])
          .afterCreate((record) => {
            const r = record as Record<string, unknown>
            if (r['label'] === 'B') throw new Error('reject B')
          }),
      ])
      .save(async () => ({ id: 'p1' }))

    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
        { values: { items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] }, parentModel: parent },
      ),
      /reject B/,
    )
    // Two creates fired before the throw — no rollback (v1 isn't transactional).
    assert.equal(child.calls.filter(c => c.kind === 'create').length, 2)
  })
})
