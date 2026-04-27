import { Page } from './Page.js'
import { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Heading } from './schema/Heading.js'
import { Action } from './actions/Action.js'
import type { Element } from './schema/Element.js'
import type { SchemaContext } from './schema/resolveSchema.js'
import type { ResourceClass, ResourcePages } from './Resource.js'
import type { PageMeta } from './Page.js'
import { modelSave, modelLoadRecord, modelTableRecords } from './orm/modelDefaults.js'

// ─── Sentinels for missing handlers ──────────────────────────

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
export function applyFormDefaults(R: ResourceClass, form: Form, mode: 'create' | 'edit' | 'view'): void {
  const M = R.model
  if (!form.getSave()) {
    form.save(M ? modelSave(M) : noSaveHandler(R))
  }
  if (mode !== 'create' && !form.getLoadRecord()) {
    form.loadRecord(M ? modelLoadRecord(M) : noLoadRecordHandler(R))
  }
}

/** Install model-backed records on a freshly-built table when the user hasn't supplied them. */
export function applyTableDefaults(R: ResourceClass, table: Table): void {
  if (table.getRecords()) return
  const M = R.model
  if (M) table.records(modelTableRecords(M, table))
}

// ─── Base classes for resource page roles ────────────────────

/**
 * Base class subclasses extend to bind a Page to a Resource. Filament
 * users will recognize this pattern — each role (`ListPage`, `CreatePage`,
 * `EditPage`, `ViewPage`) provides the boilerplate so a per-resource page
 * file is typically a one-liner override of `getResource()`.
 *
 * @example
 * class ListArticles extends ListPage {
 *   static override getResource() { return ArticleResource }
 * }
 *
 * Override hooks (`getHeader`, `getActions` on `ViewPage`) let you tweak
 * the rendered schema without re-implementing the wiring.
 */
abstract class ResourcePage extends Page {
  /** Subclasses must override to bind to a Resource. */
  static override getResource(): ResourceClass {
    throw new Error(`[Pilotiq] ${this.name}: must override static getResource() to bind to a Resource.`)
  }

  /** Falls back to the resource's icon when the page didn't set one. */
  static override toMeta(): PageMeta {
    const meta = super.toMeta()
    return meta.icon === undefined
      ? { ...meta, icon: this.getResource().icon }
      : meta
  }
}

export class ListPage extends ResourcePage {
  static override getMode() { return 'list' as const }

  static override getSlug(): string {
    return this.slug ?? this.getResource().getSlug()
  }

  static override getLabel(): string {
    return this.label ?? this.getResource().label
  }

  static override schema(ctx?: SchemaContext): Element[] {
    const R = this.getResource()
    const basePath = (ctx?.['basePath'] as string | undefined) ?? ''
    const table = R.table(Table.make())
    applyTableDefaults(R, table)

    // Layer in default header + row actions. Skip any whose name the user
    // already added in `Resource.table()` so customization wins.
    const existing = new Set(
      (table.getChildren() ?? [])
        .filter((c): c is Action => c instanceof Action)
        .map(a => a.name),
    )
    const defaults = [
      ...this.getHeaderActions(R, basePath),
      ...this.getRowActions(R, basePath),
    ].filter(a => !existing.has(a.name))
    if (defaults.length > 0) table.actions(defaults)

    return [
      ...this.getHeader(R),
      table,
    ]
  }

  /** Override to customize the heading rendered above the table. */
  static getHeader(R: ResourceClass): Element[] {
    return [Heading.make(R.label).level(1)]
  }

  /**
   * Header actions rendered in the table's top bar (e.g. "New Article").
   * Defaults to a single Create link pointing at the resource's create
   * page. Override and return `[]` to suppress.
   */
  static getHeaderActions(R: ResourceClass, basePath: string): Action[] {
    const slug = R.getSlug()
    return [
      Action.make('create')
        .label(`New ${R.labelSingular}`)
        .header()
        .href(`${basePath}/${slug}/create`),
    ]
  }

  /**
   * Row actions rendered in a per-row Actions column. Defaults: Edit
   * (link) + Delete (form-post). URLs use the `:id` template — the
   * renderer substitutes the row's id at render time. Override and
   * return `[]` to suppress.
   */
  static getRowActions(R: ResourceClass, basePath: string): Action[] {
    const slug = R.getSlug()
    return [
      Action.make('edit')
        .label('Edit')
        .row()
        .href(`${basePath}/${slug}/:id/edit`),
      Action.make('delete')
        .label('Delete')
        .destructive()
        .row()
        .method('post')
        .action(`${basePath}/${slug}/:id/delete`)
        .confirm(`Delete this ${R.labelSingular.toLowerCase()}?`),
    ]
  }
}

/**
 * Build the page heading and attach `formActions` as right-aligned
 * buttons. Each submit action is automatically retargeted at the form's
 * generated id so a header-mounted Save button submits the form below.
 *
 * If `getHeader()` returns multiple elements or non-Heading roots, the
 * actions get attached to the first Heading in the list; if none exists,
 * actions are dropped (custom headers carry their own action layout).
 */
