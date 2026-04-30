import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Form } from './Form.js'
import { applyStateUpdate, coerceFormValues, dispatchFormSubmit, findForms, selectForm } from './dispatchForm.js'
import { TextField } from '../fields/TextField.js'
import { NumberField } from '../fields/NumberField.js'
import { ToggleField } from '../fields/ToggleField.js'
import { Section } from '../schema/Section.js'
import { makeValidator, required } from '../validation/index.js'

describe('dispatchFormSubmit', () => {
  it('happy path: validate → mutate → beforeSave → save → afterSave → redirect', async () => {
    const order: string[] = []
    const form = Form.make<{ id: string; title: string }>()
      .schema([TextField.make('title').required()])
      .mutateData(d => { order.push('mutate'); return { ...d, title: String(d['title']).trim() } })
      .beforeSave(() => { order.push('before') })
      .save(async (data) => { order.push('save'); return { id: '1', title: String(data['title']) } })
      .afterSave(() => { order.push('after') })
      .redirectAfterSave(rec => `/articles/${rec.id}/edit`)

    const result = await dispatchFormSubmit(form, { title: '  Hello  ' }, { values: { title: '  Hello  ' } })

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepEqual(result.record, { id: '1', title: 'Hello' })
      assert.equal(result.redirect, '/articles/1/edit')
    }
    assert.deepEqual(order, ['mutate', 'before', 'save', 'after'])
  })

  it('validation failure short-circuits before mutateData/save', async () => {
    let saveCalled = false
    const form = Form.make()
      .schema([TextField.make('title').required()])
      .mutateData(d => d)
      .save(async () => { saveCalled = true; return {} })

    const result = await dispatchFormSubmit(form, { title: '' }, { values: { title: '' } })

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.errors['title'])
      assert.ok(result.errors['title']!.length > 0)
    }
    assert.equal(saveCalled, false)
  })

  it('form-level validators land under _form', async () => {
    const passwordsMatch = makeValidator((v) => {
      const obj = v as { password?: string; confirm?: string }
      return obj.password === obj.confirm ? null : 'Passwords must match'
    })

    const form = Form.make()
      .schema([
        TextField.make('password').required(),
        TextField.make('confirm').required(),
      ])
      .validate(passwordsMatch)
      .save(async () => ({ ok: true }))

    const result = await dispatchFormSubmit(
      form,
      { password: 'a', confirm: 'b' },
      { values: { password: 'a', confirm: 'b' } },
    )
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.deepEqual(result.errors['_form'], ['Passwords must match'])
    }
  })

  it('walks nested containers when validating', async () => {
    const form = Form.make().schema([
      Section.make('Body').schema([
        TextField.make('title').required(),
      ]),
    ]).save(async () => ({}))

    const result = await dispatchFormSubmit(form, { title: '' }, { values: { title: '' } })
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.errors['title'])
  })

  it('throws when no save handler is configured', async () => {
    const form = Form.make().schema([TextField.make('x')])
    await assert.rejects(
      () => dispatchFormSubmit(form, {}, { values: {} }),
      /no save\(\) handler/i,
    )
  })

  it('forwards record into ctx for save/afterSave/redirect', async () => {
    const seen: { saveRecord?: unknown; afterRecord?: unknown } = {}
    const form = Form.make<{ id: string }>()
      .schema([TextField.make('x')])
      .save(async (data, ctx) => { seen.saveRecord = ctx.record; return { id: 'r1' } })
      .afterSave((rec, ctx) => { seen.afterRecord = ctx.record })
      .redirectAfterSave((rec) => `/done/${rec.id}`)

    const existing = { id: 'r1', x: 'old' }
    const result = await dispatchFormSubmit(form, { x: 'new' }, { values: { x: 'new' }, record: existing })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.redirect, '/done/r1')
    assert.equal(seen.saveRecord, existing)        // record present during save
    assert.deepEqual(seen.afterRecord, { id: 'r1' }) // record updated to saved entity in afterSave ctx
  })

  describe('create vs update mode-routing', () => {
    function instrument() {
      const order: string[] = []
      const form = Form.make<{ id: number }>()
        .schema([TextField.make('title')])
        .mutateData(d => { order.push('mutateData'); return d })
        .mutateDataBeforeCreate(d => { order.push('mutateDataBeforeCreate'); return d })
        .mutateDataBeforeUpdate(d => { order.push('mutateDataBeforeUpdate'); return d })
        .beforeSave(() => { order.push('beforeSave') })
        .beforeCreate(() => { order.push('beforeCreate') })
        .beforeUpdate(() => { order.push('beforeUpdate') })
        .save(async () => { order.push('save'); return { id: 0 } })
        .afterCreate(() => { order.push('afterCreate') })
        .afterUpdate(() => { order.push('afterUpdate') })
        .afterSave(() => { order.push('afterSave') })
      return { form, order }
    }

    it('create mode runs only the create-side hooks, in correct order', async () => {
      const { form, order } = instrument()
      const r = await dispatchFormSubmit(form, { title: 't' }, { values: { title: 't' } })
      assert.equal(r.ok, true)
      assert.deepEqual(order, [
        'mutateData',
        'mutateDataBeforeCreate',
        'beforeSave',
        'beforeCreate',
        'save',
        'afterCreate',
        'afterSave',
      ])
    })

    it('update mode runs only the update-side hooks, in correct order', async () => {
      const { form, order } = instrument()
      const r = await dispatchFormSubmit(form, { title: 't' }, { values: { title: 't' }, record: { id: 7 } })
      assert.equal(r.ok, true)
      assert.deepEqual(order, [
        'mutateData',
        'mutateDataBeforeUpdate',
        'beforeSave',
        'beforeUpdate',
        'save',
        'afterUpdate',
        'afterSave',
      ])
    })

    it('handleCreate replaces save() in create mode only', async () => {
      const calls: string[] = []
      const form = Form.make<{ id: number }>()
        .schema([TextField.make('x')])
        .save(async () => { calls.push('save'); return { id: 0 } })
        .handleCreate(async () => { calls.push('handleCreate'); return { id: 1 } })
        .handleUpdate(async () => { calls.push('handleUpdate'); return { id: 2 } })

      const a = await dispatchFormSubmit(form, { x: '' }, { values: { x: '' } })
      assert.equal(a.ok, true)
      if (a.ok) assert.deepEqual(a.record, { id: 1 })

      const b = await dispatchFormSubmit(form, { x: '' }, { values: { x: '' }, record: { id: 99 } })
      assert.equal(b.ok, true)
      if (b.ok) assert.deepEqual(b.record, { id: 2 })

      assert.deepEqual(calls, ['handleCreate', 'handleUpdate'])
    })

    it('falls back to save() when only save() is configured', async () => {
      const calls: string[] = []
      const form = Form.make<{ id: number }>()
        .schema([TextField.make('x')])
        .save(async () => { calls.push('save'); return { id: 1 } })

      const a = await dispatchFormSubmit(form, { x: '' }, { values: { x: '' } })
      assert.equal(a.ok, true)
      const b = await dispatchFormSubmit(form, { x: '' }, { values: { x: '' }, record: { id: 99 } })
      assert.equal(b.ok, true)
      assert.deepEqual(calls, ['save', 'save'])
    })

    it('throws when neither save() nor a mode-specific handler is configured', async () => {
      const form = Form.make().schema([TextField.make('x')])
      await assert.rejects(
        () => dispatchFormSubmit(form, {}, { values: {} }),
        /no save\(\) handler/i,
      )
    })
  })

  describe('saved-notification on the success result', () => {
    it('returns an empty notifications array when nothing is configured', async () => {
      const form = Form.make()
        .schema([TextField.make('x')])
        .save(async () => ({ id: 1 }))
      const r = await dispatchFormSubmit(form, { x: '' }, { values: {} })
      assert.equal(r.ok, true)
      if (r.ok) assert.deepEqual(r.notifications, [])
    })

    it('returns a single success notification when configured', async () => {
      const form = Form.make()
        .schema([TextField.make('x')])
        .save(async () => ({ id: 1 }))
        .savedNotification('Saved')
      const r = await dispatchFormSubmit(form, { x: '' }, { values: {} })
      assert.equal(r.ok, true)
      if (r.ok) {
        assert.equal(r.notifications.length, 1)
        assert.equal(r.notifications[0]!.title, 'Saved')
        assert.equal(r.notifications[0]!.type, 'success')
      }
    })

    it('uses createdNotification in create mode', async () => {
      const form = Form.make()
        .schema([TextField.make('x')])
        .save(async () => ({ id: 1 }))
        .savedNotification('Saved')
        .createdNotification('Created')
      const r = await dispatchFormSubmit(form, { x: '' }, { values: {} })
      assert.equal(r.ok, true)
      if (r.ok) assert.equal(r.notifications[0]!.title, 'Created')
    })
  })
})

