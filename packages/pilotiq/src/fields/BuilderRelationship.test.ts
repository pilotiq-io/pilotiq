import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { BuilderField } from './BuilderField.js'
import { TextField } from './TextField.js'
import { Block } from '../schema/Block.js'
import { Form } from '../elements/Form.js'
import { dispatchFormSubmit, extractRelationshipBuilders } from '../elements/dispatchForm.js'
import { applyRelationshipBuilderFill } from '../pageData.js'
import type { ModelLike, ModelQuery } from '../orm/modelDefaults.js'

/**
 * Same harness as `RepeaterRelationship.test.ts`, mirrored — keeps the
 * two suites independent so renaming one model shape doesn't ripple
 * silently into the other. Each row in the fake child carries `type`
 * and `data` columns to mirror the Builder envelope.
 */
interface FakeRecord extends Record<string, unknown> {
  id?:   string | number
  type?: string
  data?: unknown
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
      if (idx >= 0) rows[idx] = { ...rows[idx], ...data, id }
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

function makeQuery(rows: FakeRecord[]): ModelQuery {
  const q: ModelQuery = {
    with: () => q,
    withCount: () => q,
    where: () => q,
    orWhere: () => q,
    orderBy: () => q,
    paginate: async () => ({ data: rows.slice(), total: rows.length }),
  }
  return q
}

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

const HEADING_BLOCK   = () => Block.make('heading').schema([TextField.make('text').required()])
const PARAGRAPH_BLOCK = () => Block.make('paragraph').schema([TextField.make('body').required()])

describe('Builder.relationship — extraction', () => {
  it('extractRelationshipBuilders pulls the field value out of data', () => {
    const builder = BuilderField.make('content')
      .relationship('blocks')
      .blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()])
    const data: Record<string, unknown> = {
      title: 'Page',
      content: [
        { __id: '1', type: 'heading',   data: { text: 'Hello' } },
        {           type: 'paragraph', data: { body: 'World' } },
      ],
      otherJsonBuilder: [{ x: 1 }],
    }
    const deferrals = extractRelationshipBuilders([builder], data)
    assert.equal(deferrals.length, 1)
    assert.equal(deferrals[0]!.cfg.name, 'blocks')
    assert.equal(deferrals[0]!.rows.length, 2)
    assert.equal('content' in data, false)
    assert.equal(data['title'], 'Page')
    assert.deepEqual(data['otherJsonBuilder'], [{ x: 1 }])
  })

  it('extractRelationshipBuilders skips non-relationship Builders', () => {
    const json = BuilderField.make('jsonContent').blocks([HEADING_BLOCK()])
    const rel  = BuilderField.make('relContent').relationship('blocks').blocks([HEADING_BLOCK()])
    const data: Record<string, unknown> = {
      jsonContent: [{ type: 'heading', data: { text: 'A' } }],
      relContent:  [{ type: 'heading', data: { text: 'B' } }],
    }
    const deferrals = extractRelationshipBuilders([json, rel], data)
    assert.equal(deferrals.length, 1)
    assert.equal(deferrals[0]!.cfg.name, 'blocks')
    assert.equal('jsonContent' in data, true)
    assert.equal('relContent' in data,  false)
  })
})

