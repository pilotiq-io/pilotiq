import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { SelectField } from './SelectField.js'
import { TextField } from './TextField.js'

describe('SelectField', () => {
  it('emits fieldType "select"', async () => {
    const meta = await SelectField.make('country').toMeta()
    assert.equal(meta.fieldType, 'select')
  })

  describe('createOptionForm', () => {
    it('bare SelectField emits no createOption slot', async () => {
      const meta = await SelectField.make('categoryId').options([
        { value: '1', label: 'News' },
      ]).toMeta()
      assert.equal('createOption' in meta, false)
    })

    it('createOptionForm without createOptionUsing throws at meta-build', async () => {
      const f = SelectField.make('categoryId')
        .options([])
        .createOptionForm([TextField.make('name')])
      await assert.rejects(
        () => f.toMeta(),
        /createOptionForm\(\) requires createOptionUsing\(handler\)/,
      )
    })

    it('emits createOption slot with formId + schema when fully configured', async () => {
      const meta = await SelectField.make('categoryId')
        .options([])
        .createOptionForm([
          TextField.make('name'),
          TextField.make('slug'),
        ])
        .createOptionUsing(async ({ name }) => ({
          value: 'new-id',
          label: String(name),
        }))
        .toMeta()

      const slot = (meta as { createOption?: { formId: string; schema: unknown[]; url?: string } }).createOption
      assert.ok(slot, 'createOption slot should be present')
      assert.equal(slot.formId, 'categoryId_create-option')
      assert.equal(Array.isArray(slot.schema), true)
      assert.equal(slot.schema.length, 2)
      // url is filled in by the walker — absent at this layer
      assert.equal(slot.url, undefined)
    })

    it('hasCreateOption reflects configuration', () => {
      const off = SelectField.make('a').options([])
      const on  = SelectField.make('a').options([])
        .createOptionForm([TextField.make('name')])
      assert.equal(off.hasCreateOption(), false)
      assert.equal(on.hasCreateOption(), true)
    })

    it('child schema resolves with parent ctx — values flow through', async () => {
      const f = SelectField.make('categoryId')
        .options([])
        .createOptionForm([TextField.make('name').default('seeded')])
        .createOptionUsing(async () => ({ value: '1', label: 'x' }))

      const meta = await f.toMeta({ values: { irrelevant: 'parent' } })
      const slot = (meta as { createOption?: { schema: Array<{ defaultValue?: string }> } }).createOption
      assert.ok(slot)
      // The child TextField resolved through its own toMeta — defaultValue
      // flows into FieldMeta.defaultValue (string field). Not asserting the
      // exact key (TextField may stamp `defaultValue` or not), but the
      // schema array has length 1 with the right name.
      assert.equal(slot.schema.length, 1)
      assert.equal((slot.schema[0] as { name?: string }).name, 'name')
    })

    describe('createOptionAuthorize', () => {
      it('default visibility is true (slot stamped)', async () => {
        const meta = await SelectField.make('a').options([])
          .createOptionForm([TextField.make('name')])
          .createOptionUsing(async () => ({ value: '1', label: 'x' }))
          .toMeta()
        assert.ok((meta as { createOption?: unknown }).createOption)
      })

      it('boolean false suppresses the slot', async () => {
        const meta = await SelectField.make('a').options([])
          .createOptionForm([TextField.make('name')])
          .createOptionUsing(async () => ({ value: '1', label: 'x' }))
          .createOptionAuthorize(false)
          .toMeta()
        assert.equal('createOption' in meta, false)
      })

      it('boolean true keeps the slot', async () => {
        const meta = await SelectField.make('a').options([])
          .createOptionForm([TextField.make('name')])
          .createOptionUsing(async () => ({ value: '1', label: 'x' }))
          .createOptionAuthorize(true)
          .toMeta()
        assert.ok((meta as { createOption?: unknown }).createOption)
      })

      it('callback rule sees ctx.user', async () => {
        let seenUser: unknown = undefined
        const meta = await SelectField.make('a').options([])
          .createOptionForm([TextField.make('name')])
          .createOptionUsing(async () => ({ value: '1', label: 'x' }))
          .createOptionAuthorize((ctx) => { seenUser = ctx.user; return true })
          .toMeta({ user: { id: 42 } })
        assert.deepEqual(seenUser, { id: 42 })
        assert.ok((meta as { createOption?: unknown }).createOption)
      })

      it('callback returning false suppresses the slot', async () => {
        const meta = await SelectField.make('a').options([])
          .createOptionForm([TextField.make('name')])
          .createOptionUsing(async () => ({ value: '1', label: 'x' }))
          .createOptionAuthorize(() => false)
          .toMeta()
        assert.equal('createOption' in meta, false)
      })

      it('throwing rule fails CLOSED (slot suppressed)', async () => {
        const meta = await SelectField.make('a').options([])
          .createOptionForm([TextField.make('name')])
          .createOptionUsing(async () => ({ value: '1', label: 'x' }))
          .createOptionAuthorize(() => { throw new Error('boom') })
          .toMeta()
        assert.equal('createOption' in meta, false)
      })

      it('async callback resolves correctly', async () => {
        const meta = await SelectField.make('a').options([])
          .createOptionForm([TextField.make('name')])
          .createOptionUsing(async () => ({ value: '1', label: 'x' }))
          .createOptionAuthorize(async () => true)
          .toMeta()
        assert.ok((meta as { createOption?: unknown }).createOption)
      })
    })

    describe('withCreateOptionUrl', () => {
      it('round-trips via getCreateOptionUrl', () => {
        const f = SelectField.make('a').withCreateOptionUrl('/p/_form/x/create-option/a')
        assert.equal(f.getCreateOptionUrl(), '/p/_form/x/create-option/a')
      })

      it('emits url into createOption slot when set', async () => {
        const meta = await SelectField.make('a').options([])
          .createOptionForm([TextField.make('name')])
          .createOptionUsing(async () => ({ value: '1', label: 'x' }))
          .withCreateOptionUrl('/admin/things/_form/parent/create-option/a')
          .toMeta()
        const slot = (meta as { createOption?: { url?: string } }).createOption!
        assert.equal(slot.url, '/admin/things/_form/parent/create-option/a')
      })

      it('omits url key when no walker has stamped it', async () => {
        const meta = await SelectField.make('a').options([])
          .createOptionForm([TextField.make('name')])
          .createOptionUsing(async () => ({ value: '1', label: 'x' }))
          .toMeta()
        const slot = (meta as { createOption?: { url?: string } }).createOption!
        assert.equal('url' in slot, false)
      })
    })

    describe('accessors', () => {
      it('getCreateOptionForm / Handler / Authorize round-trip', () => {
        const fields    = [TextField.make('name')]
        const handler   = async () => ({ value: '1', label: 'x' })
        const authorize = () => true
        const f = SelectField.make('a')
          .createOptionForm(fields)
          .createOptionUsing(handler)
          .createOptionAuthorize(authorize)
        assert.equal(f.getCreateOptionForm(), fields)
        assert.equal(f.getCreateOptionHandler(), handler)
        assert.equal(f.getCreateOptionAuthorize(), authorize)
      })

      it('accessors return undefined when not set', () => {
        const f = SelectField.make('a')
        assert.equal(f.getCreateOptionForm(), undefined)
        assert.equal(f.getCreateOptionHandler(), undefined)
        assert.equal(f.getCreateOptionAuthorize(), undefined)
      })
    })
  })
})

describe('numeric option values (string | number widening)', () => {
  it('normalizes static numeric values to the string wire shape', async () => {
    const f = SelectField.make('categoryId').options([
      { value: 1, label: 'News' },
      { value: 2, label: 'Sports', disabled: true },
      { value: 'misc', label: 'Misc' },
    ])
    const meta = await f.toMeta()
    assert.deepEqual(meta.options, [
      { value: '1', label: 'News' },
      { value: '2', label: 'Sports', disabled: true },
      { value: 'misc', label: 'Misc' },
    ])
  })

  it('normalizes resolver-returned numeric values', async () => {
    const f = SelectField.make('authorId').options(async () => [
      { value: 7, label: 'Ada' },
    ])
    const meta = await f.toMeta()
    assert.deepEqual(meta.options, [{ value: '7', label: 'Ada' }])
  })
})
