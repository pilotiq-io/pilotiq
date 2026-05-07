import { Page } from './Page.js'
import { Form } from './elements/Form.js'
import { Heading } from './schema/Heading.js'
import { Action } from './actions/Action.js'
import { loadSingularRecord, modelSave } from './orm/modelDefaults.js'
import type { Element } from './schema/Element.js'
import type { SchemaContext } from './schema/resolveSchema.js'
import type { GlobalClass, GlobalPages } from './Global.js'

/** Sentinel save handler — throws unless the user overrides via Form.save(). */
function noSaveHandler(G: GlobalClass): () => never {
  return () => {
    throw new Error(
      `[Pilotiq] ${G.name}: no save handler. Configure Form.save() inside Global.form() — singleton globals upsert through this handler.`,
    )
  }
}

/**
 * Auto-wire `loadRecord` + `save` from the configured `static model` when
 * the user's `Global.form()` didn't already provide them. Hand-wired
 * handlers always win — this only fills empty slots so existing globals
 * (which wired both manually) keep their behavior unchanged.
 */
function installModelDefaults(form: Form, G: GlobalClass): void {
  if (!G.model) return
  if (!form.getLoadRecord()) {
    form.loadRecord(loadSingularRecord(G.model, G.findSingular ? { findSingular: G.findSingular } : undefined))
  }
  if (!form.getSave()) {
    form.save(modelSave(G.model))
  }
}

export function defaultGlobalEditPage(G: GlobalClass): typeof Page {
  return class extends Page {
    static override slug  = G.getSlug()
    static override label = G.labelSingular
    static override icon  = G.icon

    static override getMode() { return 'edit' as const }
    // Globals don't share the Resource back-reference shape; getResource()
    // stays at its Page default of `undefined`. The page's intent is
    // captured by `getMode() === 'edit'` plus the slug derivation.

    static override schema(): Element[] {
      const form = G.form(Form.make())
      installModelDefaults(form, G)
      if (!form.getSave()) form.save(noSaveHandler(G))
      // Page-header Save button targets the form below via HTML `form` attr.
      const heading = Heading.make(G.labelSingular).level(1).actions([
        Action.make('submit').label('Save changes').submit().form(form.getFormId()),
      ])
      return [heading, form]
    }
  }
}

export function defaultGlobalViewPage(G: GlobalClass): typeof Page {
  return class extends Page {
    static override slug  = `${G.getSlug()}/view`
    static override label = `View ${G.labelSingular}`
    static override icon  = G.icon

    static override getMode() { return 'view' as const }

    static override async schema(ctx?: SchemaContext): Promise<Element[]> {
      const basePath = (ctx?.['basePath'] as string | undefined) ?? ''
      const form = G.form(Form.make())
      installModelDefaults(form, G)
      const loader = form.getLoadRecord()
      let record: unknown = null
      if (loader) {
        try { record = await loader('', { values: {} }) } catch { /* sentinel/missing */ }
      }
      const elements: Element[] = [
        Heading.make(G.labelSingular).level(1),
        Action.make('edit').label('Edit').href(`${basePath}/${G.getSlug()}`),
      ]
      elements.push(...G.detail(record))
      return elements
    }
  }
}

/**
 * Default global page map: just `{ edit }`. View is opt-in via the user
 * overriding `Global.pages()` with a `view` key (or supplying their own
 * `defaultGlobalViewPage(G)`).
 */
export function defaultGlobalPages(G: GlobalClass): Required<Pick<GlobalPages, 'edit'>> {
  return {
    edit: defaultGlobalEditPage(G),
  }
}
