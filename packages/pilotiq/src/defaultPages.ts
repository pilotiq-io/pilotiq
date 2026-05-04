import { Page } from './Page.js'
import {
  Form,
  type SavedNotificationHandler,
  type LifecycleHandler,
  type AfterSaveHandler,
  type SaveHandler,
  type RedirectHandler,
  type MutateDataHandler,
  type FillMutator,
} from './elements/Form.js'
import { Table } from './elements/Table.js'
import { Filter } from './filters/Filter.js'
import { TrashedFilter } from './filters/TrashedFilter.js'
import { ListTabs } from './elements/ListTabs.js'
import type { ListTab } from './Tab.js'
import { Heading } from './schema/Heading.js'
import { Wizard, Step } from './schema/Wizard.js'
import { Action } from './actions/Action.js'
import type { Element } from './schema/Element.js'
import type { SchemaContext } from './schema/resolveSchema.js'
import type { ResourceClass, ResourcePages } from './Resource.js'
import type { PageMeta } from './Page.js'
import { modelSave, modelLoadRecord, modelTableRecords } from './orm/modelDefaults.js'
import { serializeIcon } from './icons/types.js'

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
    form.loadRecord(M ? modelLoadRecord(R) : noLoadRecordHandler(R))
  }
}

/** Install model-backed records on a freshly-built table when the user hasn't supplied them. */
export function applyTableDefaults(R: ResourceClass, table: Table): void {
  // Plan #13 — auto-inject `TrashedFilter` for soft-delete resources
  // unless the user already added one. The filter drives `withTrashed /
  // onlyTrashed` on the model query via its built-in `query(fn)` handler;
  // matching against the class catches user-renamed instances too.
  if (R.softDeletes) {
    const hasTrashedFilter = (table.getChildren() ?? [])
      .some(c => c instanceof TrashedFilter)
    if (!hasTrashedFilter) {
      const existing = (table.getChildren() ?? []).filter(c => c instanceof Filter) as Filter[]
      table.filters([...existing, TrashedFilter.make()])
    }
  }

  if (table.getRecords()) return
  const M = R.model
  if (M) table.records(modelTableRecords(R, table))
}

// ─── Base classes for resource page roles ────────────────────

