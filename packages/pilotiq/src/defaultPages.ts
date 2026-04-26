import { Page } from './Page.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Heading } from './schema/Heading.js'
import type { Element } from './schema/Element.js'
import type { ResourceClass, ResourcePages } from './Resource.js'

/** Sentinel save handler — throws unless the user overrides via a custom Page or Form.save(). */
function noSaveHandler(R: ResourceClass): () => never {
  return () => {
    throw new Error(
      `[Pilotiq] ${R.name}: no save handler. Override Resource.pages().{create,edit} with a Page that supplies Form.save(), or set Resource.form(form => form.save(...)) once 2.4 wires submit dispatch.`,
    )
  }
}

/** Sentinel loadRecord handler — throws unless the user overrides via a custom Page or Form.loadRecord(). */
function noLoadRecordHandler(R: ResourceClass): () => never {
  return () => {
    throw new Error(
      `[Pilotiq] ${R.name}: no loadRecord handler. Override Resource.pages().edit with a Page that supplies Form.loadRecord(), or set it on Resource.form() once 2.4 wires submit dispatch.`,
    )
  }
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
      const form = R.form(Form.make()).save(noSaveHandler(R))
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
        .save(noSaveHandler(R))
        .loadRecord(noLoadRecordHandler(R))
      return [Heading.make(`Edit ${R.labelSingular}`).level(1), form]
    }
  }
}

/**
 * Auto-generate the index/create/edit page classes from a Resource. Used by
 * `Resource.resolvePages()` to fill in keys the user didn't override.
 *
 * `view` is intentionally absent — it ships in 2.6 alongside `Resource.detail()`.
 */
export function defaultPages(R: ResourceClass): Required<Pick<ResourcePages, 'index' | 'create' | 'edit'>> {
  return {
    index:  defaultListPage(R),
    create: defaultCreatePage(R),
    edit:   defaultEditPage(R),
  }
}
