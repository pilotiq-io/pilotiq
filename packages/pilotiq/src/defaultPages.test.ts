import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Resource } from './Resource.js'
import { Page } from './Page.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import { TextField } from './fields/TextField.js'
import { Heading } from './schema/Heading.js'
import { Action } from './actions/Action.js'
import {
  defaultPages,
  defaultListPage,
  defaultCreatePage,
  defaultEditPage,
  ListPage,
  CreatePage,
  EditPage,
  ViewPage,
} from './defaultPages.js'
import { Step, Wizard } from './schema/Wizard.js'
import { EmailField } from './fields/EmailField.js'
import type { ResourceClass } from './Resource.js'

class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override slug          = 'articles'
  static override icon          = 'file-text'

  static override form(form: Form): Form {
    return form.schema([TextField.make('title').required()])
  }
  static override table(table: Table): Table {
    return table.columns([Column.make('title').sortable()])
  }
}

describe('defaultPages factory', () => {
  it('produces { index, create, edit } page classes', () => {
    const pages = defaultPages(ArticleResource)
    assert.equal(typeof pages.index, 'function')
    assert.equal(typeof pages.create, 'function')
    assert.equal(typeof pages.edit, 'function')
  })

  it('list page has list mode + carries slug, label, icon, getResource', () => {
    const ListArticles = defaultListPage(ArticleResource)
    assert.equal(ListArticles.getMode(), 'list')
    assert.equal(ListArticles.getResource(), ArticleResource)
    assert.equal(ListArticles.getSlug(), 'articles')
    assert.equal(ListArticles.getLabel(), 'Articles')
    // Icon falls through from the resource via toMeta() — direct static
    // `icon` is undefined on the base class until a subclass sets it.
    assert.equal(ListArticles.toMeta().icon, 'file-text')
  })

  it('list page schema returns [Heading, Table] populated by R.table()', async () => {
    const ListArticles = defaultListPage(ArticleResource)
    const schema = await ListArticles.schema()
    assert.ok(Array.isArray(schema))
    const elements = schema as Array<{ getType(): string }>
    assert.equal(elements.length, 2)
    assert.equal(elements[0]!.getType(), 'heading')
    assert.equal(elements[1]!.getType(), 'table')
    const table = elements[1] as Table
    assert.equal(table.getColumns().length, 1)
    assert.equal(table.getColumns()[0]!.name, 'title')
  })

  it('create page has create mode + slug suffixed with /create', () => {
    const CreateArticle = defaultCreatePage(ArticleResource)
    assert.equal(CreateArticle.getMode(), 'create')
    assert.equal(CreateArticle.getResource(), ArticleResource)
    assert.equal(CreateArticle.getSlug(), 'articles/create')
    assert.equal(CreateArticle.getLabel(), 'Create Article')
  })

  it('create page schema returns [Heading-with-submit-actions, Form] with sentinel save', () => {
    const CreateArticle = defaultCreatePage(ArticleResource)
    const schema = CreateArticle.schema() as Array<{ getType(): string; getChildren(): unknown[] | undefined }>
    assert.equal(schema.length, 2)
    assert.equal(schema[0]!.getType(), 'heading')
    assert.equal(schema[1]!.getType(), 'form')
    const form = schema[1] as Form
    // Form children: just the user-configured field; submit lives in the heading.
    const formChildren = form.getChildren() ?? []
    assert.equal(formChildren.length, 1)
    assert.equal((formChildren[0] as { getType(): string }).getType(), 'field')

    // Heading carries the primary "Create" submit + the secondary
    // "Create & create another" submit as right-aligned actions.
    const headingChildren = (schema[0]!.getChildren() ?? []) as Array<{ getType(): string; name?: string }>
    assert.equal(headingChildren.length, 2)
    assert.equal(headingChildren[0]!.getType(), 'action')
    assert.equal(headingChildren[0]!.name, 'submit')
    assert.equal(headingChildren[1]!.getType(), 'action')
    assert.equal(headingChildren[1]!.name, 'createAnother')

    const save = form.getSave()
    assert.equal(typeof save, 'function')
    // sentinel throws — proves the user must override save
    assert.throws(() => (save as () => unknown)())
  })

  it('create page secondary action posts the _continueCreate sentinel', () => {
    const CreateArticle = defaultCreatePage(ArticleResource)
    const schema = CreateArticle.schema() as Array<{ getChildren(): unknown[] | undefined }>
    const headingChildren = (schema[0]!.getChildren() ?? []) as Array<{
      isSubmit?(): boolean
      getFormField?(): { name: string; value: string } | undefined
      isOutlined?(): boolean
      getLabel?(): string
    }>
    const createAnother = headingChildren[1]!
    assert.equal(createAnother.isSubmit?.(), true)
    assert.equal(createAnother.isOutlined?.(), true)
    assert.deepEqual(createAnother.getFormField?.(), { name: '_continueCreate', value: '1' })
    assert.equal(createAnother.getLabel?.(), 'Create & create another')
  })

  it('edit page has edit mode + sentinel save and loadRecord', () => {
    const EditArticle = defaultEditPage(ArticleResource)
    assert.equal(EditArticle.getMode(), 'edit')
    assert.equal(EditArticle.getResource(), ArticleResource)
    assert.equal(EditArticle.getSlug(), 'articles/edit')

    const schema = EditArticle.schema() as Array<{ getType(): string }>
    const form = schema[1] as Form
    assert.equal(typeof form.getSave(), 'function')
    assert.equal(typeof form.getLoadRecord(), 'function')
    assert.throws(() => (form.getSave() as () => unknown)())
    assert.throws(() => (form.getLoadRecord() as () => unknown)())
  })

  it('each schema() call produces a fresh Form instance (no shared state)', () => {
    const CreateArticle = defaultCreatePage(ArticleResource)
    const a = CreateArticle.schema() as Array<unknown>
    const b = CreateArticle.schema() as Array<unknown>
    assert.notEqual(a[1], b[1])
  })
})

