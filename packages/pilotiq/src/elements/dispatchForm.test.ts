import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Form } from './Form.js'
import { applyDehydrateTransforms, applyStateUpdate, coerceFormValues, dispatchFormSubmit, findForms, findWizardStep, findWizardStepFields, selectForm, selectFormById } from './dispatchForm.js'
import { Wizard, Step } from '../schema/Wizard.js'
import { TextField } from '../fields/TextField.js'
import { NumberField } from '../fields/NumberField.js'
import { ToggleField } from '../fields/ToggleField.js'
import { TagsInputField } from '../fields/TagsInputField.js'
import { Field, type FieldMeta } from '../fields/Field.js'
import { RepeaterField } from '../fields/RepeaterField.js'
import { BuilderField } from '../fields/BuilderField.js'
import { Block } from '../schema/Block.js'
import { Section } from '../schema/Section.js'
import { makeValidator } from '../validation/index.js'

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

describe('findForms / selectForm / selectFormById', () => {
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

  it('selectFormById matches by id, falls back only when one form is present', () => {
    const a = Form.make().formId('a')
    const b = Form.make().formId('b')
    const c = Form.make().formId('c')

    // Direct match always wins.
    assert.equal(selectFormById([a, b, c], 'b'), b)

    // Multi-form pages: missing/wrong id → undefined (no silent fallback).
    assert.equal(selectFormById([a, b, c], 'missing'), undefined)
    assert.equal(selectFormById([a, b, c], ''), undefined)

    // Single-form pages: id mismatch falls back to the only form.
    // Removes the auto-counter desync footgun for reactive demos.
    const sole = Form.make().formId('sole')
    assert.equal(selectFormById([sole], 'mismatched'), sole)
    assert.equal(selectFormById([sole], 'sole'), sole)
    assert.equal(selectFormById([sole], ''), sole)

    // Empty page: nothing to return.
    assert.equal(selectFormById([], 'a'), undefined)
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

describe('coerceFormValues — tagsInput', () => {
  it('parses a JSON-encoded string array into string[]', () => {
    const elements = [TagsInputField.make('tags')]
    const out = coerceFormValues(elements, { tags: '["react","vue"]' })
    assert.deepEqual(out['tags'], ['react', 'vue'])
  })

  it('passes a real array through verbatim', () => {
    const elements = [TagsInputField.make('tags')]
    const out = coerceFormValues(elements, { tags: ['a', 'b'] })
    assert.deepEqual(out['tags'], ['a', 'b'])
  })

  it('coerces to [] for empty / null / undefined / unparseable JSON', () => {
    const elements = [TagsInputField.make('tags')]
    assert.deepEqual(coerceFormValues(elements, { tags: '' }).tags,        [])
    assert.deepEqual(coerceFormValues(elements, { tags: null }).tags,      [])
    assert.deepEqual(coerceFormValues(elements, {}).tags,                  [])
    assert.deepEqual(coerceFormValues(elements, { tags: 'not-json' }).tags, [])
  })

  it('coerces non-array JSON to []', () => {
    const elements = [TagsInputField.make('tags')]
    const out = coerceFormValues(elements, { tags: '{"a":1}' })
    assert.deepEqual(out['tags'], [])
  })

  it('coerces non-string array entries to strings', () => {
    const elements = [TagsInputField.make('tags')]
    const out = coerceFormValues(elements, { tags: [1, 2, 'three'] })
    assert.deepEqual(out['tags'], ['1', '2', 'three'])
  })
})

// Stand-in for `@pilotiq/media`'s MediaField — exercises core's `'media'`
// coerce branch without a cross-package import.
class MediaTestField extends Field {
  constructor(name: string) { super(name, 'media') }
  override toMeta(): FieldMeta { return this.buildMeta() }
}

describe('coerceFormValues — media', () => {
  it('parses a JSON-encoded single ref string into an object', () => {
    const out = coerceFormValues([new MediaTestField('cover')], { cover: '{"id":"01","url":"/m/a.jpg","name":"a.jpg"}' })
    assert.deepEqual(out['cover'], { id: '01', url: '/m/a.jpg', name: 'a.jpg' })
  })

  it('parses a JSON-encoded multi-ref array string', () => {
    const out = coerceFormValues([new MediaTestField('gallery')], { gallery: '[{"id":"01"},{"id":"02"}]' })
    assert.deepEqual(out['gallery'], [{ id: '01' }, { id: '02' }])
  })

  it('coerces empty / null / undefined to null', () => {
    const f = [new MediaTestField('cover')]
    assert.equal(coerceFormValues(f, { cover: '' }).cover,   null)
    assert.equal(coerceFormValues(f, { cover: null }).cover, null)
    assert.equal(coerceFormValues(f, {}).cover,              null)
  })

  it('coerces unparseable JSON to null', () => {
    const out = coerceFormValues([new MediaTestField('cover')], { cover: 'not-json' })
    assert.equal(out['cover'], null)
  })

  it('passes an already-structured value through', () => {
    const out = coerceFormValues([new MediaTestField('cover')], { cover: { id: '01' } })
    assert.deepEqual(out['cover'], { id: '01' })
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

describe('findWizardStepFields (Plan #8)', () => {
  it('returns the children of the requested step', () => {
    const form = Form.make().schema([
      Wizard.make().steps([
        Step.make('a').schema([TextField.make('email')]),
        Step.make('b').schema([TextField.make('name')]),
      ]),
    ])
    const fields = findWizardStepFields(form.getChildren()!, 1)
    assert.ok(fields)
    assert.equal(fields!.length, 1)
    assert.equal((fields![0] as TextField).name, 'name')
  })

  it('returns undefined when no Wizard descendant exists', () => {
    const form = Form.make().schema([TextField.make('plain')])
    const fields = findWizardStepFields(form.getChildren()!, 0)
    assert.equal(fields, undefined)
  })

  it('returns undefined when the step index is out of range', () => {
    const form = Form.make().schema([
      Wizard.make().steps([Step.make('only').schema([TextField.make('x')])]),
    ])
    const fields = findWizardStepFields(form.getChildren()!, 5)
    assert.equal(fields, undefined)
  })

  it('walks through containers to find the wizard', () => {
    const form = Form.make().schema([
      Section.make('outer').schema([
        Wizard.make().steps([
          Step.make('inner').schema([TextField.make('nested')]),
        ]),
      ]),
    ])
    const fields = findWizardStepFields(form.getChildren()!, 0)
    assert.ok(fields)
    assert.equal((fields![0] as TextField).name, 'nested')
  })
})

describe('findWizardStep (Plan #8)', () => {
  it('returns the live Step instance for the requested index', () => {
    const stepA = Step.make('a').schema([TextField.make('email')])
    const stepB = Step.make('b').schema([TextField.make('name')])
    const form = Form.make().schema([Wizard.make().steps([stepA, stepB])])
    const found = findWizardStep(form.getChildren()!, 1)
    assert.equal(found, stepB)
  })

  it('returns undefined when no Wizard descendant exists', () => {
    const form = Form.make().schema([TextField.make('plain')])
    assert.equal(findWizardStep(form.getChildren()!, 0), undefined)
  })

  it('returns undefined when the step index is out of range', () => {
    const form = Form.make().schema([
      Wizard.make().steps([Step.make('only').schema([])]),
    ])
    assert.equal(findWizardStep(form.getChildren()!, 5), undefined)
  })
})

describe('dehydrateStateUsing — per-field submit transforms', () => {
  it('transforms the coerced value before mutateData and save', async () => {
    let mutateSaw: unknown
    let saveSaw: unknown
    const form = Form.make()
      .schema([ToggleField.make('active').dehydrateStateUsing(v => (v ? 1 : 0))])
      .mutateData(d => { mutateSaw = d['active']; return d })
      .save(async data => { saveSaw = data['active']; return {} })

    const result = await dispatchFormSubmit(form, { active: 'true' }, { values: { active: 'true' } })
    assert.equal(result.ok, true)
    assert.equal(mutateSaw, 1)  // coerce made it `true`, dehydrate made it 1
    assert.equal(saveSaw, 1)
  })

  it('supports async handlers and exposes { record, values }', async () => {
    const seen: { record?: unknown; slugAtCallTime?: unknown } = {}
    const existing = { id: 'r1' }
    const form = Form.make()
      .schema([
        TextField.make('slug').dehydrateStateUsing(async (v, ctx) => {
          seen.record = ctx.record
          seen.slugAtCallTime = ctx.values['slug']
          return String(v).toLowerCase()
        }),
      ])
      .save(async data => data)

    const result = await dispatchFormSubmit(form, { slug: 'HELLO' }, { values: { slug: 'HELLO' }, record: existing })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal((result.record as Record<string, unknown>)['slug'], 'hello')
    assert.equal(seen.record, existing)
    assert.equal(seen.slugAtCallTime, 'HELLO')
  })

  it('does not run for dehydrated(false) fields or absent keys', async () => {
    let calls = 0
    const form = Form.make()
      .schema([
        TextField.make('scratch').dehydrated(false).dehydrateStateUsing(() => { calls++; return 'x' }),
        TextField.make('missing').dehydrateStateUsing(() => { calls++; return 'x' }),
      ])
      .save(async data => data)

    const result = await dispatchFormSubmit(form, { scratch: 'noise' }, { values: { scratch: 'noise' } })
    assert.equal(result.ok, true)
    assert.equal(calls, 0)
    if (result.ok) {
      const rec = result.record as Record<string, unknown>
      assert.equal('scratch' in rec, false)
      assert.equal('missing' in rec, false)
    }
  })

  it('applies inside nested containers', async () => {
    const form = Form.make()
      .schema([Section.make('Meta').schema([NumberField.make('priority').dehydrateStateUsing(v => Number(v) * 10)])])
      .save(async data => data)

    const result = await dispatchFormSubmit(form, { priority: '4' }, { values: { priority: '4' } })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal((result.record as Record<string, unknown>)['priority'], 40)
  })

  it('transforms Repeater row fields with row-scoped ctx.values', async () => {
    const rowValues: unknown[] = []
    const form = Form.make()
      .schema([
        RepeaterField.make('lines').schema([
          TextField.make('label'),
          ToggleField.make('done').dehydrateStateUsing((v, ctx) => { rowValues.push(ctx.values['label']); return v ? 1 : 0 }),
        ]),
      ])
      .save(async data => data)

    const body = { lines: [ { label: 'a', done: 'true' }, { label: 'b', done: '' } ] }
    const result = await dispatchFormSubmit(form, body, { values: body })
    assert.equal(result.ok, true)
    if (result.ok) {
      const rows = (result.record as Record<string, unknown>)['lines'] as Array<Record<string, unknown>>
      assert.deepEqual(rows.map(r => r['done']), [1, 0])
    }
    assert.deepEqual(rowValues, ['a', 'b'])
  })

  it('maps the inner handler over simple() Repeater items', async () => {
    const form = Form.make()
      .schema([
        RepeaterField.make('tags').simple(TextField.make('tag').dehydrateStateUsing(v => String(v).toUpperCase())),
      ])
      .save(async data => data)

    const body = { tags: [ { tag: 'one' }, { tag: 'two' } ] }
    const result = await dispatchFormSubmit(form, body, { values: body })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepEqual((result.record as Record<string, unknown>)['tags'], ['ONE', 'TWO'])
    }
  })

  it('runs the Repeater field\'s own handler last, over the whole array', async () => {
    const form = Form.make()
      .schema([
        RepeaterField.make('lines')
          .schema([NumberField.make('qty').dehydrateStateUsing(v => Number(v) * 2)])
          .dehydrateStateUsing(rows => (rows as Array<Record<string, unknown>>).filter(r => Number(r['qty']) > 0)),
      ])
      .save(async data => data)

    const body = { lines: [ { qty: '3' }, { qty: '0' } ] }
    const result = await dispatchFormSubmit(form, body, { values: body })
    assert.equal(result.ok, true)
    if (result.ok) {
      const rows = (result.record as Record<string, unknown>)['lines'] as Array<Record<string, unknown>>
      assert.equal(rows.length, 1)
      assert.equal(rows[0]!['qty'], 6)
    }
  })

  it('transforms Builder row fields against the matching block schema', async () => {
    const form = Form.make()
      .schema([
        BuilderField.make('blocks').blocks([
          Block.make('heading').schema([TextField.make('text').dehydrateStateUsing(v => String(v).trim())]),
          Block.make('quote').schema([TextField.make('text')]),
        ]),
      ])
      .save(async data => data)

    const body = { blocks: [
      { type: 'heading', data: { text: '  Hi  ' } },
      { type: 'quote',   data: { text: '  raw  ' } },
    ] }
    const result = await dispatchFormSubmit(form, body, { values: body })
    assert.equal(result.ok, true)
    if (result.ok) {
      const rows = (result.record as Record<string, unknown>)['blocks'] as Array<{ type: string; data: Record<string, unknown> }>
      assert.equal(rows[0]!.data['text'], 'Hi')        // heading block's handler ran
      assert.equal(rows[1]!.data['text'], '  raw  ')   // quote block has no handler
    }
  })

  it('passes unknown block types through verbatim (direct apply)', async () => {
    // Unknown types are rejected by submit-time validation, but the apply
    // pass itself (exported for reuse) must not crash on or mutate them.
    const builder = BuilderField.make('blocks').blocks([
      Block.make('heading').schema([TextField.make('text').dehydrateStateUsing(v => String(v).trim())]),
    ])
    const data = { blocks: [{ type: 'ghost', data: { text: ' keep ' } }] }
    const out = await applyDehydrateTransforms([builder], data)
    const rows = out['blocks'] as Array<{ type: string; data: Record<string, unknown> }>
    assert.equal(rows[0]!.data['text'], ' keep ')
  })
})
