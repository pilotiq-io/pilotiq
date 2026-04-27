import type { Element } from './schema/Element.js'
import type { Form } from './elements/Form.js'
import type { Table } from './elements/Table.js'
import type { Page } from './Page.js'
import type { ModelLike } from './orm/modelDefaults.js'
import { defaultPages } from './defaultPages.js'

/** Map of resource page roles to Page subclasses. */
export interface ResourcePages {
  index?:  typeof Page
  create?: typeof Page
  edit?:   typeof Page
  view?:   typeof Page
}

/** Placeholder until Phase 3+ relations work lands. */
export type RelationDef = unknown

/**
 * Abstract Resource base class. **All methods are static** — resources are
 * registered by class, not by instance. Routes look up the class and call
 * statics directly.
 *
 * Subclasses override `form()`, `table()`, `detail()`, and `pages()` to
 * shape the resource. Defaults make the most-common case (CRUD with a
 * form + a table) work with minimal boilerplate; 2.2 will fill in
 * auto-generated default Page classes.
 */
export abstract class Resource {
  /** Human-readable plural label, e.g. `'Articles'`. */
  static label: string = 'Resources'

  /** Singular label, e.g. `'Article'`. */
  static labelSingular: string = 'Resource'

  /** URL slug. Derived from `label` when unset. */
  static slug: string = ''

  /** Sidebar / nav icon name. */
  static icon: string = 'file'

  /**
   * Optional ORM model. When set, `defaultPages` auto-fills `Form.save`,
   * `Form.loadRecord`, `Table.records`, and `Resource.deleteRecord` so
   * the common CRUD case needs no manual wiring. Anything explicitly
   * configured on `form()` / `table()` still wins.
   *
   * Any object satisfying `ModelLike` works — `@rudderjs/orm` `Model`
   * subclasses do so structurally via their static methods.
   */
  static model?: ModelLike

  /**
   * Configure the form used by `create` and `edit` pages by default.
   * Receives a fresh `Form` instance; return the configured form.
   */
  static form(form: Form): Form { return form }

  /**
   * Configure the table used by the `index` page by default.
   * Receives a fresh `Table` instance; return the configured table.
   */
  static table(table: Table): Table { return table }

  /**
   * Schema for the read-only `view` page. Receives the loaded record.
   * Returns an array of Elements (typically Sections + display elements).
   */
  static detail(_record: unknown): Element[] { return [] }

  /**
   * Delete a record by id. Falls through to `model.delete(id)` when
   * `static model` is set; otherwise throws so the user knows to wire
   * something up. Override on the subclass for custom delete logic.
   * Wired up by the `POST {base}/{slug}/{id}/delete` route.
   */
  static async deleteRecord(id: string): Promise<void> {
    if (this.model) {
      await this.model.delete(id)
      return
    }
    throw new Error(
      `[Pilotiq] ${this.name}: no deleteRecord(id) implementation. Set Resource.model = … or override Resource.deleteRecord to wire up deletion.`,
    )
  }

  /**
   * User-overridable page map. Return any subset of `{ index, create, edit, view }`
   * to override the auto-generated defaults; missing keys fall through to
   * defaults via `resolvePages()`.
   */
  static pages(): ResourcePages { return {} }

  /**
   * Resolved page map: defaults from `defaultPages(this)` overlaid with whatever
   * `pages()` returns. This is what routing consumes (wired in 2.3).
   */
  static resolvePages(): ResourcePages {
    const defaults  = defaultPages(this as unknown as ResourceClass)
    const overrides = this.pages()
    return { ...defaults, ...overrides }
  }

  /** Phase 3+ relations metadata. */
  static relations(): RelationDef[] { return [] }

  /** URL slug, derived from `label` when not set explicitly. */
  static getSlug(): string {
    return this.slug || this.label.toLowerCase().replace(/\s+/g, '-')
  }
}

/** Constructor type for `Resource` subclasses. Used in panel registration. */
export type ResourceClass = typeof Resource
