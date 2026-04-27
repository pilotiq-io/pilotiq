import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Form } from './Form.js'
import { dispatchFormSubmit, findForms, selectForm } from './dispatchForm.js'
import { TextField } from '../fields/TextField.js'
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
