import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Action } from '../actions/Action.js'
import { Card } from '../schema/Card.js'
import { Section } from '../schema/Section.js'
import { Table } from './Table.js'
import { Column } from '../Column.js'
import {
  findActions, findRowExtraActions, parseActionBody, dispatchAction,
} from './dispatchAction.js'
import { RepeaterField } from '../fields/RepeaterField.js'
import { BuilderField } from '../fields/BuilderField.js'
import { Block } from '../schema/Block.js'
import { TextField } from '../fields/TextField.js'
import { relationAttachAction } from '../actions/m2mFactories.js'
import { RelationManager, type RelationManagerContext } from '../RelationManager.js'

describe('findActions', () => {
  it('returns top-level actions', () => {
    const a = Action.make('publish').label('Publish')
    const b = Action.make('archive').label('Archive')
    assert.deepEqual(findActions([a, b]).map(x => x.name), ['publish', 'archive'])
  })

  it('walks containers in document order', () => {
    const tree = [
      Card.make('Header').schema([
        Action.make('one'),
        Section.make('Inner').schema([Action.make('two')]),
      ]),
      Action.make('three'),
    ]
    assert.deepEqual(findActions(tree).map(a => a.name), ['one', 'two', 'three'])
  })

  it('finds actions inside Table children', () => {
    const table = Table.make()
      .columns([Column.make('title')])
      .actions([Action.make('refresh')])
    assert.deepEqual(findActions([table]).map(a => a.name), ['refresh'])
  })
})

describe('parseActionBody', () => {
  it('returns empty ids and the rest as values when ids is absent', () => {
    const r = parseActionBody({ name: 'Hi', count: 3 })
    assert.deepEqual(r.ids, [])
    assert.deepEqual(r.values, { name: 'Hi', count: 3 })
  })

  it('parses an array of ids', () => {
    const r = parseActionBody({ ids: ['1', '2', '3'], extra: 'x' })
    assert.deepEqual(r.ids, ['1', '2', '3'])
    assert.deepEqual(r.values, { extra: 'x' })
  })

  it('coerces non-string id entries via String()', () => {
    const r = parseActionBody({ ids: [1, 2] })
    assert.deepEqual(r.ids, ['1', '2'])
  })

  it('treats a single string id as one entry', () => {
    const r = parseActionBody({ ids: 'abc' })
    assert.deepEqual(r.ids, ['abc'])
  })

  it('splits a CSV string into multiple ids', () => {
    const r = parseActionBody({ ids: 'a, b ,c' })
    assert.deepEqual(r.ids, ['a', 'b', 'c'])
  })

  it('strips _actionName from values', () => {
    const r = parseActionBody({ _actionName: 'foo', note: 'hi' })
    assert.deepEqual(r.values, { note: 'hi' })
  })
})

describe('dispatchAction', () => {
  it('returns ok:false when the action has no handler', async () => {
    const a = Action.make('x')
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /no handler/)
  })

  it('passes record (single id) through to the handler with resolveRecord', async () => {
    let captured: unknown
    const a = Action.make('detail').handler((ctx) => { captured = ctx.record })
    const result = await dispatchAction(
      a,
      { ids: ['7'], values: {} },
      async (id) => ({ id, title: `item-${id}` }),
    )
    assert.equal(result.ok, true)
    assert.deepEqual(captured, { id: '7', title: 'item-7' })
  })

  it('passes records (multi id) through to the handler with resolveRecord', async () => {
    let captured: unknown
    const a = Action.make('bulk').handler((ctx) => { captured = ctx.records })
    const result = await dispatchAction(
      a,
      { ids: ['1', '2'], values: {} },
      (id) => ({ id, n: Number(id) * 10 }),
    )
    assert.equal(result.ok, true)
    assert.deepEqual(captured, [{ id: '1', n: 10 }, { id: '2', n: 20 }])
  })

  it('falls back to bare {id} stubs when no resolveRecord is supplied', async () => {
    let captured: unknown
    const a = Action.make('stub').handler((ctx) => { captured = ctx.record })
    await dispatchAction(a, { ids: ['42'], values: {} })
    assert.deepEqual(captured, { id: '42' })
  })

  it('passes values + request through ctx', async () => {
    let captured: { values?: unknown; request?: unknown } = {}
    const a = Action.make('email').handler((ctx) => { captured = ctx })
    const fakeReq = { headers: {} }
    await dispatchAction(a, { ids: [], values: { subject: 'Hi' }, request: fakeReq })
    assert.deepEqual(captured.values, { subject: 'Hi' })
    assert.equal(captured.request, fakeReq)
  })

  it('honors a redirect returned by the handler', async () => {
    const a = Action.make('go').handler(() => ({ redirect: '/elsewhere' }))
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.deepEqual(result, { ok: true, redirect: '/elsewhere' })
  })

  it('catches handler errors and returns ok:false with the message', async () => {
    const a = Action.make('boom').handler(() => { throw new Error('kaboom') })
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, 'kaboom')
  })

  it('async handler that returns void is treated as plain success', async () => {
    let ran = false
    const a = Action.make('noop').handler(async () => { ran = true })
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.deepEqual(result, { ok: true })
    assert.equal(ran, true)
  })
})

