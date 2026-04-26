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
  })
})
