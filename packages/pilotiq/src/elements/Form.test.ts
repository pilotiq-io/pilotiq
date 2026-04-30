import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Form, _resetFormIdSeq } from './Form.js'
import { TextField } from '../fields/TextField.js'
import { EmailField } from '../fields/EmailField.js'
import { Section } from '../schema/Section.js'
import { Action } from '../actions/Action.js'
import { resolveSchema } from '../schema/resolveSchema.js'
import { required } from '../validation/index.js'

describe('Form Element', () => {
  beforeEach(() => _resetFormIdSeq())

  describe('shape and toMeta', () => {
    it('emits type=form and an auto-generated formId', () => {
      const meta = Form.make().toMeta()
      assert.equal(meta.type, 'form')
      assert.equal(meta.formId, 'form-1')
      assert.equal(meta.method, 'post')
      assert.equal('action' in meta, false)
      assert.equal('values' in meta, false)
      assert.equal('errors' in meta, false)
    })

    it('respects explicit formId / method / action', () => {
      const meta = Form.make()
        .formId('article-form')
        .method('put')
        .action('/admin/articles/42')
        .toMeta()
      assert.equal(meta.formId, 'article-form')
      assert.equal(meta.method, 'put')
      assert.equal(meta.action, '/admin/articles/42')
    })

    it('emits values / errors when set via withValues / withErrors', () => {
      const meta = Form.make()
        .withValues({ title: 'Hello' })
        .withErrors({ title: ['Required'] })
        .toMeta()
      assert.deepEqual(meta.values, { title: 'Hello' })
      assert.deepEqual(meta.errors, { title: ['Required'] })
    })

    it('emits unique formIds across instances', () => {
      const a = Form.make().toMeta()
      const b = Form.make().toMeta()
      assert.notEqual(a.formId, b.formId)
    })
  })

  describe('children + resolver', () => {
    it('children resolve recursively through the standard resolver', async () => {
      const form = Form.make().schema([
        TextField.make('title').required(),
        Section.make('Body').schema([
          TextField.make('body'),
        ]),
      ])
      const [meta] = await resolveSchema([form])
      assert.equal(meta!.type, 'form')
      assert.equal((meta!.children as any[]).length, 2)
      assert.equal((meta!.children as any[])[0].name, 'title')
      assert.equal((meta!.children as any[])[1].type, 'section')
      assert.equal((meta!.children as any[])[1].children.length, 1)
    })

    it('hidden fields inside the form are filtered by the resolver', async () => {
      const form = Form.make().schema([
        TextField.make('title'),
        TextField.make('admin').hideFromCreate(),
      ])
      const [meta] = await resolveSchema([form], { mode: 'create' })
      assert.equal((meta!.children as any[]).length, 1)
      assert.equal((meta!.children as any[])[0].name, 'title')
    })

    it('Action children serialize alongside Fields', async () => {
      const form = Form.make().schema([
        EmailField.make('email'),
        Action.make('save').label('Save'),
      ])
      const [meta] = await resolveSchema([form])
      const kids = meta!.children as any[]
      assert.equal(kids.length, 2)
      assert.equal(kids[0].fieldType, 'email')
      assert.equal(kids[1].type, 'action')
    })
  })

  describe('lifecycle setters store handlers (no dispatch yet)', () => {
    it('save / mutateData / redirectAfterSave round-trip via getters', () => {
      const saveFn = async () => ({ id: 1 })
      const mutateFn = (d: Record<string, unknown>) => d
      const redirectFn = () => '/done'

      const form = Form.make()
        .save(saveFn)
        .mutateData(mutateFn)
        .redirectAfterSave(redirectFn)

      assert.equal(form.getSave(), saveFn)
      assert.equal(form.getMutateData(), mutateFn)
      assert.equal(form.getRedirectAfterSave(), redirectFn)
    })

    it('validate() accumulates form-level validators', () => {
      const v1 = required()
      const v2 = required('also required')
      const form = Form.make().validate(v1).validate(v2)
      assert.deepEqual(form.getFormValidators(), [v1, v2])
    })

    it('handlers are not serialized in toMeta', () => {
      const meta = Form.make()
        .save(async () => ({}))
        .mutateData(d => d)
        .redirectAfterSave(() => '/x')
        .toMeta()
      assert.equal('save' in meta, false)
      assert.equal('mutateData' in meta, false)
      assert.equal('redirectAfterSave' in meta, false)
    })

    it('mode-specific lifecycle setters round-trip via getters', () => {
      const beforeCreate = async () => {}
      const beforeUpdate = async () => {}
      const afterCreate  = async () => {}
      const afterUpdate  = async () => {}
      const handleCreate = async () => ({ id: 1 })
      const handleUpdate = async () => ({ id: 2 })
      const mutateBeforeCreate = (d: Record<string, unknown>) => d
      const mutateBeforeUpdate = (d: Record<string, unknown>) => d

      const form = Form.make()
        .beforeCreate(beforeCreate).beforeUpdate(beforeUpdate)
        .afterCreate(afterCreate).afterUpdate(afterUpdate)
        .handleCreate(handleCreate).handleUpdate(handleUpdate)
        .mutateDataBeforeCreate(mutateBeforeCreate)
        .mutateDataBeforeUpdate(mutateBeforeUpdate)

      assert.equal(form.getBeforeCreate(), beforeCreate)
      assert.equal(form.getBeforeUpdate(), beforeUpdate)
      assert.equal(form.getAfterCreate(), afterCreate)
      assert.equal(form.getAfterUpdate(), afterUpdate)
      assert.equal(form.getHandleCreate(), handleCreate)
      assert.equal(form.getHandleUpdate(), handleUpdate)
      assert.equal(form.getMutateDataBeforeCreate(), mutateBeforeCreate)
      assert.equal(form.getMutateDataBeforeUpdate(), mutateBeforeUpdate)
    })

    it('fill-side mutators round-trip via getters', () => {
      const before = (v: Record<string, unknown>) => v
      const after  = (v: Record<string, unknown>) => v
      const form = Form.make()
        .mutateFormDataBeforeFill(before)
        .mutateFormDataAfterFill(after)
      assert.equal(form.getMutateFormDataBeforeFill(), before)
      assert.equal(form.getMutateFormDataAfterFill(), after)
    })

    it('savedNotification accepts string / fn / null and getter passes through', () => {
      const a = Form.make().savedNotification('Saved')
      assert.equal(a.getSavedNotification(), 'Saved')

      const fn = () => 'Saved'
      const b = Form.make().savedNotification(fn)
      assert.equal(b.getSavedNotification(), fn)

      const c = Form.make().savedNotification(null)
      assert.equal(c.getSavedNotification(), null)
    })

    it('createdNotification stores separately from savedNotification', () => {
      const form = Form.make()
        .savedNotification('Saved')
        .createdNotification('Created')
      assert.equal(form.getSavedNotification(), 'Saved')
      assert.equal(form.getCreatedNotification(), 'Created')
    })

    it('disableSavedNotification flips the flag', () => {
      const form = Form.make().disableSavedNotification()
      assert.equal(form.isSavedNotificationDisabled(), true)
    })

    it('new lifecycle handlers are not serialized in toMeta', () => {
      const meta = Form.make()
        .beforeCreate(async () => {})
        .afterUpdate(async () => {})
        .handleCreate(async () => ({}))
        .mutateFormDataBeforeFill(v => v)
        .savedNotification('Saved')
        .createdNotification('Created')
        .toMeta()
      assert.equal('beforeCreate' in meta, false)
      assert.equal('afterUpdate' in meta, false)
      assert.equal('handleCreate' in meta, false)
      assert.equal('mutateFormDataBeforeFill' in meta, false)
      assert.equal('savedNotification' in meta, false)
      assert.equal('createdNotification' in meta, false)
    })
  })
})