function buildHeader(
  header:      Element[],
  formActions: Action[],
  formId:      string,
): Element[] {
  if (formActions.length === 0) return header
  const targeted = formActions.map(a => (a.isSubmit() ? a.form(formId) : a))
  for (const el of header) {
    if (el instanceof Heading) {
      el.actions(targeted)
      return header
    }
  }
  return header
}

export class CreatePage extends ResourcePage {
  static override getMode() { return 'create' as const }

  static override getSlug(): string {
    return this.slug ?? `${this.getResource().getSlug()}/create`
  }

  static override getLabel(): string {
    return this.label ?? `Create ${this.getResource().labelSingular}`
  }

  static override schema(): Element[] {
    const R = this.getResource()
    const form = R.form(Form.make())
    applyFormDefaults(R, form, 'create')
    const header = buildHeader(this.getHeader(R), this.getFormActions(R), form.getFormId())
    return [...header, form]
  }

  /** Override to customize the heading rendered above the form. */
  static getHeader(R: ResourceClass): Element[] {
    return [Heading.make(`Create ${R.labelSingular}`).level(1)]
  }

  /**
   * Action buttons rendered to the right of the page heading. Default:
   * a single submit button. The submit action's HTML `form` attribute is
   * auto-targeted at the form below so the button submits it. Override
   * to customize (e.g. add a Cancel link) or return `[]` to suppress.
   */
  static getFormActions(R: ResourceClass): Action[] {
    return [
      Action.make('submit').label(`Create ${R.labelSingular}`).submit(),
    ]
  }
}

export class EditPage extends ResourcePage {
  static override getMode() { return 'edit' as const }

  static override getSlug(): string {
    return this.slug ?? `${this.getResource().getSlug()}/edit`
  }

  static override getLabel(): string {
    return this.label ?? `Edit ${this.getResource().labelSingular}`
  }

  static override schema(): Element[] {
    const R = this.getResource()
    const form = R.form(Form.make())
    applyFormDefaults(R, form, 'edit')
    const header = buildHeader(this.getHeader(R), this.getFormActions(R), form.getFormId())
    return [...header, form]
  }

  /** Override to customize the heading rendered above the form. */
  static getHeader(R: ResourceClass): Element[] {
    return [Heading.make(`Edit ${R.labelSingular}`).level(1)]
  }

  /**
   * Action buttons rendered to the right of the page heading. Default:
   * a single submit button labeled "Save changes". The submit action is
   * auto-targeted at the form below via the HTML `form` attribute.
   */
  static getFormActions(_R: ResourceClass): Action[] {
    return [
      Action.make('submit').label('Save changes').submit(),
    ]
  }
}

export class ViewPage extends ResourcePage {
  static override getMode() { return 'view' as const }

  static override getSlug(): string {
    return this.slug ?? `${this.getResource().getSlug()}/view`
  }

  static override getLabel(): string {
    return this.label ?? `View ${this.getResource().labelSingular}`
  }

  static override async schema(ctx?: SchemaContext): Promise<Element[]> {
    const R = this.getResource()
    const recordId = ctx?.['recordId'] as string | undefined
    const basePath = (ctx?.['basePath'] as string | undefined) ?? ''

    // Reuse the form's loadRecord — same loader powers edit mode, including
    // the model-backed default when `R.model` is set.
    let record: unknown = null
    if (recordId) {
      const form = R.form(Form.make())
      applyFormDefaults(R, form, 'view')
      const loader = form.getLoadRecord()
      if (loader) {
        try { record = await loader(recordId, { values: {} }) } catch { /* sentinel/missing */ }
      }
    }

    return [
      ...this.getHeader(R, record),
      ...this.getActions(R, recordId, basePath),
      ...R.detail(record),
    ]
  }

  /** Override to customize the page header. Receives the loaded record. */
  static getHeader(R: ResourceClass, _record: unknown): Element[] {
    return [Heading.make(R.labelSingular).level(1)]
  }

  /**
   * Override to customize the action row above the detail content.
   * Default: Edit (link) + Delete (form-post) when a record is loaded.
   */
  static getActions(R: ResourceClass, recordId: string | undefined, basePath: string): Element[] {
    if (!recordId) return []
    const slug = R.getSlug()
    return [
      Action.make('edit')
        .label('Edit')
        .href(`${basePath}/${slug}/${recordId}/edit`),
      Action.make('delete')
        .label('Delete')
        .destructive()
        .method('post')
        .action(`${basePath}/${slug}/${recordId}/delete`)
        .confirm(`Delete this ${R.labelSingular.toLowerCase()}?`),
    ]
  }
}

// ─── Factory functions (anonymous subclasses bound to R) ─────

export function defaultListPage(R: ResourceClass): typeof Page {
  return class extends ListPage {
    static override getResource(): ResourceClass { return R }
  }
}

export function defaultCreatePage(R: ResourceClass): typeof Page {
  return class extends CreatePage {
    static override getResource(): ResourceClass { return R }
  }
}

export function defaultEditPage(R: ResourceClass): typeof Page {
  return class extends EditPage {
    static override getResource(): ResourceClass { return R }
  }
}

export function defaultViewPage(R: ResourceClass): typeof Page {
  return class extends ViewPage {
    static override getResource(): ResourceClass { return R }
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
