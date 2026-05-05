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
