/**
 * UserMenuItem — a single entry in the panel's top-right user dropdown
 * (the avatar/name menu rendered by `<UserMenu />`). Authored with
 * `Pilotiq.userMenuItems([UserMenuItem.make('profile').label('Profile')…])`.
 *
 * Distinct from a `NavItem` (sidebar/topbar nav) and from an `Action`
 * (form submits, modal handlers): a UserMenuItem is purely a labelled
 * link with optional visibility gating. Sign-out lives separately on
 * `Pilotiq.signOut(url)` because it needs a POST form, not an `<a href>`.
 *
 *   UserMenuItem.make('profile')
 *     .label('My profile')
 *     .icon('user')
 *     .url('/profile')
 *
 *   UserMenuItem.make('docs')
 *     .label(({ user }) => `Hi ${(user as any)?.name ?? 'there'}`)
 *     .url('https://docs.example.com')
 *     .openUrlInNewTab()
 *
 * Visibility rules mirror `Action.visible(...)` — boolean or
 * `(ctx) => boolean | Promise<boolean>` over `{ user }`. Throwing rules
 * fail closed (item hidden), matching the resource/global `canAccess`
 * posture.
 */
import type { ActionVisibilityContext, VisibilityRule } from './actions/Action.js'
import type { SerializedIcon } from './icons/types.js'

export type UserMenuItemColor = 'default' | 'destructive'

/** Static string OR a callback that builds the value off the resolved
 *  user. Callbacks receive `{ user }` (other ctx fields stay undefined
 *  for parity with `Action.visible`). Async return is supported. */
export type UserMenuItemValue<T> =
  | T
  | ((ctx: ActionVisibilityContext) => T | Promise<T>)

/** Wire shape consumed by `<UserMenu />`. Items resolve to this in
 *  `panelInfo()` (visibility gate already applied — only visible items
 *  reach the renderer). `icon` accepts the same `SerializedIcon` shape
 *  as nav items so the auto-injected profile entry can ride the
 *  Page's component icon through the build-time `_components.ts`
 *  manifest. User-authored entries via `UserMenuItem.icon('user')`
 *  ship as plain strings (registry keys). */
export interface UserMenuItemMeta {
  name:            string
  label:           string
  icon?:           SerializedIcon
  url?:            string
  color?:          UserMenuItemColor
  openInNewTab?:   boolean
}

export class UserMenuItem {
  readonly name: string

  protected _label?:          UserMenuItemValue<string>
  protected _icon?:           string
  protected _url?:            UserMenuItemValue<string>
  protected _color?:          UserMenuItemColor
  protected _sort?:           number
  protected _visible?:        VisibilityRule
  protected _openInNewTab     = false

  protected constructor(name: string) {
    this.name = name
  }

  static make(name: string): UserMenuItem {
    return new UserMenuItem(name)
  }

  // ─── Builder ──────────────────────────────────────────

  label(l: UserMenuItemValue<string>): this { this._label = l; return this }
  icon(i: string): this { this._icon = i; return this }
  url(u: UserMenuItemValue<string>): this { this._url = u; return this }
  color(c: UserMenuItemColor): this { this._color = c; return this }
  sort(n: number): this { this._sort = n; return this }
  /** Boolean or `({ user }) => bool | Promise<bool>`. Throws → hidden. */
  visible(rule: VisibilityRule): this { this._visible = rule; return this }
  /** Render the link with `target="_blank" rel="noopener noreferrer"`. */
  openUrlInNewTab(v = true): this { this._openInNewTab = v; return this }

  // ─── Getters ─────────────────────────────────────────

  getSort(): number | undefined { return this._sort }

  /** Resolve the item against the current context. Returns `null` when
   *  the visibility predicate denies (or throws). Otherwise returns the
   *  serialized meta. The default label is derived from `name` so a
   *  bare `UserMenuItem.make('profile')` still renders a sensible
   *  "Profile" entry. */
  async resolve(ctx: ActionVisibilityContext): Promise<UserMenuItemMeta | null> {
    let visible = true
    if (this._visible !== undefined) {
      try {
        visible = typeof this._visible === 'function'
          ? Boolean(await this._visible(ctx))
          : Boolean(this._visible)
      } catch {
        visible = false
      }
    }
    if (!visible) return null

    const label = await resolveValue(this._label, ctx) ?? defaultLabel(this.name)
    const url   = await resolveValue(this._url, ctx)

    const meta: UserMenuItemMeta = {
      name:  this.name,
      label,
    }
    if (this._icon  !== undefined) meta.icon  = this._icon
    if (url         !== undefined) meta.url   = url
    if (this._color !== undefined) meta.color = this._color
    if (this._openInNewTab)        meta.openInNewTab = true
    return meta
  }
}

async function resolveValue<T>(
  raw: UserMenuItemValue<T> | undefined,
  ctx: ActionVisibilityContext,
): Promise<T | undefined> {
  if (raw === undefined) return undefined
  if (typeof raw === 'function') {
    try {
      return await (raw as (ctx: ActionVisibilityContext) => T | Promise<T>)(ctx)
    } catch {
      return undefined
    }
  }
  return raw
}

function defaultLabel(name: string): string {
  if (!name) return ''
  // Camel/kebab/snake → "Title Case" (cheap; users override via `.label()`)
  const spaced = name
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