describe('CreatePage wizard mode', () => {
  it('default getSteps() returns [] — single-page form unchanged', () => {
    const CreateArticle = defaultCreatePage(ArticleResource) as unknown as typeof CreatePage
    assert.deepEqual(CreateArticle.getSteps(ArticleResource), [])

    const schema = CreateArticle.schema() as Array<{ getType(): string; getChildren(): unknown[] | undefined }>
    const form = schema[1] as Form
    const formChildren = (form.getChildren() ?? []) as Array<{ getType(): string }>
    assert.equal(formChildren.length, 1)
    assert.equal(formChildren[0]!.getType(), 'field')
  })

  it('non-empty getSteps() replaces form children with a single Wizard wrapping the steps', () => {
    class CreateOnboard extends CreatePage {
      static override getResource(): ResourceClass { return ArticleResource }
      static override getSteps(): Step[] {
        return [
          Step.make('Account').schema([EmailField.make('email').required()]),
          Step.make('Profile').schema([TextField.make('name').required()]),
        ]
      }
    }

    const schema = CreateOnboard.schema() as Array<{ getType(): string; getChildren(): unknown[] | undefined }>
    const form = schema[1] as Form
    const formChildren = (form.getChildren() ?? []) as Array<{ getType(): string; getChildren(): unknown[] | undefined }>
    assert.equal(formChildren.length, 1)
    assert.equal(formChildren[0]!.getType(), 'wizard')

    const stepEls = (formChildren[0]!.getChildren() ?? []) as Array<{ getType(): string }>
    assert.equal(stepEls.length, 2)
    assert.equal(stepEls[0]!.getType(), 'step')
    assert.equal(stepEls[1]!.getType(), 'step')
  })

  it('wizard mode preserves form lifecycle hooks installed by Resource.form()', () => {
    class CreateOnboard extends CreatePage {
      static override getResource(): ResourceClass { return ArticleResource }
      static override getSteps(): Step[] {
        return [Step.make('Only').schema([TextField.make('title').required()])]
      }
    }
    const schema = CreateOnboard.schema() as Array<unknown>
    const form = schema[1] as Form
    // ArticleResource.form does not call save(); the sentinel from
    // applyFormDefaults still fires, proving lifecycle wiring survived
    // the children swap.
    assert.equal(typeof form.getSave(), 'function')
    assert.throws(() => (form.getSave() as () => unknown)())
  })

  it('getWizard() lets subclasses tweak chrome (skippable)', () => {
    class CreateOnboard extends CreatePage {
      static override getResource(): ResourceClass { return ArticleResource }
      static override getSteps(): Step[] {
        return [Step.make('A').schema([]), Step.make('B').schema([])]
      }
      static override getWizard(wizard: Wizard): Wizard {
        return wizard.skippable().startOnStep(1)
      }
    }
    const schema = CreateOnboard.schema() as Array<{ getChildren(): unknown[] | undefined }>
    const form = schema[1] as Form
    const formChildren = (form.getChildren() ?? []) as Array<{ getType(): string; toMeta(): Record<string, unknown> }>
    const wizardMeta = formChildren[0]!.toMeta()
    assert.equal(wizardMeta['skippable'],   true)
    assert.equal(wizardMeta['startOnStep'], 1)
  })
})