describe('dispatchAction authorization gate', () => {
  it('rejects with forbidden when .authorize() returns false — handler never runs', async () => {
    let ran = false
    const a = Action.make('secret')
      .authorize(() => false)
      .handler(() => { ran = true })
    const result = await dispatchAction(a, { ids: [], values: {}, user: { id: 1 } })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.forbidden, true)
      assert.equal(result.error, 'Forbidden')
    }
    assert.equal(ran, false)
  })

  it('rejects when .visible() returns false', async () => {
    let ran = false
    const a = Action.make('hidden')
      .visible(() => false)
      .handler(() => { ran = true })
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.forbidden, true)
    assert.equal(ran, false)
  })

  it('rejects when .hidden() returns true', async () => {
    let ran = false
    const a = Action.make('hide')
      .hidden(() => true)
      .handler(() => { ran = true })
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.forbidden, true)
    assert.equal(ran, false)
  })

  it('fails closed — a throwing predicate denies dispatch', async () => {
    let ran = false
    const a = Action.make('flaky')
      .authorize(() => { throw new Error('policy blew up') })
      .handler(() => { ran = true })
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.forbidden, true)
    assert.equal(ran, false)
  })

  it('evaluates the predicate against the resolved record', async () => {
    let ran = false
    const a = Action.make('archive')
      .authorize(({ record }) => (record as { archivable?: boolean }).archivable === true)
      .handler(() => { ran = true })
    const denied = await dispatchAction(
      a, { ids: ['7'], values: {} }, () => ({ id: '7', archivable: false }),
    )
    assert.equal(denied.ok, false)
    if (!denied.ok) assert.equal(denied.forbidden, true)
    assert.equal(ran, false)

    const allowed = await dispatchAction(
      a, { ids: ['8'], values: {} }, () => ({ id: '8', archivable: true }),
    )
    assert.equal(allowed.ok, true)
    assert.equal(ran, true)
  })

  it('runs the handler when no visibility rule is set (back-compat)', async () => {
    let ran = false
    const a = Action.make('plain').handler(() => { ran = true })
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, true)
    assert.equal(ran, true)
  })

  it('M2M relationAttach rejects at dispatch when canAttach is false — pivot accessor never touched', async () => {
    let attachCalled = false
    const parent = {
      id: '1',
      // `resolveM2MAccessor` reads the relation accessor off the parent;
      // the spy asserts the handler (and thus attach) never fires.
      tags() { return { attach: async () => { attachCalled = true } } },
    }
    class TagsManager extends RelationManager {
      static override relationship = 'tags'
      static override async canAttach(): Promise<boolean> { return false }
    }
    const ctx: RelationManagerContext = {
      basePath:     '/admin',
      parentSlug:   'posts',
      parentId:     '1',
      relationship: 'tags',
      parentRecord: parent,
      mode:         'belongsToMany',
    }
    const action = relationAttachAction(TagsManager, ctx)
    // The route prelude (parent canEdit) is assumed already passed; dispatch
    // must still re-check the action's own canAttach predicate.
    const result = await dispatchAction(action, {
      ids:      [],
      values:   { _attachId: '99' },
      user:     { id: 1 },
      relation: { parent, parentId: '1', relationship: 'tags' },
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.forbidden, true)
    assert.equal(attachCalled, false)
  })

  it('M2M relationAttach runs the attach when canAttach is true', async () => {
    let attachedIds: string[] | undefined
    const parent = {
      id: '1',
      tags() { return { attach: async (ids: string[]) => { attachedIds = ids } } },
    }
    class TagsManager extends RelationManager {
      static override relationship = 'tags'
      static override async canAttach(): Promise<boolean> { return true }
    }
    const ctx: RelationManagerContext = {
      basePath:     '/admin',
      parentSlug:   'posts',
      parentId:     '1',
      relationship: 'tags',
      parentRecord: parent,
      mode:         'belongsToMany',
      // The handler short-circuits unless the related Resource has a model;
      // a truthy stub is enough — the pivot accessor lives on the parent.
      related:      { model: {} } as unknown as RelationManagerContext['related'],
    }
    const action = relationAttachAction(TagsManager, ctx)
    const result = await dispatchAction(action, {
      ids:      [],
      values:   { _attachId: '99' },
      user:     { id: 1 },
      relation: { parent, parentId: '1', relationship: 'tags' },
    })
    assert.equal(result.ok, true)
    assert.deepEqual(attachedIds, ['99'])
  })
})

