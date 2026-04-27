import type { Element } from './schema/Element.js'
import type { Form } from './elements/Form.js'
import type { Page } from './Page.js'
import { defaultGlobalPages } from './defaultGlobalPages.js'

/**
 * Map of global page roles. Globals are singletons — they have no list or
 * create page; users typically only need `edit`. `view` is supported as an
 * opt-in for read-only audiences.
 */
export interface GlobalPages {
  edit?: typeof Page
  view?: typeof Page
}

/**
 * A `Global` is a singleton resource — one record, no list/create/delete.
 * Useful for site settings, brand config, on-call rotation, etc.
 *
 * Reuses the same Form-as-Element machinery as `Resource`: configure fields
 * + lifecycle (loadRecord / save / fillFromRecord) on the Form returned
 * from `form()`. The framework loads the singleton on GET, runs the
 * dispatch lifecycle on POST, and 303-redirects back to the same URL on
 * success.
 *
 * Routes:
 *   GET  ${base}/${slug}        → edit page (form pre-filled from loadRecord)
 *   POST ${base}/${slug}        → run save lifecycle
 *
 * The Form's `loadRecord` is called with an empty string id — singletons
 * ignore the id parameter. `save()` is responsible for upsert semantics.
 */
export abstract class Global {
  /** Human-readable label, e.g. `'Site Settings'`. Same value for plural/singular. */
  static label: string         = 'Global'

  /** Singular label (used in titles). Defaults to `label` when not set. */
  static labelSingular: string = 'Global'

  /** URL slug. Derived from `label` when unset. */
  static slug: string = ''

  /** Sidebar / nav icon name. */
  static icon: string = 'settings'

  /** Optional model identifier. Phase 3 ORM adapters use this. */
  static model?: string

  /**
   * Configure the form used by the edit page. Receives a fresh `Form`
   * instance; return the configured form. Wire `loadRecord` (no id needed)
   * and `save` (upsert) on the Form to make the singleton round-trip.
   */
  static form(form: Form): Form { return form }

  /** Schema for an optional read-only `view` page. */
  static detail(_record: unknown): Element[] { return [] }

  /**
   * User-overridable page map. Default is `{ edit }` (no view); override
   * to add a view page or replace the edit page.
   */
  static pages(): GlobalPages { return {} }

  /** Resolved page map: defaults overlaid with whatever `pages()` returns. */
  static resolvePages(): GlobalPages {
    const defaults  = defaultGlobalPages(this as unknown as GlobalClass)
    const overrides = this.pages()
    return { ...defaults, ...overrides }
  }

  /** URL slug, derived from `label` when not set explicitly. */
  static getSlug(): string {
    return this.slug || this.label.toLowerCase().replace(/\s+/g, '-')
  }
}

/** Constructor type for `Global` subclasses. Used in panel registration. */
export type GlobalClass = typeof Global