describe('Resource.resolvePages()', () => {
  it('returns auto-generated defaults when pages() is not overridden', () => {
    const resolved = ArticleResource.resolvePages()
    assert.equal(typeof resolved.index, 'function')
    assert.equal(typeof resolved.create, 'function')
    assert.equal(typeof resolved.edit, 'function')
    assert.equal(typeof resolved.view, 'function')

    assert.equal(resolved.index!.getMode(), 'list')
    assert.equal(resolved.create!.getMode(), 'create')
    assert.equal(resolved.edit!.getMode(), 'edit')
    assert.equal(resolved.view!.getMode(), 'view')
    assert.equal(resolved.index!.getResource(), ArticleResource)
  })

  it('user overrides merge over defaults per-key', () => {
    class CustomCreate extends Page {
      static override slug = 'custom-create'
      static override getMode() { return 'create' as const }
    }
    class WithOverride extends ArticleResource {
      static override pages() {
        return { create: CustomCreate }
      }
    }

    const resolved = WithOverride.resolvePages()
    assert.equal(resolved.create, CustomCreate)
    // index and edit fall through to defaults
    assert.notEqual(resolved.index, undefined)
    assert.notEqual(resolved.edit, undefined)
    assert.equal(resolved.index!.getMode(), 'list')
    assert.equal(resolved.edit!.getMode(), 'edit')
  })

  it('user can replace every page', () => {
    class L extends Page { static override getMode() { return 'list' as const } }
    class C extends Page { static override getMode() { return 'create' as const } }
    class E extends Page { static override getMode() { return 'edit' as const } }
    class V extends Page { static override getMode() { return 'view' as const } }

    class FullOverride extends ArticleResource {
      static override pages() {
        return { index: L, create: C, edit: E, view: V }
      }
    }

    const resolved = FullOverride.resolvePages()
    assert.equal(resolved.index, L)
    assert.equal(resolved.create, C)
    assert.equal(resolved.edit, E)
    assert.equal(resolved.view, V)
  })

  it('default pages derive slugs from R.getSlug()', () => {
    class Posts extends Resource {
      static override label = 'Blog Posts'
      static override labelSingular = 'Blog Post'
    }
    const resolved = Posts.resolvePages()
    assert.equal(resolved.index!.getSlug(), 'blog-posts')
    assert.equal(resolved.create!.getSlug(), 'blog-posts/create')
    assert.equal(resolved.edit!.getSlug(), 'blog-posts/edit')
  })
})