describe('Builder.relationship — full pipeline', () => {
  it('create — submits new rows with FK + type + data stamped, no existing rows', async () => {
    const child = makeFakeChildModel([])
    const parent = makeFakeParentModel({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', foreignKey: 'pageId',
    })

    const form = Form.make()
      .schema([
        TextField.make('title'),
        BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
      ])
      .save(async (data) => {
        assert.equal('content' in data, false)  // extracted before save
        return { id: 'p1', title: data['title'] }
      })

    const submittedRows = [
      { type: 'heading',   data: { text: 'Hello' } },
      { type: 'paragraph', data: { body: 'World' } },
    ]
    const result = await dispatchFormSubmit(
      form,
      { title: 'Page', content: submittedRows },
      { values: { title: 'Page', content: submittedRows }, parentModel: parent },
    )
    assert.equal(result.ok, true)
    const creates = child.calls.filter(c => c.kind === 'create') as Array<{ kind: 'create'; data: Record<string, unknown> }>
    assert.equal(creates.length, 2)
    assert.equal(creates[0]!.data['pageId'], 'p1')
    assert.equal(creates[0]!.data['type'],   'heading')
    assert.deepEqual(creates[0]!.data['data'], { text: 'Hello' })
    assert.equal(creates[1]!.data['type'],   'paragraph')
    assert.deepEqual(creates[1]!.data['data'], { body: 'World' })
    assert.equal(child.calls.filter(c => c.kind === 'update').length, 0)
    assert.equal(child.calls.filter(c => c.kind === 'delete').length, 0)
  })

  it('update — submits __id matching existing PK; routed through update without overwriting FK', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', pageId: 'p1', type: 'heading',   data: { text: 'old A' } },
      { id: 'c2', pageId: 'p1', type: 'paragraph', data: { body: 'old B' } },
    ])
    const parent = makeFakeParentModel({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', foreignKey: 'pageId',
    })

    const form = Form.make()
      .schema([
        BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
      ])
      .save(async () => ({ id: 'p1' }))

    const submittedRows = [
      { __id: 'c1', type: 'heading',   data: { text: 'new A' } },
      { __id: 'c2', type: 'paragraph', data: { body: 'new B' } },
    ]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, record: { id: 'p1' }, parentModel: parent },
    )
    assert.equal(result.ok, true)
    const updates = child.calls.filter(c => c.kind === 'update') as Array<{ kind: 'update'; id: string | number; data: Record<string, unknown> }>
    assert.equal(updates.length, 2)
    assert.equal('pageId' in updates[0]!.data, false)
    assert.equal('pageId' in updates[1]!.data, false)
    assert.deepEqual(updates[0]!.data['data'], { text: 'new A' })
    assert.deepEqual(updates[1]!.data['data'], { body: 'new B' })
    assert.equal(child.calls.filter(c => c.kind === 'create').length, 0)
    assert.equal(child.calls.filter(c => c.kind === 'delete').length, 0)
  })

  it('delete — existing PK omitted from submitted set is deleted', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', pageId: 'p1', type: 'heading',   data: { text: 'A' } },
      { id: 'c2', pageId: 'p1', type: 'paragraph', data: { body: 'B' } },
      { id: 'c3', pageId: 'p1', type: 'heading',   data: { text: 'C' } },
    ])
    const parent = makeFakeParentModel({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', foreignKey: 'pageId',
    })

    const form = Form.make()
      .schema([
        BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
      ])
      .save(async () => ({ id: 'p1' }))

    const submittedRows = [{ __id: 'c1', type: 'heading', data: { text: 'A' } }]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, record: { id: 'p1' }, parentModel: parent },
    )
    assert.equal(result.ok, true)
    const deletes = child.calls.filter(c => c.kind === 'delete') as Array<{ kind: 'delete'; id: string | number }>
    assert.deepEqual(deletes.map(c => String(c.id)).sort(), ['c2', 'c3'])
  })

  it('mixed — single submit performs creates, updates, and deletes; type can change on update', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', pageId: 'p1', type: 'heading',   data: { text: 'A' } },
      { id: 'c2', pageId: 'p1', type: 'paragraph', data: { body: 'B' } },
    ])
    const parent = makeFakeParentModel({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', foreignKey: 'pageId',
    })

    const form = Form.make()
      .schema([
        BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
      ])
      .save(async () => ({ id: 'p1' }))

    // c1 stays but switches type heading→paragraph; c2 gone; new heading row.
    const submittedRows = [
      { __id: 'c1', type: 'paragraph', data: { body: 'switched' } },
      {           type: 'heading',   data: { text: 'fresh' } },
    ]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, record: { id: 'p1' }, parentModel: parent },
    )
    assert.equal(result.ok, true)
    assert.equal(child.calls.filter(c => c.kind === 'create').length, 1)
    assert.equal(child.calls.filter(c => c.kind === 'update').length, 1)
    assert.equal(child.calls.filter(c => c.kind === 'delete').length, 1)
    const update = child.calls.find(c => c.kind === 'update') as { kind: 'update'; id: string | number; data: Record<string, unknown> }
    // Type column rewrites on update — Builder authors are free to change a row's block type.
    assert.equal(update.data['type'], 'paragraph')
    assert.deepEqual(update.data['data'], { body: 'switched' })
    const created = child.calls.find(c => c.kind === 'create') as { kind: 'create'; data: Record<string, unknown> }
    assert.equal(created.data['pageId'], 'p1')
    assert.equal(created.data['type'],   'heading')
  })

  it('orderColumn writes 0-based index on every create + update', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', pageId: 'p1', type: 'heading', data: { text: 'A' }, sort: 5 },
    ])
    const parent = makeFakeParentModel({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', foreignKey: 'pageId',
    })

    const form = Form.make()
      .schema([
        BuilderField.make('content')
          .relationship('blocks')
          .orderColumn('sort')
          .blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
      ])
      .save(async () => ({ id: 'p1' }))

    const submittedRows = [
      {           type: 'paragraph', data: { body: 'first' } },
      { __id: 'c1', type: 'heading',   data: { text: 'second' } },
    ]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, record: { id: 'p1' }, parentModel: parent },
    )
    assert.equal(result.ok, true)
    const create = child.calls.find(c => c.kind === 'create') as { kind: 'create'; data: Record<string, unknown> }
    const update = child.calls.find(c => c.kind === 'update') as { kind: 'update'; id: string | number; data: Record<string, unknown> }
    assert.equal(create.data['sort'], 0)
    assert.equal(update.data['sort'], 1)
  })

  it('honors typeColumn and dataColumn overrides', async () => {
    const child = makeFakeChildModel([])
    const parent = makeFakeParentModel({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', foreignKey: 'pageId',
    })

    const form = Form.make()
      .schema([
        BuilderField.make('content')
          .relationship({ name: 'blocks', typeColumn: 'kind', dataColumn: 'payload' })
          .blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
      ])
      .save(async () => ({ id: 'p1' }))

    const submittedRows = [{ type: 'heading', data: { text: 'Hello' } }]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, parentModel: parent },
    )
    assert.equal(result.ok, true)
    const create = child.calls.find(c => c.kind === 'create') as { kind: 'create'; data: Record<string, unknown> }
    assert.equal(create.data['kind'], 'heading')
    assert.deepEqual(create.data['payload'], { text: 'Hello' })
    // Default columns absent.
    assert.equal('type' in create.data, false)
    assert.equal('data' in create.data, false)
  })

  it('throws when parentModel is missing on the FormContext', async () => {
    const form = Form.make()
      .schema([
        BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK()]),
      ])
      .save(async () => ({ id: 'p1' }))

    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { content: [{ type: 'heading', data: { text: 'A' } }] },
        { values: { content: [{ type: 'heading', data: { text: 'A' } }] } },
      ),
      /parentModel on the FormContext/,
    )
  })

  it('throws when descriptor lookup fails and no override is set', async () => {
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
        BuilderField.make('content').relationship('phantom').blocks([HEADING_BLOCK()]),
      ])
      .save(async () => ({ id: 'p1' }))

    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { content: [{ type: 'heading', data: { text: 'a' } }] },
        {
          values:      { content: [{ type: 'heading', data: { text: 'a' } }] },
          parentModel: parent,
        },
      ),
      /could not resolve the child model/,
    )
  })

  it('honors explicit model + foreignKey overrides on the field config (no descriptor needed)', async () => {
    const child = makeFakeChildModel()
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
        BuilderField.make('content')
          .relationship({ name: 'blocks', model: child.model, foreignKey: 'pageId' })
          .blocks([HEADING_BLOCK()]),
      ])
      .save(async () => ({ id: 'p1' }))

    const submittedRows = [{ type: 'heading', data: { text: 'A' } }]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, parentModel: parent },
    )
    assert.equal(result.ok, true)
    assert.equal(child.calls.length, 1)
    const created = child.calls[0] as { kind: 'create'; data: Record<string, unknown> }
    assert.equal(created.data['pageId'], 'p1')
  })
})

