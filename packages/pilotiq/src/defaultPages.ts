import { Page } from './Page.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Heading } from './schema/Heading.js'
import { Action } from './actions/Action.js'
import type { Element } from './schema/Element.js'
import type { SchemaContext } from './schema/resolveSchema.js'
import type { ResourceClass, ResourcePages } from './Resource.js'
import { modelSave, modelLoadRecord, modelTableRecords } from './orm/modelDefaults.js'

/** Sentinel save handler — throws unless the user overrides via a custom Page or Form.save(). */
function noSaveHandler(R: ResourceClass): () => never {
  return () => {
    throw new Error(
      `[Pilotiq] ${R.name}: no save handler. Set Resource.model = … to use the ORM defaults, or call Form.save(...) inside Resource.form().`,
    )
  }
}

/** Sentinel loadRecord handler — throws unless the user overrides via a custom Page or Form.loadRecord(). */
function noLoadRecordHandler(R: ResourceClass): () => never {
  return () => {
    throw new Error(
      `[Pilotiq] ${R.name}: no loadRecord handler. Set Resource.model = … to use the ORM defaults, or call Form.loadRecord(...) inside Resource.form().`,
    )
  }
}

/** Install model-backed save/loadRecord on a freshly-built form when the user hasn't supplied them. */
function applyFormDefaults(R: ResourceClass, form: Form, mode: 'create' | 'edit' | 'view'): void {
  const M = R.model
  if (!form.getSave()) {
    form.save(M ? modelSave(M) : noSaveHandler(R))
  }
  if (mode !== 'create' && !form.getLoadRecord()) {
    form.loadRecord(M ? modelLoadRecord(M) : noLoadRecordHandler(R))
  }
}

/** Install model-backed records on a freshly-built table when the user hasn't supplied them. */
function applyTableDefaults(R: ResourceClass, table: Table): void {
  if (table.getRecords()) return
  const M = R.model
  if (M) table.records(modelTableRecords(M, table))
}

export function defaultListPage(R: ResourceClass): typeof Page {
  return class extends Page {
    static override slug  = R.getSlug()
    static override label = R.label
    static override icon  = R.icon

    static override getResource(): ResourceClass { return R }
    static override getMode() { return 'list' as const }

    static override schema(): Element[] {
      const table = R.table(Table.make())
      applyTableDefaults(R, table)
      return [Heading.make(R.label).level(1), table]
    }
  }
}

export function defaultCreatePage(R: ResourceClass): typeof Page {
  return class extends Page {
    static override slug  = `${R.getSlug()}/create`
    static override label = `Create ${R.labelSingular}`
    static override icon  = R.icon

    static override getResource(): ResourceClass { return R }
    static override getMode() { return 'create' as const }

    static override schema(): Element[] {
      const form = R.form(Form.make())
      applyFormDefaults(R, form, 'create')
      return [Heading.make(`Create ${R.labelSingular}`).level(1), form]
    }
  }
}

export function defaultEditPage(R: ResourceClass): typeof Page {
  return class extends Page {
    static override slug  = `${R.getSlug()}/edit`
    static override label = `Edit ${R.labelSingular}`
    static override icon  = R.icon

    static override getResource(): ResourceClass { return R }
    static override getMode() { return 'edit' as const }

    static override schema(): Element[] {
      const form = R.form(Form.make())
      applyFormDefaults(R, form, 'edit')
      return [Heading.make(`Edit ${R.labelSingular}`).level(1), form]
    }
  }
}

export function defaultViewPage(R: ResourceClass): typeof Page {
  return class extends Page {
    static override slug  = `${R.getSlug()}/view`
    static override label = `View ${R.labelSingular}`
    static override icon  = R.icon

    static override getResource(): ResourceClass { return R }
    static override getMode() { return 'view' as const }

    static override async schema(ctx?: SchemaContext): Promise<Element[]> {
      const recordId = ctx?.['recordId'] as string | undefined
      const basePath = (ctx?.['basePath'] as string | undefined) ?? ''

      // Reuse the form's loadRecord — the same loader that powers edit mode,
      // including the model-backed default when `R.model` is set.
      let record: unknown = null
      if (recordId) {
        const form = R.form(Form.make())
        applyFormDefaults(R, form, 'view')
        const loader = form.getLoadRecord()
        if (loader) {
          try { record = await loader(recordId, { values: {} }) } catch { /* sentinel/missing */ }
        }
      }

      const elements: Element[] = [
        Heading.make(R.labelSingular).level(1),
      ]

      if (recordId) {
        const slug = R.getSlug()
        elements.push(
          Action.make('edit')
            .label('Edit')
            .href(`${basePath}/${slug}/${recordId}/edit`),
          Action.make('delete')
            .label('Delete')
            .destructive()
            .method('post')
            .action(`${basePath}/${slug}/${recordId}/delete`)
            .confirm(`Delete this ${R.labelSingular.toLowerCase()}?`),
        )
      }

      elements.push(...R.detail(record))
      return elements
    }
  }
}

/**
 * Auto-generate the index/create/edit/view page classes from a Resource.
 * Consumed by `Resource.resolvePages()` to fill in keys the user didn't
 * override. `view` is included whenever the resource has a meaningful
 * `detail()` — a no-op `detail()` still ships a default header with the
 * Edit / Delete actions, which is useful on its own.
 */
export function defaultPages(R: ResourceClass): Required<ResourcePages> {
  return {
    index:  defaultListPage(R),
    create: defaultCreatePage(R),
    edit:   defaultEditPage(R),
    view:   defaultViewPage(R),
  }
}