describe('ListPage / CreatePage / EditPage / ViewPage base classes', () => {
  it('subclassing ListPage with getResource() override produces the same shape as the factory', async () => {
    class MyList extends ListPage {
      static override getResource() { return ArticleResource }
    }
    assert.equal(MyList.getMode(), 'list')
    assert.equal(MyList.getResource(), ArticleResource)
    assert.equal(MyList.getSlug(), 'articles')
    assert.equal(MyList.getLabel(), 'Articles')
    assert.equal(MyList.toMeta().icon, 'file-text')

    const schema = await MyList.schema() as Array<{ getType(): string }>
    assert.equal(schema[0]!.getType(), 'heading')
    assert.equal(schema[1]!.getType(), 'table')
  })

  it('ListPage does NOT inject default Create / Edit / Delete actions (Filament-style explicit)', async () => {
    class MyList extends ListPage {
      static override getResource() { return ArticleResource }
    }
    const schema = await MyList.schema({ basePath: '/admin' }) as Array<{ getType(): string }>
    const table = schema[1] as Table
    const tableActions = (table.getChildren() ?? []).filter((c): c is Action => c instanceof Action)
    const names = tableActions.map(a => a.name)
    assert.equal(names.includes('create'), false, 'create header action should NOT auto-inject')
    assert.equal(names.includes('edit'),   false, 'edit row action should NOT auto-inject')
    assert.equal(names.includes('delete'), false, 'delete row action should NOT auto-inject')
  })

  it('Action factories build the same shapes as the old auto-inject', () => {
    const basePath = '/admin'
    const create = Action.create(ArticleResource, basePath)
    const edit   = Action.edit(ArticleResource, basePath)
    const del    = Action.delete(ArticleResource, basePath)
    const view   = Action.view(ArticleResource, basePath)

    assert.equal(create.name, 'create')
    assert.equal(create.getHref(), '/admin/articles/create')

    assert.equal(edit.name, 'edit')
    assert.equal(edit.getHref(), '/admin/articles/:id/edit')

    assert.equal(view.name, 'view')
    assert.equal(view.getHref(), '/admin/articles/:id')

    assert.equal(del.name, 'delete')
    assert.equal(del.getMethod(), 'post')
    assert.equal(del.getActionUrl(), '/admin/articles/:id/delete')
  })

  it('Action factories accept an optional recordId for view-page contexts', () => {
    const editForRow      = Action.edit(ArticleResource, '/admin')
    const editForViewPage = Action.edit(ArticleResource, '/admin', '42')
    assert.equal(editForRow.getHref(),      '/admin/articles/:id/edit')
    assert.equal(editForViewPage.getHref(), '/admin/articles/42/edit')
  })

  it('subclasses can override getHeaderActions / getRowActions to opt in', async () => {
    class WithActions extends ListPage {
      static override getResource() { return ArticleResource }
      static override getHeaderActions(R: typeof ArticleResource, basePath: string) {
        return [Action.create(R, basePath)]
      }
      static override getRowActions(R: typeof ArticleResource, basePath: string) {
        return [Action.edit(R, basePath), Action.delete(R, basePath)]
      }
    }
    const table = (await WithActions.schema({ basePath: '/admin' }))[1] as unknown as Table
    const tableActions = (table.getChildren() ?? []).filter((c): c is Action => c instanceof Action)
    const names = tableActions.map(a => a.name)
    assert.ok(names.includes('create'))
    assert.ok(names.includes('edit'))
    assert.ok(names.includes('delete'))

    const edit = tableActions.find(a => a.name === 'edit')!
    assert.equal(edit.getPlacement(), 'row', 'recordActions slot stamps row placement')
  })

  it('subclasses can override getBulkActions to opt in', async () => {
    class WithBulk extends ListPage {
      static override getResource() { return ArticleResource }
      static override getBulkActions(R: typeof ArticleResource, basePath: string) {
        return [Action.bulkDelete(R, basePath)]
      }
    }
    const table = (await WithBulk.schema({ basePath: '/admin' }))[1] as unknown as Table
    const tableActions = (table.getChildren() ?? []).filter((c): c is Action => c instanceof Action)
    const bulk = tableActions.find(a => a.name === 'bulkDelete')
    assert.ok(bulk, 'bulkDelete should be added by the hook')
    assert.equal(bulk!.getPlacement(), 'bulk', 'bulkActions slot stamps bulk placement')
  })

  it('getBulkActions defaults to [] — no bulk actions auto-inject', async () => {
    class Bare extends ListPage {
      static override getResource() { return ArticleResource }
    }
    const table = (await Bare.schema({ basePath: '/admin' }))[1] as unknown as Table
    const bulky = (table.getChildren() ?? [])
      .filter((c): c is Action => c instanceof Action)
      .filter(a => a.getPlacement() === 'bulk')
    assert.equal(bulky.length, 0)
  })

  it('Resource.table() bulk actions win over identically-named getBulkActions results', async () => {
    class CustomBulk extends ArticleResource {
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).bulkActions([
          Action.make('bulkDelete').label('Purge').handler(async () => ({})),
        ])
      }
    }
    class List extends ListPage {
      static override getResource() { return CustomBulk }
      static override getBulkActions(R: typeof CustomBulk, basePath: string) {
        return [Action.bulkDelete(R, basePath)]
      }
    }
    const table = (await List.schema({ basePath: '/admin' }))[1] as unknown as Table
    const bulks = (table.getChildren() ?? [])
      .filter((c): c is Action => c instanceof Action)
      .filter(a => a.name === 'bulkDelete')
    assert.equal(bulks.length, 1, 'only one bulkDelete action should exist')
    assert.equal(bulks[0]!.getLabel(), 'Purge', 'user label in table() should win')
  })

  it('Resource.table() actions win over identically-named page-level overrides', async () => {
    class CustomActions extends ArticleResource {
      static override table(t: Table): Table {
        return t.columns([Column.make('title')]).actions([
          Action.make('create').label('Compose').header().href('/custom/compose'),
        ])
      }
    }
    class List extends ListPage {
      static override getResource() { return CustomActions }
      static override getHeaderActions(R: typeof CustomActions, basePath: string) {
        return [Action.create(R, basePath)]
      }
    }
    const table = (await List.schema({ basePath: '/admin' }))[1] as unknown as Table
    const creates = (table.getChildren() ?? [])
      .filter((c): c is Action => c instanceof Action)
      .filter(a => a.name === 'create')
    assert.equal(creates.length, 1, 'only one create action should exist')
    assert.equal(creates[0]!.getHref(), '/custom/compose', 'user href in table() should win')
  })

  it('CreatePage / EditPage subclasses derive role-suffixed slugs', () => {
    class Create extends CreatePage { static override getResource() { return ArticleResource } }
    class Edit   extends EditPage   { static override getResource() { return ArticleResource } }
    assert.equal(Create.getSlug(), 'articles/create')
    assert.equal(Create.getLabel(), 'Create Article')
    assert.equal(Edit.getSlug(),   'articles/edit')
    assert.equal(Edit.getLabel(),  'Edit Article')
  })

  it('explicit static slug / label override the resource-derived defaults', () => {
    class Custom extends ListPage {
      static override getResource() { return ArticleResource }
      static override slug  = 'all-articles'
      static override label = 'All articles'
    }
    assert.equal(Custom.getSlug(), 'all-articles')
    assert.equal(Custom.getLabel(), 'All articles')
  })

  it('subclasses can override getHeader() to customize the header without re-implementing wiring', async () => {
    class Verbose extends ListPage {
      static override getResource() { return ArticleResource }
      static override getHeader(R: typeof ArticleResource) {
        return [Heading.make(`${R.label} (custom)`).level(1)]
      }
    }
    const schema = await Verbose.schema() as Array<{ getType(): string; toMeta(): { content?: string } }>
    assert.equal(schema[0]!.getType(), 'heading')
    assert.equal(schema[0]!.toMeta().content, 'Articles (custom)')
    // The table is still wired by the base class — override is additive.
    assert.equal(schema[1]!.getType(), 'table')
  })

  it('ViewPage.getActions() returns [] by default and is overridable to add Edit/Delete', async () => {
    class V extends ViewPage { static override getResource() { return ArticleResource } }
    const elements = await V.schema({ recordId: '7', basePath: '/admin' }) as Array<{
      getType(): string
      name?: string
    }>
    const actions = elements.filter(e => e.getType() === 'action')
    assert.equal(actions.length, 0, 'ViewPage adds no actions by default')

    class WithActions extends ViewPage {
      static override getResource() { return ArticleResource }
      static override getActions(R: typeof ArticleResource, recordId: string | undefined, basePath: string) {
        if (!recordId) return []
        return [Action.edit(R, basePath, recordId), Action.delete(R, basePath, recordId)]
      }
    }
    const filled = await WithActions.schema({ recordId: '7', basePath: '/admin' }) as Array<{
      getType(): string
      getChildren?(): Array<{ getType(): string; name?: string; getHref?(): string | undefined }> | undefined
    }>
    // Actions are attached to the page heading (right-aligned next to the
    // title), not spread as separate full-width top-level elements.
    assert.equal(filled.filter(e => e.getType() === 'action').length, 0, 'no top-level action elements')
    const heading = filled.find(e => e.getType() === 'heading')
    assert.ok(heading, 'view page has a heading')
    const filledActions = (heading!.getChildren?.() ?? []).filter(e => e.getType() === 'action')
    assert.equal(filledActions.length, 2)
    assert.equal(filledActions[0]!.name, 'edit')
    assert.equal(filledActions[1]!.name, 'delete')
    // recordId baked in (not :id) for the view-page context
    assert.equal(filledActions[0]!.getHref!(), '/admin/articles/7/edit')
  })

  it('CreatePage.getFormActions receives basePath so overrides can use Action.* factories', () => {
    let capturedBase: string | undefined
    class Create extends CreatePage {
      static override getResource() { return ArticleResource }
      static override getFormActions(_R: typeof ArticleResource, basePath: string = '') {
        capturedBase = basePath
        return [Action.make('submit').label('Create').submit()]
      }
    }
    Create.schema({ basePath: '/admin' })
    assert.equal(capturedBase, '/admin')
  })

  it('EditPage.getFormActions receives basePath + recordId so overrides can use Action.delete / .view factories', () => {
    let capturedBase:     string    | undefined
    let capturedRecordId: string    | undefined
    class Edit extends EditPage {
      static override getResource() { return ArticleResource }
      static override getFormActions(_R: typeof ArticleResource, basePath: string = '', recordId?: string) {
        capturedBase     = basePath
        capturedRecordId = recordId
        return [Action.make('submit').label('Save').submit()]
      }
    }
    Edit.schema({ basePath: '/admin', recordId: '42' })
    assert.equal(capturedBase, '/admin')
    assert.equal(capturedRecordId, '42')
  })

  it('EditPage.getFormActions can stamp Action.delete / .view alongside Save in the page header', () => {
    class Edit extends EditPage {
      static override getResource() { return ArticleResource }
      static override getFormActions(R: typeof ArticleResource, basePath: string = '', recordId?: string) {
        return [
          Action.delete(R, basePath, recordId),
          Action.view  (R, basePath, recordId),
          Action.make('submit').label('Save changes').submit(),
        ]
      }
    }
    const elements = Edit.schema({ basePath: '/admin', recordId: '42' }) as Array<{
      getType(): string
      toMeta(): Record<string, unknown>
    }>
    // Heading is first, with the three actions attached.
    const heading = elements[0]!
    assert.equal(heading.getType(), 'heading')
    const headingActions = (heading as unknown as { getChildren(): Action[] }).getChildren?.() ?? []
    const names = headingActions.map(a => a.name)
    assert.deepEqual(names, ['delete', 'view', 'submit'])
    // recordId is baked into the destructive / view URLs (no `:id` placeholder)
    const del = headingActions.find(a => a.name === 'delete')!
    assert.equal(del.getActionUrl(), '/admin/articles/42/delete')
    const view = headingActions.find(a => a.name === 'view')!
    assert.equal(view.getHref(), '/admin/articles/42')
  })

  it('getResource() throws a helpful error when not overridden', () => {
    class Anonymous extends ListPage {}
    assert.throws(
      () => Anonymous.getResource(),
      /must override static getResource/,
    )
  })

  it('Resource.pages() can wire custom subclasses end-to-end via resolvePages()', () => {
    class MyList   extends ListPage   { static override getResource() { return ArticleResource } }
    class MyCreate extends CreatePage { static override getResource() { return ArticleResource } }

    class WithCustom extends ArticleResource {
      static override pages() {
        return { index: MyList, create: MyCreate }
      }
    }
    const resolved = WithCustom.resolvePages()
    assert.equal(resolved.index, MyList)
    assert.equal(resolved.create, MyCreate)
    // edit + view fall through to defaults
    assert.equal(resolved.edit!.getMode(), 'edit')
    assert.equal(resolved.view!.getMode(), 'view')
  })
})

