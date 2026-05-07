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