describe('Action.dispatchUrl + toMeta', () => {
  it('emits dispatchUrl in meta when set', () => {
    const meta = Action.make('publish').handler(() => {}).dispatchUrl('/x/_action/publish').toMeta()
    assert.equal(meta.dispatchUrl, '/x/_action/publish')
  })

  it('omits dispatchUrl when not set', () => {
    const meta = Action.make('plain').toMeta()
    assert.equal(meta.dispatchUrl, undefined)
  })
})

describe('Action modal-form dispatch', () => {
  it('toMeta emits modal config when modalHeading/.schema/etc are set', async () => {
    const { TextField } = await import('../fields/TextField.js')
    const a = Action.make('feature')
      .schema([TextField.make('priority').required()])
      .modalHeading('Feature article')
      .modalDescription('Pin to home feed.')
      .modalSubmitLabel('Yes, feature')
      .modalWidth('lg')
      .handler(() => {})
    const meta = a.toMeta()
    assert.equal(meta['modal']?.heading, 'Feature article')
    assert.equal(meta['modal']?.description, 'Pin to home feed.')
    assert.equal(meta['modal']?.submitLabel, 'Yes, feature')
    assert.equal(meta['modal']?.width, 'lg')
    assert.equal(a.hasModal(), true)
    assert.equal(a.getSchema().length, 1)
  })

  it('omits modal when no modal builders ran', () => {
    const a = Action.make('plain').handler(() => {})
    assert.equal(a.toMeta()['modal'], undefined)
    assert.equal(a.hasModal(), false)
  })

  it('runs schema validation before the handler — rejects with errors', async () => {
    const { TextField } = await import('../fields/TextField.js')
    let handlerRan = false
    const a = Action.make('save')
      .schema([TextField.make('priority').required()])
      .handler(() => { handlerRan = true })
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error, 'validation')
      assert.ok(result.errors?.['priority']?.length, 'priority error expected')
    }
    assert.equal(handlerRan, false, 'handler should not run on validation failure')
  })

  it('coerces values before invoking the handler when valid', async () => {
    const { ToggleField } = await import('../fields/ToggleField.js')
    const { NumberField } = await import('../fields/NumberField.js')
    let captured: Record<string, unknown> = {}
    const a = Action.make('save')
      .schema([
        ToggleField.make('featured'),
        NumberField.make('priority'),
      ])
      .handler((ctx) => { captured = ctx.values ?? {} })
    const result = await dispatchAction(a, {
      ids: [],
      values: { featured: 'true', priority: '7' },
    })
    assert.equal(result.ok, true)
    assert.equal(captured['featured'], true,  'toggle string "true" → boolean true')
    assert.equal(captured['priority'], 7,     'number string "7" → 7')
  })

  it('does not run validation/coercion when action has no schema (confirm-only)', async () => {
    const a = Action.make('confirm-only')
      .modalHeading('Sure?')
      .handler((_ctx) => { /* values pass through untouched */ })
    const result = await dispatchAction(a, { ids: [], values: { foo: 'bar' } })
    assert.equal(result.ok, true, 'no schema means no validation gate')
  })
})