describe('Builder.relationship — load (applyRelationshipBuilderFill)', () => {
  it('stamps __id from PK + type + data, strips PK + FK + type/data columns from each rendered row', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', pageId: 'p1', type: 'heading',   data: { text: 'A' } },
      { id: 'c2', pageId: 'p1', type: 'paragraph', data: { body: 'B' } },
    ])
    const parent = makeFakeParentModel({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', foreignKey: 'pageId',
    })

    const form = Form.make().schema([
      TextField.make('title'),
      BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
    ])

    const out = await applyRelationshipBuilderFill(form, { title: 'Page' }, { id: 'p1' }, parent)
    assert.deepEqual(out['content'], [
      { __id: 'c1', type: 'heading',   data: { text: 'A' } },
      { __id: 'c2', type: 'paragraph', data: { body: 'B' } },
    ])
    assert.equal(out['title'], 'Page')
  })

  it('parses a JSON-string `data` payload into an object', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', pageId: 'p1', type: 'heading', data: '{"text":"From string"}' },
    ])
    const parent = makeFakeParentModel({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', foreignKey: 'pageId',
    })
    const form = Form.make().schema([
      BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK()]),
    ])
    const out = await applyRelationshipBuilderFill(form, {}, { id: 'p1' }, parent)
    assert.deepEqual(out['content'], [{ __id: 'c1', type: 'heading', data: { text: 'From string' } }])
  })

  it('falls back to {} when `data` is missing or malformed', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', pageId: 'p1', type: 'heading',   data: null },
      { id: 'c2', pageId: 'p1', type: 'paragraph', data: 'not-json' },
    ])
    const parent = makeFakeParentModel({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', foreignKey: 'pageId',
    })
    const form = Form.make().schema([
      BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
    ])
    const out = await applyRelationshipBuilderFill(form, {}, { id: 'p1' }, parent)
    assert.deepEqual(out['content'], [
      { __id: 'c1', type: 'heading',   data: {} },
      { __id: 'c2', type: 'paragraph', data: {} },
    ])
  })

  it('no-op when record is null, parentModel is missing, or there are no relationship Builders', async () => {
    const form = Form.make().schema([
      BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK()]),
    ])
    const parent = makeFakeParentModel({
      childModel:   makeFakeChildModel().model,
      childRows:    [],
      relationName: 'blocks',
      foreignKey:   'pageId',
    })
    assert.deepEqual(
      await applyRelationshipBuilderFill(form, { x: 1 }, null, parent),
      { x: 1 },
    )
    assert.deepEqual(
      await applyRelationshipBuilderFill(form, { x: 1 }, { id: 'p1' }, undefined),
      { x: 1 },
    )
    const plain = Form.make().schema([TextField.make('title')])
    assert.deepEqual(
      await applyRelationshipBuilderFill(plain, { title: 't' }, { id: 'p1' }, parent),
      { title: 't' },
    )
  })
})

