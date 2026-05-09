import { Element } from './Element.js'

/**
 * Escape-hatch schema element that hands rendering off to a user-supplied
 * React component registered via `registerSlotComponents()`. Distinct from
 * `ComponentEntry` (which is record-bound and label-shelled for infolists)
 * and from `View` (which is widget-shaped with `getData`/polling). Use for
 * plugin-contributed UI that needs to mount inline at any schema position
 * — toolbars, header chips, sidebar contributions, anywhere `Action` /
 * `ActionGroup` would otherwise live.
 *
 * Wire shape ships only the registered name + a serialisable `props` bag.
 * The `_components.ts` build-time manifest doesn't see runtime-registered
 * components (they live in plugin packages, not `cfg.resources / globals
 * / pages` statics), so the lookup happens at render via the runtime
 * registry — same model as `registerEntryComponents` and
 * `registerWidgetComponents`.
 *
 * @example
 *   // bootstrap/providers.ts
 *   registerSlotComponents({ BookmarkButton })
 *
 *   // A plugin / app contributes the chip into the resource-edit header:
 *   panel.renderHook(
 *     'panels::resource.pages.edit-record.header.actions.before',
 *     (ctx) => [
 *       SlotComponent.make('BookmarkButton').props({
 *         basePath: ctx.basePath,
 *         resourceSlug: ctx.resource?.getSlug(),
 *         recordId: ctx.recordId,
 *       }),
 *     ],
 *   )
 */
export class SlotComponent extends Element {
  protected _componentName: string
  protected _props?: Record<string, unknown>

  protected constructor(componentName: string) {
    super()
    this._componentName = componentName
  }

  static make(componentName: string): SlotComponent {
    return new SlotComponent(componentName)
  }

  /**
   * Static props passed verbatim to the registered component. Must be
   * JSON-serialisable — they ride through `viewProps` to the client.
   * Successive calls merge shallowly with the previous bag.
   */
  props(props: Record<string, unknown>): this {
    this._props = { ...(this._props ?? {}), ...props }
    return this
  }

  getComponentName(): string {
    return this._componentName
  }

  override getType(): string { return 'slotComponent' }

  override toMeta(): Record<string, unknown> {
    return {
      type: 'slotComponent' as const,
      component: this._componentName,
      ...(this._props ? { props: this._props } : {}),
    }
  }
}