describe('CreatePage / EditPage lifecycle override surface', () => {
  function getForm(PageClass: { schema(): unknown }): Form {
    const schema = PageClass.schema() as unknown[]
    return schema[1] as Form
  }

  it('static beforeCreate / afterCreate are installed onto the form', () => {
    const beforeCreate = async () => {}
    const afterCreate  = async () => {}
    class Create extends CreatePage {
      static override getResource() { return ArticleResource }
      static override beforeCreate = beforeCreate
      static override afterCreate  = afterCreate
    }
    const form = getForm(Create)
    assert.equal(typeof form.getBeforeCreate(), 'function')
    assert.equal(typeof form.getAfterCreate(),  'function')
  })

  it('static handleCreate replaces the save handler in create mode', () => {
    const handleCreate = async () => ({ id: 99 })
    class Create extends CreatePage {
      static override getResource() { return ArticleResource }
      static override handleCreate = handleCreate
    }
    const form = getForm(Create)
    assert.equal(typeof form.getHandleCreate(), 'function')
  })

  it('EditPage.beforeUpdate / handleUpdate / afterUpdate land on the form', () => {
    const beforeUpdate = async () => {}
    const afterUpdate  = async () => {}
    const handleUpdate = async () => ({ id: 1 })
    class Edit extends EditPage {
      static override getResource() { return ArticleResource }
      static override beforeUpdate = beforeUpdate
      static override afterUpdate  = afterUpdate
      static override handleUpdate = handleUpdate
    }
    const form = getForm(Edit)
    assert.equal(typeof form.getBeforeUpdate(), 'function')
    assert.equal(typeof form.getAfterUpdate(),  'function')
    assert.equal(typeof form.getHandleUpdate(), 'function')
  })

  it('static mutateFormDataBeforeFill / AfterFill land on the form', () => {
    class Edit extends EditPage {
      static override getResource() { return ArticleResource }
      static override mutateFormDataBeforeFill = (v: Record<string, unknown>) => v
      static override mutateFormDataAfterFill  = (v: Record<string, unknown>) => v
    }
    const form = getForm(Edit)
    assert.equal(typeof form.getMutateFormDataBeforeFill(), 'function')
    assert.equal(typeof form.getMutateFormDataAfterFill(),  'function')
  })

  it('static getRedirectUrl wires through to redirectAfterSave', () => {
    class Create extends CreatePage {
      static override getResource() { return ArticleResource }
      static override getRedirectUrl = (record: unknown) => `/x/${(record as { id: number }).id}`
    }
    const form = getForm(Create)
    const fn = form.getRedirectAfterSave()!
    const url = fn({ id: 7 } as never, { values: {} } as never)
    assert.equal(url, '/x/7')
  })

  it('framework default toast titles are installed when nothing is configured', () => {
    class Create extends CreatePage { static override getResource() { return ArticleResource } }
    class Edit   extends EditPage   { static override getResource() { return ArticleResource } }
    assert.equal(getForm(Create).getCreatedNotification(), 'Article created')
    assert.equal(getForm(Edit).getSavedNotification(),     'Article saved')
  })

  it('getCreatedNotificationTitle override wins over the default', () => {
    class Create extends CreatePage {
      static override getResource() { return ArticleResource }
      static override getCreatedNotificationTitle() { return 'Custom create' }
    }
    assert.equal(getForm(Create).getCreatedNotification(), 'Custom create')
  })

  it('getSavedNotificationTitle returning null suppresses the saved toast', () => {
    class Edit extends EditPage {
      static override getResource() { return ArticleResource }
      static override getSavedNotificationTitle() { return null }
    }
    assert.equal(getForm(Edit).getSavedNotification(), null)
  })

  it('Resource.form() configuration coexists with page-level overrides', () => {
    const userMutate = (d: Record<string, unknown>) => d
    class WithFormConfig extends ArticleResource {
      static override form(form: Form): Form {
        return form
          .schema([TextField.make('title').required()])
          .mutateData(userMutate)
      }
    }
    class Create extends CreatePage {
      static override getResource() { return WithFormConfig }
      static override beforeCreate = async () => {}
    }
    const form = getForm(Create)
    // Resource.form() set mutateData; the page override added beforeCreate.
    assert.equal(form.getMutateData(), userMutate)
    assert.equal(typeof form.getBeforeCreate(), 'function')
  })
})