describe('Action notifications', () => {
  it('handler can return a single Notification instance', async () => {
    const { Notification } = await import('../notifications/Notification.js')
    const a = Action.make('save').handler(() => ({ notify: Notification.make('Done').success() }))
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.notifications?.length, 1)
      assert.equal(result.notifications?.[0]?.title, 'Done')
      assert.equal(result.notifications?.[0]?.type, 'success')
    }
  })

  it('handler can return a serialized NotificationMeta directly', async () => {
    const a = Action.make('save').handler(() => ({
      notify: { id: 'n1', type: 'info' as const, title: 'Hi' },
    }))
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.notifications?.[0]?.id, 'n1')
      assert.equal(result.notifications?.[0]?.title, 'Hi')
    }
  })

  it('handler can return an array of notifications', async () => {
    const { Notification } = await import('../notifications/Notification.js')
    const a = Action.make('save').handler(() => ({
      notify: [Notification.make('A').success(), Notification.make('B').warning()],
    }))
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.notifications?.length, 2)
      assert.equal(result.notifications?.[0]?.title, 'A')
      assert.equal(result.notifications?.[1]?.type, 'warning')
    }
  })

  it('absence of notify means no notifications field on success', async () => {
    const a = Action.make('save').handler(() => {})
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.notifications, undefined)
  })

  it('redirect + notify both flow through', async () => {
    const { Notification } = await import('../notifications/Notification.js')
    const a = Action.make('save').handler(() => ({
      redirect: '/articles',
      notify:   Notification.make('Saved').success(),
    }))
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.redirect, '/articles')
      assert.equal(result.notifications?.[0]?.title, 'Saved')
    }
  })
})

describe('Action download envelope', () => {
  it('handler-returned { download } flows onto DispatchActionSuccess.download', async () => {
    const a = Action.make('export').handler(() => ({
      download: { filename: 'x.csv', contentType: 'text/csv', body: 'a\r\n1\r\n' },
    }))
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepEqual(result.download, {
        filename:    'x.csv',
        contentType: 'text/csv',
        body:        'a\r\n1\r\n',
      })
    }
  })

  it('partial download envelope (missing required fields) is dropped', async () => {
    // @ts-expect-error — testing the runtime guard, not the public type.
    const a = Action.make('export').handler(() => ({
      download: { filename: 'x.csv' },
    }))
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.download, undefined)
  })

  it('absence of download keeps the field undefined on success', async () => {
    const a = Action.make('save').handler(() => ({ notify: { id: 'n1', type: 'success' as const, title: 'ok' } }))
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.download, undefined)
  })

  it('download + notify can both flow through together', async () => {
    const a = Action.make('export').handler(() => ({
      download: { filename: 'x.csv', contentType: 'text/csv', body: 'a\r\n1\r\n' },
      notify:   { id: 'n2', type: 'success' as const, title: 'Exported' },
    }))
    const result = await dispatchAction(a, { ids: [], values: {} })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.download?.filename, 'x.csv')
      assert.equal(result.notifications?.[0]?.title, 'Exported')
    }
  })
})

describe('findRowExtraActions', () => {
  it('returns extraItemActions registered on Repeater fields', () => {
    const send = Action.make('sendTest').handler(() => undefined)
    const repeater = RepeaterField.make('items')
      .schema([TextField.make('email')])
      .extraItemActions([send])
    const found = findRowExtraActions([repeater])
    assert.equal(found.length, 1)
    assert.equal(found[0]!.action.name, 'sendTest')
    assert.equal(found[0]!.fieldName, 'items')
  })

  it('returns extraItemActions registered on Builder fields', () => {
    const promote = Action.make('promote').handler(() => undefined)
    const builder = BuilderField.make('content')
      .blocks([Block.make('heading').schema([TextField.make('text')])])
      .extraItemActions([promote])
    const found = findRowExtraActions([builder])
    assert.equal(found.length, 1)
    assert.equal(found[0]!.action.name, 'promote')
    assert.equal(found[0]!.fieldName, 'content')
  })

  it('returns empty when no row actions are registered', () => {
    const r = RepeaterField.make('items').schema([TextField.make('x')])
    assert.deepEqual(findRowExtraActions([r]), [])
  })

  it('walks past containers to find Repeater/Builder fields', () => {
    const a = Action.make('a').handler(() => undefined)
    const repeater = RepeaterField.make('items').schema([TextField.make('x')]).extraItemActions([a])
    const tree = [Section.make('S').schema([Card.make('C').schema([repeater])])]
    const found = findRowExtraActions(tree)
    assert.equal(found.length, 1)
    assert.equal(found[0]!.fieldName, 'items')
  })

  it('walks into Repeater inner schema for nested Repeater rows', () => {
    const inner = Action.make('innerAction').handler(() => undefined)
    const innerRepeater = RepeaterField.make('rows')
      .schema([TextField.make('y')])
      .extraItemActions([inner])
    const outerRepeater = RepeaterField.make('groups')
      .schema([TextField.make('x'), innerRepeater])
    const found = findRowExtraActions([outerRepeater])
    assert.equal(found.length, 1)
    assert.equal(found[0]!.fieldName, 'rows')
  })
})

