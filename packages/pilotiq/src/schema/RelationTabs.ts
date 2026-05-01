import { Element } from './Element.js'
import { serializeIcon, type SerializedIcon, type IconValue } from '../icons/types.js'

/**
 * A single tab inside a `RelationTabs` strip — a labeled link to a
 * sibling URL (the parent's Edit page, or one of the relation manager
 * URLs). The renderer styles `active === true` differently and renders
 * `url` as a plain `<a href>` so cmd-click + new-tab still work.
 */
export interface RelationTabMeta {
  key:    string
  label:  string
  url:    string
  active: boolean
  icon?:  SerializedIcon
}

/**
 * Plan #11 — navigation strip that ties a parent record's Edit/View
 * page to its relation manager pages. Shown:
 *   - on a Resource Edit/View page when `R.relations().length > 0`
 *   - on every relation-list / -create / -edit page (so users can
 *     jump back to the parent record or sideways to a sibling
 *     manager without leaving the parent context)
 *
 * Not user-authored. The page-data builders construct it via
 * `RelationTabs.make(tabs)` after computing each tab's URL and
 * active-tab state.
 */
export class RelationTabs extends Element {
  private constructor(private readonly _tabs: RelationTabMeta[]) {
    super()
  }

  static make(tabs: RelationTabMeta[]): RelationTabs {
    return new RelationTabs(tabs)
  }

  getType(): string { return 'relation-tabs' }

  toMeta() {
    return {
      type: 'relation-tabs' as const,
      tabs: this._tabs,
    }
  }
}

/** Convenience: build a tab descriptor with the icon serialized in
 *  the same shape as Resource / Manager nav items. Owner-class name
 *  threads through so component-typed icons resolve via the Vite
 *  plugin's `_components.ts` manifest. */
export function relationTab(opts: {
  key:    string
  label:  string
  url:    string
  active: boolean
  icon?:  IconValue
  iconOwner?: string
}): RelationTabMeta {
  const tab: RelationTabMeta = {
    key:    opts.key,
    label:  opts.label,
    url:    opts.url,
    active: opts.active,
  }
  if (opts.icon !== undefined) {
    tab.icon = serializeIcon(opts.icon, opts.iconOwner ?? opts.key)
  }
  return tab
}