/**
 * Base class subclasses extend to bind a Page to a Resource. Each role
 * (`ListPage`, `CreatePage`, `EditPage`, `ViewPage`) provides the
 * boilerplate so a per-resource page file is typically a one-liner
 * override of `getResource()`.
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
    if (meta.icon !== undefined) return meta
    const R = this.getResource()
    return { ...meta, icon: serializeIcon(R.icon, R.name) }
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

  static override async schema(ctx?: SchemaContext): Promise<Element[]> {
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
    const headers = this.getHeaderActions(R, basePath).filter(a => !existing.has(a.name))
    const rows    = this.getRowActions(R, basePath).filter(a => !existing.has(a.name))
    if (headers.length > 0) table.headerActions(headers)
    if (rows.length    > 0) table.recordActions(rows)

    // Wrap the user's `getTabs()` array (if any) in a ListTabs container
    // and slot it between the heading and the Table. The page-data
    // pipeline activates the right tab and resolves badges before
    // serialization — the schema-build path here just sets the structure.
    const tabs = this.getTabs(R)
    const listTabs = tabs.length > 0
      ? ListTabs.make().tabs(tabs)
      : undefined

    // Plan #15 — `Resource.headerSchema(ctx) / footerSchema(ctx)` slot
    // dashboard widgets above and below the list table. Resolved with the
    // same `SchemaContext` so widgets see `mode: 'table'`, `basePath`, `user`.
    const [header, footer] = await Promise.all([
      Promise.resolve(R.headerSchema(ctx)),
      Promise.resolve(R.footerSchema(ctx)),
    ])

    const elements: Element[] = [...this.getHeader(R)]
    if (header.length > 0) elements.push(...header)
    if (listTabs) elements.push(listTabs)
    elements.push(table)
    if (footer.length > 0) elements.push(...footer)
    return elements
  }

  /** Override to customize the heading rendered above the table. */
  static getHeader(R: ResourceClass): Element[] {
    return [Heading.make(R.label).level(1)]
  }

  /**
   * Header actions rendered in the table's top bar. Returns `[]` by
   * default — Filament-style explicit. Override to add a Create button:
   *
   * @example
   * static override getHeaderActions(R, basePath) {
   *   return [Action.create(R, basePath)]
   * }
   *
   * Or call it explicitly inside `Resource.table()` via
   * `table.headerActions([Action.create(R, basePath)])`.
   */
  static getHeaderActions(_R: ResourceClass, _basePath: string): Action[] {
    return []
  }

  /**
   * Row actions rendered in a per-row Actions column. Returns `[]` by
   * default — Filament-style explicit. Override to add Edit/Delete:
   *
   * @example
   * static override getRowActions(R, basePath) {
   *   return [Action.edit(R, basePath), Action.delete(R, basePath)]
   * }
   *
   * Or call them explicitly inside `Resource.table()` via
   * `table.recordActions([Action.edit(R, basePath), Action.delete(R, basePath)])`.
   *
   * Per-row `:id` substitution still happens automatically — factories
   * use the `:id` template; the renderer fills it in for each row.
   */
  static getRowActions(_R: ResourceClass, _basePath: string): Action[] {
    return []
  }

  /**
   * List-page tabs rendered above the table — Filament-style query
   * shortcuts ("All / Drafts / Published / Archived"). Returns `[]` by
   * default. Each tab has a label + optional icon + optional count badge
   * + a `modifyQuery` predicate that narrows the table. Active tab is
   * carried through `?tab=name` in the URL.
   *
   * @example
   * static override getTabs() {
   *   return [
   *     ListTab.make('all').label('All'),
   *     ListTab.make('drafts')
   *       .label('Drafts')
   *       .badge(() => prisma.article.count({ where: { status: 'draft' } }))
   *       .modifyQuery(q => q.where('status', 'draft')),
   *   ]
   * }
   */
  static getTabs(_R?: ResourceClass): ListTab[] {
    return []
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

/**
 * Install lifecycle overrides defined as static methods on a form-bearing
 * page subclass onto the freshly-built `Form`. Called by `CreatePage` and
 * `EditPage` after `R.form(...)` runs so user `Resource.form()` config
 * stays the canonical seam, with page subclasses layering on top.
 *
 * Mode-specific hooks (`beforeCreate` etc.) only fire on the matching mode.
 * Generic ones (`mutateData`, `beforeSave`, `afterSave`) fire on both. The
 * page methods get `.bind(PageClass)` so `this` inside the override resolves
 * to the page class — useful when an override delegates to another static.
 */
function installLifecycleHooks(
  PageClass: typeof CreatePage | typeof EditPage,
  form:      Form,
  mode:      'create' | 'edit',
): void {
  // Coerce to a record-typed view so we can probe optional statics through
  // a single property bag without writing a wide intersection.
  const P = PageClass as unknown as Record<string, unknown>
  const bind = <T extends (...args: never[]) => unknown>(fn: T): T => fn.bind(PageClass) as T

  if (typeof P['mutateFormDataBeforeFill'] === 'function') form.mutateFormDataBeforeFill(bind(P['mutateFormDataBeforeFill'] as never))
  if (typeof P['mutateFormDataAfterFill']  === 'function') form.mutateFormDataAfterFill (bind(P['mutateFormDataAfterFill']  as never))
  if (typeof P['mutateData']               === 'function') form.mutateData              (bind(P['mutateData']               as never))
  if (typeof P['mutateDataBeforeCreate']   === 'function') form.mutateDataBeforeCreate  (bind(P['mutateDataBeforeCreate']   as never))
  if (typeof P['mutateDataBeforeUpdate']   === 'function') form.mutateDataBeforeUpdate  (bind(P['mutateDataBeforeUpdate']   as never))
  if (typeof P['beforeSave']               === 'function') form.beforeSave              (bind(P['beforeSave']               as never))
  if (typeof P['afterSave']                === 'function') form.afterSave               (bind(P['afterSave']                as never))
  if (typeof P['beforeCreate']             === 'function') form.beforeCreate            (bind(P['beforeCreate']             as never))
  if (typeof P['afterCreate']              === 'function') form.afterCreate             (bind(P['afterCreate']              as never))
  if (typeof P['beforeUpdate']             === 'function') form.beforeUpdate            (bind(P['beforeUpdate']             as never))
  if (typeof P['afterUpdate']              === 'function') form.afterUpdate             (bind(P['afterUpdate']              as never))
  if (typeof P['handleCreate']             === 'function') form.handleCreate            (bind(P['handleCreate']             as never))
  if (typeof P['handleUpdate']             === 'function') form.handleUpdate            (bind(P['handleUpdate']             as never))
  if (typeof P['getRedirectUrl']           === 'function') form.redirectAfterSave       (bind(P['getRedirectUrl']           as never))

  // Notifications: page hook returns string | null. `null` disables. A
  // string installs the spec for the matching mode. The framework default
  // (resource-aware "Created"/"Saved") is layered in here unless the
  // user overrode it; passing `null` from the override suppresses it.
  const R = PageClass.getResource()
  const getCreatedTitle = P['getCreatedNotificationTitle'] as (() => string | null | undefined) | undefined
  const getSavedTitle   = P['getSavedNotificationTitle']   as (() => string | null | undefined) | undefined

  // Explicit `null` from the override means "suppress this toast" — keep
  // it; only fall through to the framework default when the override was
  // omitted or returned undefined.
  const explicitCreated = getCreatedTitle?.()
  const createdTitle = explicitCreated !== undefined
    ? explicitCreated
    : (mode === 'create' ? `${R.labelSingular} created` : undefined)
  if (createdTitle === null) form.createdNotification(null)
  else if (createdTitle !== undefined) form.createdNotification(createdTitle as SavedNotificationHandler)

  const explicitSaved = getSavedTitle?.()
  const savedTitle = explicitSaved !== undefined
    ? explicitSaved
    : (mode === 'edit' ? `${R.labelSingular} saved` : undefined)
  if (savedTitle === null) form.savedNotification(null)
  else if (savedTitle !== undefined) form.savedNotification(savedTitle as SavedNotificationHandler)
}

export class CreatePage extends ResourcePage {
  static override getMode() { return 'create' as const }

  static override getSlug(): string {
    return this.slug ?? `${this.getResource().getSlug()}/create`
  }

  static override getLabel(): string {
    return this.label ?? `Create ${this.getResource().labelSingular}`
  }

  static override schema(ctx?: SchemaContext): Element[] {
    const R = this.getResource()
    const basePath = (ctx?.['basePath'] as string | undefined) ?? ''
    const form = R.form(Form.make())
    applyFormDefaults(R, form, 'create')
    installLifecycleHooks(this, form, 'create')

    // Wizard mode (Filament's `HasWizard` equivalent). When `getSteps()`
    // returns one or more `Step` instances, the form's children are
    // replaced with a `Wizard` wrapping those steps. Lifecycle hooks
    // installed on the form still fire on final-step submit; per-step
    // validation flows through the existing `tagFormWizardUrls /
    // formWizardData` pipeline (Plan #8). Custom Wizard chrome
    // (`skippable`, `startOnStep`, `persist`) goes through `getWizard()`,
    // which receives the configured Wizard instance and may swap or
    // tweak it.
    const steps = this.getSteps(R)
    if (steps.length > 0) {
      const wizard = this.getWizard(Wizard.make().steps(steps), R)
      form.schema([wizard])
    }

    const header = buildHeader(this.getHeader(R), this.getFormActions(R, basePath), form.getFormId())
    return [...header, form]
  }

  /** Override to customize the heading rendered above the form. */
  static getHeader(R: ResourceClass): Element[] {
    return [Heading.make(`Create ${R.labelSingular}`).level(1)]
  }

  /**
   * Wizard mode opt-in. Override to return one or more steps and the
   * create flow becomes a multi-step wizard. Per-step validation runs
   * on Next click; `Form.save()` still fires on final-step submit.
   *
   * Default `[]` ships the regular single-page form. When non-empty,
   * the form's children (whatever `Resource.form()` configured) are
   * REPLACED with a Wizard wrapping these steps — author the wizard's
   * fields directly inside the steps, not via `Resource.form().schema()`.
   *
   * @example
   * static override getSteps(R) {
   *   return [
   *     Step.make('Account').schema([
   *       EmailField.make('email').required(),
   *       TextField.make('password').required(),
   *     ]),
   *     Step.make('Profile').schema([
   *       TextField.make('name').required(),
   *     ]),
   *   ]
   * }
   */
  static getSteps(_R: ResourceClass): Step[] { return [] }

  /**
   * Customize wizard chrome (skippable / startOnStep / persist) before
   * it lands in the form. The framework calls this with `Wizard.make().steps(getSteps(R))`
   * already configured; mutate or replace as needed and return.
   * Default returns the wizard untouched.
   *
   * @example
   * static override getWizard(wizard, _R) {
   *   return wizard.skippable().persist(false)
   * }
   */
  static getWizard(wizard: Wizard, _R: ResourceClass): Wizard {
    return wizard
  }

  /**
   * Action buttons rendered to the right of the page heading. Default:
   * primary "Create" submit + a secondary "Create & create another"
   * (outlined) submit. The "create another" button posts a sentinel
   * (`_continueCreate=1`) so the server routes the redirect back to
   * `/create` instead of the new record's `/edit` page. Override to
   * customize (drop the secondary button, add a Cancel link, etc.) or
   * return `[]` to suppress.
   *
   * `basePath` is the panel's mount path (e.g. `/admin`). Pass it
   * through to `Action.create / .href / etc.` factories that need a
   * full URL — same surface as `ListPage.getRowActions(R, basePath)`.
   */
  static getFormActions(R: ResourceClass, _basePath: string = ''): Action[] {
    return [
      Action.make('submit').label(`Create ${R.labelSingular}`).submit(),
      Action.make('createAnother')
        .label('Create & create another')
        .submit()
        .outlined()
        .formField('_continueCreate', '1'),
    ]
  }

  // ─── Optional lifecycle overrides ─────────────────────
  // Subclasses may override any of these. They install onto the form
  // during `schema()` via `installLifecycleHooks`. Signatures match the
  // matching `Form.*` setter parameter type.
  static mutateFormDataBeforeFill?: FillMutator
  static mutateFormDataAfterFill?:  FillMutator
  static mutateData?:               MutateDataHandler
  static mutateDataBeforeCreate?:   MutateDataHandler
  static beforeSave?:               LifecycleHandler
  static afterSave?:                AfterSaveHandler
  static beforeCreate?:             LifecycleHandler
  static afterCreate?:              AfterSaveHandler
  static handleCreate?:             SaveHandler
  static getRedirectUrl?:           RedirectHandler
  /**
   * Return the toast title for the post-create success notification.
   * Returning `null` suppresses the toast; `undefined` or omission falls
   * back to the framework default `"${R.labelSingular} created"`.
   */
  static getCreatedNotificationTitle?: () => string | null | undefined
}

export class EditPage extends ResourcePage {
  static override getMode() { return 'edit' as const }

  static override getSlug(): string {
    return this.slug ?? `${this.getResource().getSlug()}/edit`
  }

  static override getLabel(): string {
    return this.label ?? `Edit ${this.getResource().labelSingular}`
  }

  static override schema(ctx?: SchemaContext): Element[] {
    const R = this.getResource()
    const basePath = (ctx?.['basePath'] as string | undefined) ?? ''
    const recordId = ctx?.['recordId'] as string | undefined
    const form = R.form(Form.make())
    applyFormDefaults(R, form, 'edit')
    installLifecycleHooks(this, form, 'edit')
    const header = buildHeader(this.getHeader(R), this.getFormActions(R, basePath, recordId), form.getFormId())
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
   *
   * `basePath` and `recordId` let overrides drop in `Action.delete /
   * .view / .replicate(R, basePath)` factories alongside Save without
   * hardcoding the panel mount path. Filament-style "delete this
   * record" / "view" / "replicate" buttons cluster right of the heading
   * with the Save button — they're all rendered as a single right-
   * aligned action group.
   *
   * @example
   * static override getFormActions(R, basePath) {
   *   return [
   *     Action.delete(R, basePath),
   *     Action.view  (R, basePath),
   *     Action.make('submit').label('Save changes').submit(),
   *   ]
   * }
   */
  static getFormActions(_R: ResourceClass, _basePath: string = '', _recordId?: string): Action[] {
    return [
      Action.make('submit').label('Save changes').submit(),
    ]
  }

  // ─── Optional lifecycle overrides ─────────────────────
  // Same surface as CreatePage but for update mode.
  static mutateFormDataBeforeFill?: FillMutator
  static mutateFormDataAfterFill?:  FillMutator
  static mutateData?:               MutateDataHandler
  static mutateDataBeforeUpdate?:   MutateDataHandler
  static beforeSave?:               LifecycleHandler
  static afterSave?:                AfterSaveHandler
  static beforeUpdate?:             LifecycleHandler
  static afterUpdate?:              AfterSaveHandler
  static handleUpdate?:             SaveHandler
  static getRedirectUrl?:           RedirectHandler
  /**
   * Return the toast title for the post-save success notification.
   * Returning `null` suppresses the toast; `undefined` or omission falls
   * back to the framework default `"${R.labelSingular} saved"`.
   */
  static getSavedNotificationTitle?: () => string | null | undefined
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
   * Override to set the action row above the detail content. Returns
   * `[]` by default — Filament-style explicit. Wire Edit/Delete with
   * the `:id`-substituted factories:
   *
   * @example
   * static override getActions(R, recordId, basePath) {
   *   if (!recordId) return []
   *   return [Action.edit(R, basePath), Action.delete(R, basePath)]
   * }
   *
   * The renderer fills the `:id` placeholder using the page's
   * `recordId`, so the same factory works for row + view contexts.
   */
  static getActions(_R: ResourceClass, _recordId: string | undefined, _basePath: string): Element[] {
    return []
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