describe('dispatchAction with rowField + rowPath (extraItemActions)', () => {
  it('hydrates ctx.row.values from a flat-keyed form body', async () => {
    let seenCtx: { row?: { index: number; id: string; values: Record<string, unknown>; fieldName: string } } | undefined
    const action = Action.make('sendTest').handler(ctx => { seenCtx = ctx })
    const repeater = RepeaterField.make('items')
      .schema([TextField.make('email')])
      .extraItemActions([action])

    const result = await dispatchAction(action, {
      ids:    [],
      values: {
        'items.0.email': 'a@x.com',
        'items.0.__id': 'row-aaa',
        'items.1.email': 'b@x.com',
        'items.1.__id': 'row-bbb',
      },
      rowPath:    'items.1',
      rowField:   repeater,
      formSchema: [repeater],
    })
    assert.equal(result.ok, true)
    assert.equal(seenCtx?.row?.index, 1)
    assert.equal(seenCtx?.row?.id, 'row-bbb')
    assert.equal(seenCtx?.row?.fieldName, 'items')
    assert.deepEqual(seenCtx?.row?.values, { email: 'b@x.com', __id: 'row-bbb' })
  })

  it('rejects rowPath whose field name does not match (silent fall-through)', async () => {
    let seenCtx: { row?: unknown } | undefined
    const action = Action.make('sendTest').handler(ctx => { seenCtx = ctx })
    const repeater = RepeaterField.make('items')
      .schema([TextField.make('email')])
      .extraItemActions([action])

    const result = await dispatchAction(action, {
      ids:    [],
      values: { 'items.0.email': 'a@x.com' },
      rowPath:    'foreignField.0',
      rowField:   repeater,
      formSchema: [repeater],
    })
    assert.equal(result.ok, true)
    assert.equal(seenCtx?.row, undefined)
  })

  it('hydrates ctx.row for Builder rows (unwraps `data` envelope) + sets blockType', async () => {
    let seenCtx: { row?: { values: Record<string, unknown>; blockType?: string } } | undefined
    const action = Action.make('promote').handler(ctx => { seenCtx = ctx })
    const builder = BuilderField.make('content')
      .blocks([Block.make('heading').schema([TextField.make('text')])])
      .extraItemActions([action])

    const result = await dispatchAction(action, {
      ids:    [],
      values: {
        'content.0.__id': 'row-1',
        'content.0.type': 'heading',
        'content.0.data.text': 'Hello',
      },
      rowPath:    'content.0',
      rowField:   builder,
      formSchema: [builder],
    })
    assert.equal(result.ok, true)
    assert.equal(seenCtx?.row?.blockType, 'heading')
    assert.deepEqual(seenCtx?.row?.values, { text: 'Hello' })
  })

  it('parseActionBody extracts _rowPath into the input', () => {
    const r = parseActionBody({ _rowPath: 'items.2', name: 'foo' })
    assert.equal(r.rowPath, 'items.2')
    assert.deepEqual(r.values, { name: 'foo' })
  })

  it('parseActionBody returns rowPath undefined when missing', () => {
    const r = parseActionBody({ name: 'foo' })
    assert.equal(r.rowPath, undefined)
  })
})