describe('findForms / selectForm', () => {
  it('findForms returns every Form in document order, including nested', () => {
    const inner = Form.make().formId('inner')
    const outer = Form.make().formId('outer').schema([
      Section.make('s').schema([inner]),
    ])
    const top = Form.make().formId('top')
    const found = findForms([top, outer])
    assert.deepEqual(found.map(f => f.getFormId()), ['top', 'outer', 'inner'])
  })

  it('selectForm matches by submitted formId, falls back to first', () => {
    const a = Form.make().formId('a')
    const b = Form.make().formId('b')
    const c = Form.make().formId('c')

    assert.equal(selectForm([a, b, c], 'b'), b)
    assert.equal(selectForm([a, b, c], undefined), a)
    assert.equal(selectForm([a, b, c], 'missing'), a)
    assert.equal(selectForm([], undefined), undefined)
  })
})

describe('applyStateUpdate (Plan #5)', () => {
  it('returns null when the changed field is unknown', async () => {
    const form = Form.make().schema([TextField.make('title').live()])
    const result = await applyStateUpdate(form, { title: 'x' }, 'missing')
    assert.equal(result, null)
  })

  it('coerces the changed field but leaves others untouched', async () => {
    const form = Form.make().schema([
      TextField.make('title'),
      ToggleField.make('featured').live(),
    ])
    const result = await applyStateUpdate(form, { title: '  unsaved  ', featured: 'true' }, 'featured')
    assert.equal(result?.values['featured'], true)
    // title stayed exactly as the client sent it (no trim, no mutate).
    assert.equal(result?.values['title'], '  unsaved  ')
    assert.deepEqual(result?.dirty, ['featured'])
  })

  it('runs afterStateUpdated and exposes $get / $set', async () => {
    const form = Form.make().schema([
      TextField.make('title').live().afterStateUpdated((value, { $set, $get }) => {
        const t = String(value).toLowerCase().replace(/\s+/g, '-')
        $set('slug', t)
        // $get sees the just-mutated value
        assert.equal($get('slug'), t)
      }),
      TextField.make('slug'),
    ])
    const result = await applyStateUpdate(form, { title: 'Hello World', slug: 'old' }, 'title')
    assert.equal(result?.values['slug'], 'hello-world')
    assert.deepEqual(result?.dirty.sort(), ['slug', 'title'])
  })

  it('walks nested containers to find the changed field', async () => {
    const form = Form.make().schema([
      Section.make('s').schema([TextField.make('nested').live()]),
    ])
    const result = await applyStateUpdate(form, { nested: 'v' }, 'nested')
    assert.notEqual(result, null)
  })

  it('async afterStateUpdated is awaited', async () => {
    let resolved = false
    const form = Form.make().schema([
      TextField.make('a').live().afterStateUpdated(async (_v, { $set }) => {
        await new Promise(r => setTimeout(r, 1))
        $set('b', 'derived')
        resolved = true
      }),
      TextField.make('b'),
    ])
    const result = await applyStateUpdate(form, { a: 'x', b: '' }, 'a')
    assert.equal(resolved, true)
    assert.equal(result?.values['b'], 'derived')
  })

  it('threads record/user/request through hookCtx', async () => {
    let seen: { record?: unknown; user?: unknown } = {}
    const form = Form.make().schema([
      TextField.make('a').live().afterStateUpdated((_v, ctx) => {
        seen = { record: ctx.record, user: ctx.user }
      }),
    ])
    await applyStateUpdate(form, { a: 'x' }, 'a', { record: { id: 1 }, user: { name: 'sue' } })
    assert.deepEqual(seen.record, { id: 1 })
    assert.deepEqual(seen.user,   { name: 'sue' })
  })
})

describe('coerceFormValues — dehydrated(false) (Plan #6)', () => {
  it('drops the body key for dehydrated-false fields before validation', () => {
    const elements = [
      TextField.make('title'),
      TextField.make('computed').dehydrated(false),
    ]
    const out = coerceFormValues(elements, { title: 'Hello', computed: 'should-not-survive' })
    assert.equal(out['title'],    'Hello')
    assert.equal('computed' in out, false)
  })

  it('leaves dehydrated-true fields untouched (default behaviour)', () => {
    const elements = [TextField.make('title')]
    const out = coerceFormValues(elements, { title: 'Hello' })
    assert.equal(out['title'], 'Hello')
  })

  it('skips coercion for dehydrated-false even when the type would coerce', () => {
    // NumberField normally coerces strings → numbers. Dehydrated-false
    // should drop the value entirely, not coerce it first.
    const elements = [NumberField.make('decoy').dehydrated(false)]
    const out = coerceFormValues(elements, { decoy: '42' })
    assert.equal('decoy' in out, false)
  })
})