describe('Builder.relationship — morphMany', () => {
  // Parent shape: `Post.blocks: morphMany([], 'blockable')` — child carries
  // `blockableId` + `blockableType` instead of an FK column. Mirrors the
  // existing `Post.comments: morphMany` wiring shipped via the polymorphic
  // RelationManager follow-up.
  //
  // `computeMorphPayload(parent, descriptor)` reads `<morphName>Type` off
  // the parent **record**'s `constructor.morphAlias ?? constructor.name` —
  // so the parent record returned by `Form.save()` (or stamped onto the
  // load context) has to be a class instance, not a plain object literal.
  // This factory builds both the model + a matching record class.
  function makeMorphParentSetup(opts: {
    childModel:    ModelLike
    childRows:     FakeRecord[]
    relationName:  string
    morphName:     string
    morphAlias?:   string
  }) {
    const { childModel, childRows, relationName, morphName, morphAlias } = opts
    const idCol   = `${morphName}Id`
    const typeCol = `${morphName}Type`

    class Post {
      id?: string
      constructor(init?: Partial<{ id: string }>) { Object.assign(this, init) }
    }
    if (morphAlias && morphAlias !== 'Post') {
      ;(Post as unknown as { morphAlias: string }).morphAlias = morphAlias
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
    return { parentModel, makeRecord: (id: string) => new Post({ id }) }
  }

  it('create — stamps <morphName>Id + <morphName>Type instead of an FK column', async () => {
    const child = makeFakeChildModel([])
    const { parentModel, makeRecord } = makeMorphParentSetup({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', morphName: 'blockable',
    })

    const form = Form.make()
      .schema([
        BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
      ])
      .save(async () => makeRecord('p1'))

    const submittedRows = [
      { type: 'heading',   data: { text: 'Hello' } },
      { type: 'paragraph', data: { body: 'World' } },
    ]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, parentModel },
    )
    assert.equal(result.ok, true)
    const creates = child.calls.filter(c => c.kind === 'create') as Array<{ kind: 'create'; data: Record<string, unknown> }>
    assert.equal(creates.length, 2)
    for (const c of creates) {
      assert.equal(c.data['blockableId'],   'p1')
      assert.equal(c.data['blockableType'], 'Post')
      assert.equal('pageId' in c.data, false)
    }
    assert.equal(creates[0]!.data['type'], 'heading')
    assert.equal(creates[1]!.data['type'], 'paragraph')
  })

  it('update — does not overwrite morph cols on update (defense against re-link)', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', blockableId: 'p1', blockableType: 'Post', type: 'heading',   data: { text: 'A' } },
      { id: 'c2', blockableId: 'p1', blockableType: 'Post', type: 'paragraph', data: { body: 'B' } },
    ])
    const { parentModel, makeRecord } = makeMorphParentSetup({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', morphName: 'blockable',
    })

    const form = Form.make()
      .schema([
        BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
      ])
      .save(async () => makeRecord('p1'))

    const submittedRows = [
      // Tampered client tries to send blockableType=Video; framework wins last.
      { __id: 'c1', type: 'heading',   data: { text: 'A2' }, blockableType: 'Video' },
      { __id: 'c2', type: 'paragraph', data: { body: 'B2' } },
    ]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, record: makeRecord('p1'), parentModel },
    )
    assert.equal(result.ok, true)
    const updates = child.calls.filter(c => c.kind === 'update') as Array<{ kind: 'update'; id: string | number; data: Record<string, unknown> }>
    assert.equal(updates.length, 2)
    for (const u of updates) {
      assert.equal('blockableId'   in u.data, false)
      assert.equal('blockableType' in u.data, false)
    }
  })

  it('delete — existing PKs missing from submitted set are deleted (same shape as hasMany)', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', blockableId: 'p1', blockableType: 'Post', type: 'heading',   data: { text: 'A' } },
      { id: 'c2', blockableId: 'p1', blockableType: 'Post', type: 'paragraph', data: { body: 'B' } },
    ])
    const { parentModel, makeRecord } = makeMorphParentSetup({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', morphName: 'blockable',
    })

    const form = Form.make()
      .schema([
        BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
      ])
      .save(async () => makeRecord('p1'))

    const submittedRows = [{ __id: 'c1', type: 'heading', data: { text: 'A' } }]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, record: makeRecord('p1'), parentModel },
    )
    assert.equal(result.ok, true)
    const deletes = child.calls.filter(c => c.kind === 'delete') as Array<{ kind: 'delete'; id: string | number }>
    assert.deepEqual(deletes.map(c => String(c.id)), ['c2'])
  })

  it('orderColumn writes 0-based index on every morph create + update', async () => {
    const child = makeFakeChildModel([
      { id: 'c1', blockableId: 'p1', blockableType: 'Post', type: 'heading', data: { text: 'A' }, sort: 5 },
    ])
    const { parentModel, makeRecord } = makeMorphParentSetup({
      childModel: child.model, childRows: child.rows,
      relationName: 'blocks', morphName: 'blockable',
    })

    const form = Form.make()
      .schema([
        BuilderField.make('content')
          .relationship('blocks')
          .orderColumn('sort')
          .blocks([HEADING_BLOCK(), PARAGRAPH_BLOCK()]),
      ])
      .save(async () => makeRecord('p1'))

    const submittedRows = [
      {            type: 'paragraph', data: { body: 'first' } },
      { __id: 'c1', type: 'heading',   data: { text: 'second' } },
    ]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, record: makeRecord('p1'), parentModel },
    )
    assert.equal(result.ok, true)
    const create = child.calls.find(c => c.kind === 'create') as { kind: 'create'; data: Record<string, unknown> }
    const update = child.calls.find(c => c.kind === 'update') as { kind: 'update'; id: string | number; data: Record<string, unknown> }
    assert.equal(create.data['sort'], 0)
    assert.equal(update.data['sort'], 1)
  })

  it('morphType — explicit override on the relation entry wins over constructor name', async () => {
    const child = makeFakeChildModel([])
    // Real-world parent class anchored as `Post`; the morph descriptor's
    // explicit `morphType` should win over `Post.morphAlias` /
    // `Post.constructor.name`.
    class Post {
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
        blocks: { type: 'morphMany', morphName: 'blockable', morphType: 'CustomDiscriminator', model: () => child.model },
      },
    }

    const form = Form.make()
      .schema([
        BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK()]),
      ])
      .save(async () => new Post({ id: 'p1' }))

    const submittedRows = [{ type: 'heading', data: { text: 'A' } }]
    const result = await dispatchFormSubmit(
      form,
      { content: submittedRows },
      { values: { content: submittedRows }, parentModel },
    )
    assert.equal(result.ok, true)
    const create = child.calls.find(c => c.kind === 'create') as { kind: 'create'; data: Record<string, unknown> }
    assert.equal(create.data['blockableType'], 'CustomDiscriminator')
  })

  it('morphMany config without the model thunk surfaces a clear error', async () => {
    const child = makeFakeChildModel([])
    class Post {
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
        // `model` thunk missing — `getMorphRelationDescriptor` returns
        // `undefined` here per its `typeof model === 'function'` check, so
        // the resolver falls through to the hasMany branch which then
        // demands a `foreignKey` override. The user-facing message stays
        // useful: configure-the-relation.
        blocks: { type: 'morphMany', morphName: 'blockable' },
      },
    }

    const form = Form.make()
      .schema([
        BuilderField.make('content').relationship('blocks').blocks([HEADING_BLOCK()]),
      ])
      .save(async () => new Post({ id: 'p1' }))

    const submittedRows = [{ type: 'heading', data: { text: 'A' } }]
    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { content: submittedRows },
        { values: { content: submittedRows }, parentModel },
      ),
      /could not resolve the child model/,
    )
    void child
  })
})

describe('Builder.relationship — M2M deferral', () => {
  // Builder rows are heterogeneous `{ type, data }` envelopes — the
  // pivot semantics of belongsToMany / morphToMany / morphedByMany
  // don't compose with that shape. Per-block-type model dispatch is the
  // right answer if a consumer ever asks. Until then, raise a clear
  // error pointing at Repeater.relationship.
  it('belongsToMany — clear "deferred" error from resolveBuilderChildAndAttachment', async () => {
    const child = makeFakeChildModel([])
    class Article {
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
        content: { type: 'belongsToMany', model: () => child.model, pivotTable: 'pivot' },
      },
    }

    const form = Form.make()
      .schema([
        BuilderField.make('content').relationship('content').blocks([HEADING_BLOCK()]),
      ])
      .save(async () => new Article({ id: 'p1' }))

    const submittedRows = [{ type: 'heading', data: { text: 'X' } }]
    await assert.rejects(
      () => dispatchFormSubmit(
        form,
        { content: submittedRows },
        { values: { content: submittedRows }, parentModel },
      ),
      /unsupported relation type 'belongsToMany'/,
    )
  })
})
