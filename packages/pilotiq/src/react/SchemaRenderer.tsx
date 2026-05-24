import React, { useEffect, useRef, useState } from 'react'
import type { ElementMeta } from '../schema/Element.js'
import { getFieldRenderer } from './registry.js'
import { getFieldLabelSlot } from './FieldLabelSlotRegistry.js'
import { FormStateProvider, useFormState, FormIdContext } from './FormStateContext.js'
import { CircleIcon } from 'lucide-react'
import { useNavigate } from './navigate.js'
import { useBreadcrumbsHoisted } from './breadcrumb-hoist.js'
import { useIconFor } from './icon-context.js'
import type { SerializedIcon } from '../icons/types.js'
import { useToast } from './Toaster.js'
import { pickEditableCell } from './cells/EditableCell.js'
import { WidgetDataProvider } from './WidgetDataContext.js'
import { StatsOverviewRenderer } from './widgets/StatsOverviewRenderer.js'
import { TableWidgetRenderer } from './widgets/TableWidgetRenderer.js'
import { ViewRenderer } from './widgets/ViewRenderer.js'
import { getSlotComponent } from '../slot-components/registry.js'
import { getWidgetRenderer } from './widgetRegistry.js'
import type { NotificationMeta } from '../notifications/Notification.js'
import {
  BADGE_COLOR_CLASSES,
  COLUMN_COLOR_CLASSES,
  COLUMN_WEIGHT_CLASSES,
} from './schemaRenderer/constants.js'
import {
  layoutClasses,
  renderChildren,
  resolveIcon,
  withTooltip,
} from './schemaRenderer/helpers.js'
import { renderSimpleElement } from './schemaRenderer/SimpleElements.js'
import { AlertRenderer } from './schemaRenderer/AlertRenderer.js'
import { SectionRenderer } from './schemaRenderer/SectionRenderer.js'
import { TabsRenderer } from './schemaRenderer/TabsRenderer.js'
import { WizardRenderer } from './schemaRenderer/WizardRenderer.js'
import { renderEntry } from './schemaRenderer/EntryRenderer.js'
import { applyColumnFormat } from './schemaRenderer/columnFormat.js'
import type { RenderActionOptions } from './schemaRenderer/action/buttons.js'
import {
  dispatchHandlerAction as actionDispatchHandlerAction,
} from './schemaRenderer/action/helpers.js'
import { renderAction, renderActionLike as renderActionLikeImpl } from './schemaRenderer/action/renderAction.js'
import { ActionGroupTrigger } from './schemaRenderer/action/ActionGroupTrigger.js'
import {
  renderField as renderFieldImpl,
} from './schemaRenderer/form/renderField.js'
import {
  FormRenderer as FormRendererImpl,
  renderFormChild as renderFormChildImpl,
} from './schemaRenderer/form/FormRenderer.js'
import { TableRenderer as TableRendererImpl } from './schemaRenderer/table/TableRenderer.js'
import type { TableBodyDeps } from './schemaRenderer/table/TableRendererBody.js'

/**
 * Re-export `dispatchHandlerAction` from the action helpers so existing
 * consumers (e.g. `RepeaterInput.tsx`) keep working through this barrel.
 * Phase 4 may shift these imports onto the action subpath directly.
 */
export const dispatchHandlerAction = actionDispatchHandlerAction

/**
 * Render a flat list of resolved field-meta as standalone form inputs,
 * outside any pilotiq Form wrapper. Useful for embedding the schema
 * input layer in custom surfaces (e.g. the rich-text custom-block side
 * panel) where the consumer drives reads/writes directly on a host
 * `<form>` via DOM event delegation.
 *
 * Behavior:
 *   - Each field renders through the same `renderField` switch the
 *     SchemaRenderer uses for in-form fields, so chrome (label, helper
 *     text, prefix/suffix) and field-type coverage stay in lockstep.
 *   - `values`, when supplied, overrides each field's `defaultValue`
 *     so the consumer can prefill from external state.
 *   - Inputs are uncontrolled (`defaultValue`-based) — outside a
 *     `FormStateProvider`, `useFieldState` falls back automatically.
 *     The host captures changes via container-level event delegation.
 *
 * Not for: container layouts (Card / Tabs / Section / Wizard), Action
 * triggers, or anything beyond a flat field list. Use SchemaRenderer
 * for full pages.
 */
export interface FormFieldsProps {
  elements:  ElementMeta[]
  values?:   Record<string, unknown>
}

export function FormFields({ elements, values }: FormFieldsProps): React.ReactElement {
  return (
    <>
      {elements.map((el, i) => {
        if (el['type'] !== 'field') return null
        const name = String(el['name'] ?? '')
        const merged = values && name in values
          ? { ...el, defaultValue: values[name] } as ElementMeta
          : el
        return renderField(merged, i)
      })}
    </>
  )
}





/** Thin wrapper that binds the renderer-injected deps so call sites
 *  inside this file can keep the original three-arg signature. The
 *  action layer (Phase 3) lives behind `renderActionLikeImpl`; it needs
 *  `renderElement` + `renderFormChild` for nested schemas + modal-form
 *  bodies. Both are function declarations so hoisting handles the
 *  forward reference cleanly. */
function renderActionLike(
  el:    ElementMeta,
  index: number,
  opts:  RenderActionOptions = {},
): React.ReactNode {
  return renderActionLikeImpl(el, index, opts, { renderElement, renderFormChild })
}

/** Thin wrapper around `renderFieldImpl` that pre-binds `renderElement`.
 *  Lets `FormFields`, `renderFormChild`, and the renderElement switch
 *  call the form-layer field renderer with the original two-arg signature. */
function renderField(el: ElementMeta, index: number): React.ReactNode {
  return renderFieldImpl(el, index, renderElement)
}

/** Re-export the form-layer `renderFormChild` with `renderElement`
 *  pre-bound, so external consumers (e.g. `SelectFieldInput.tsx`) keep
 *  importing it from `SchemaRenderer.js` with the same four-arg signature.
 *  Internal callers (action layer dialogs, ActionGroupTrigger) get the
 *  same closure through prop injection. */
export function renderFormChild(
  child:  ElementMeta,
  index:  number,
  values: Record<string, unknown>,
  errors: Record<string, string[]>,
): React.ReactNode {
  return renderFormChildImpl(child, index, values, errors, renderElement)
}

/** Local wrapper around the form-layer `FormRenderer` that pre-binds
 *  `renderElement`. Kept thin so the switch case below stays a one-liner. */
function FormRenderer({ el }: { el: ElementMeta }) {
  return <FormRendererImpl el={el} renderElement={renderElement} />
}

/** Pre-bind the three injected deps that `TableRendererBody` needs:
 *  - `renderElement` for column cells holding Element-typed children
 *  - `renderActionLike` for row + bulk action dispatch
 *  - `renderFormChild` for the inline-edit modal's form schema body */
const tableBodyDeps: TableBodyDeps = {
  get renderElement()    { return renderElement },
  get renderActionLike() { return renderActionLike },
  get renderFormChild()  { return renderFormChild },
}

/** Local wrapper around the table-layer `TableRenderer` that injects the
 *  three renderer deps. The body lives behind a separate import so the
 *  module cycle stays clean. */
function TableRenderer({ el }: { el: ElementMeta }) {
  return <TableRendererImpl el={el} deps={tableBodyDeps} />
}

function renderElement(el: ElementMeta, index: number): React.ReactNode {
  // Stateless leaves + layout primitives — text/image/icon/markdown/html/
  // heading/emptyState/divider/unorderedList/card/grid/group/split/fieldset.
  // Returns undefined for unhandled types so the switch below picks them up.
  const simple = renderSimpleElement(el, index, { renderElement, renderActionLike })
  if (simple !== undefined) return simple

  switch (el.type) {
    case 'alert': {
      const footer = (el.children ?? []).filter(c => c.type === 'action' || c.type === 'actionGroup' || c.type === 'slotComponent')
      return (
        <AlertRenderer
          key={index}
          alertType={String(el['alertType'] ?? 'info')}
          content={String(el['content'] ?? '')}
          {...(el['title']             !== undefined ? { title:             String(el['title'])             } : {})}
          {...(el['dismissible']                     ? { dismissible:       Boolean(el['dismissible'])      } : {})}
          {...(el['persistDismissal']  !== undefined ? { persistDismissal:  String(el['persistDismissal'])  } : {})}
          {...(el['iconColor']         !== undefined ? { iconColor:         String(el['iconColor'])         } : {})}
          {...(el['actionsAlignment']  !== undefined ? { actionsAlignment:  String(el['actionsAlignment'])  } : {})}
          footer={footer.map((a, i) => renderActionLike(a, i))}
        />
      )
    }

    case 'section':
      return <SectionRenderer key={index} el={el} index={index} renderElement={renderElement} />

    case 'tabs':
      return <TabsRenderer key={index} el={el} index={index} renderElement={renderElement} />

    case 'tab':
      // Tabs are rendered by their parent `tabs` element; standalone Tab is a no-op.
      return null

    case 'listTabs':
      return <ListTabsRenderer key={index} el={el} />

    case 'relation-tabs':
      return <RelationTabsRenderer key={index} el={el} />

    case 'breadcrumbs':
      return <BreadcrumbsRenderer key={index} el={el} />

    case 'listTab':
      // List tabs are rendered by their parent `listTabs` strip; standalone is a no-op.
      return null

    case 'wizard':
      return (
        <WizardRenderer
          key={index}
          el={el}
          index={index}
          deps={{ renderElement }}
        />
      )

    case 'step':
      // Steps are rendered by their parent Wizard; standalone Step is a no-op.
      return null

    case 'field':
      return renderField(el, index)

    case 'entry':
      return renderEntry(el, index, renderElement)

    case 'action':
      return renderAction(el, index, {}, { renderElement, renderFormChild })

    case 'actionGroup':
      return (
        <ActionGroupTrigger
          key={index}
          el={el}
          renderFormChild={renderFormChild}
          renderElement={renderElement}
        />
      )

    case 'form': {
      // Key on formId so SPA navigation between pages with different
      // forms (list → edit, edit → edit-of-different-record, etc.)
      // forces a fresh React mount. Form fields are uncontrolled
      // (`defaultValue`), so without remount, prop updates wouldn't
      // propagate into the rendered <input>s — the form would render
      // with stale or empty values.
      const formId = String(el['formId'] ?? index)
      return <FormRenderer key={formId} el={el} />
    }

    case 'table':
      return <TableRenderer key={index} el={el} />

    case 'column':
      // Columns are rendered by their parent table; standalone column is a no-op.
      return null

    case 'stats':
      return <StatsOverviewRenderer key={index} meta={el} />

    case 'tableWidget':
      return <TableWidgetRenderer key={index} meta={el} />

    case 'view':
      return <ViewRenderer key={index} meta={el} />

    case 'slotComponent': {
      const componentName = String(el['component'] ?? '')
      if (!componentName) {
        return (
          <div
            key={index}
            className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            role="alert"
          >
            SlotComponent without a registered <code className="font-mono">component</code> name.
          </div>
        )
      }
      const Component = getSlotComponent(componentName)
      if (!Component) {
        return (
          <div
            key={index}
            className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            role="alert"
          >
            No slot component registered for <code className="font-mono">{componentName}</code>.
            Call <code className="font-mono">registerSlotComponents({'{ '}{componentName}{' }'})</code> at app boot.
          </div>
        )
      }
      const props = (el['props'] ?? {}) as Record<string, unknown>
      return <Component key={index} {...props} />
    }

    default: {
      // Plan #15 Phase C — server-data widget elements registered by
      // adapter packages (`@pilotiq/recharts` for `'chart'`, future
      // `@pilotiq/chartjs`, etc.) dispatch through the runtime widget
      // registry. The fallback error message points the consumer at the
      // install command — silent `null` here would let a missing
      // `registerChartRenderer()` slip through.
      if (el['serverData'] === true) {
        const widgetType = String(el.type ?? '')
        const Renderer = getWidgetRenderer(widgetType)
        if (Renderer) return <Renderer key={index} meta={el} />
        return (
          <div
            key={index}
            className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            role="alert"
          >
            No renderer registered for widget type <code className="font-mono">{widgetType}</code>.
            {widgetType === 'chart' && (
              <> Install <code className="font-mono">@pilotiq/recharts</code> and
              call <code className="font-mono">registerChartRenderer()</code> at app boot.</>
            )}
          </div>
        )
      }
      return null
    }
  }
}



/**
 * List-page tab strip — Filament-style query shortcuts above the table
 * ("All / Drafts / Published / Archived"). Each trigger is a real `<a>`
 * (right-click / cmd-click "open in new tab" works); plain left-click is
 * intercepted for SPA navigation. Active tab carries `data-active`.
 *
 * The server stamps `active` + per-tab `url` + resolved badge string on
 * each `listTab` meta entry — this component just renders.
 */
function ListTabsRenderer({ el }: { el: ElementMeta }) {
  const navigate = useNavigate()
  const tabs = (el.children ?? []).filter(c => c.type === 'listTab')
  if (tabs.length === 0) return null

  return (
    <div className="border-b border-border">
      <nav className="flex items-center gap-1 -mb-px overflow-x-auto" role="tablist">
        {tabs.map((t, i) => {
          const name   = String(t['name']  ?? '')
          const label  = String(t['label'] ?? name)
          const active = Boolean(t['active'])
          const url    = String(t['url']   ?? `?tab=${encodeURIComponent(name)}`)
          const iconKey  = t['icon'] ? String(t['icon']) : undefined
          const Icon     = iconKey ? (resolveIcon(iconKey) ?? CircleIcon) : undefined
          const badge    = t['badge'] !== undefined ? String(t['badge']) : undefined
          const badgeKey = t['badgeColor'] ? String(t['badgeColor']) : (active ? 'primary' : 'gray')
          const badgeCls = BADGE_COLOR_CLASSES[badgeKey] ?? BADGE_COLOR_CLASSES['gray']

          const triggerCls = [
            'inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap',
            active
              ? 'border-primary text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
          ].join(' ')

          const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (e.button !== 0) return
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            void navigate(url)
          }

          return (
            <a
              key={i}
              href={url}
              onClick={onClick}
              role="tab"
              aria-selected={active}
              data-active={active || undefined}
              className={triggerCls}
            >
              {Icon && <Icon className="size-4" aria-hidden="true" />}
              <span>{label}</span>
              {badge !== undefined && (
                <span className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeCls}`}>
                  {badge}
                </span>
              )}
            </a>
          )
        })}
      </nav>
    </div>
  )
}

interface RelationTabMetaShape {
  key:    string
  label:  string
  url:    string
  active: boolean
  icon?:  unknown
}

interface BreadcrumbItemShape {
  label: string
  url?:  string
}

/** Phase C — server-resolved breadcrumb chain rendered above any other
 *  top-of-page chrome. The trailing item carries no `url` and renders
 *  as plain text + `aria-current="page"`. SPA-navigates on plain
 *  left-click; modified clicks fall through. */
function BreadcrumbsRenderer({ el }: { el: ElementMeta }) {
  // Suppressed in the body when the active layout has hoisted the
  // breadcrumb into its header (sidebar layout). Hook runs first so its
  // order is stable regardless of the items read.
  const hoisted = useBreadcrumbsHoisted()
  const items = (el['items'] as BreadcrumbItemShape[] | undefined) ?? []
  if (hoisted) return null
  return <BreadcrumbsView items={items} />
}

/** Shared breadcrumb markup — used by the in-body `BreadcrumbsRenderer`
 *  and (hoisted) by the sidebar layout's sticky header. Returns null for
 *  a single-item trail since there's nothing to navigate up to. */
export function BreadcrumbsView({ items }: { items: BreadcrumbItemShape[] }) {
  const navigate = useNavigate()
  if (items.length < 2) return null

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          const linkable = !!item.url && !isLast

          const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (e.button !== 0) return
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            if (!item.url) return
            e.preventDefault()
            void navigate(item.url)
          }

          return (
            <li key={`${i}:${item.label}`} className="inline-flex items-center gap-1.5">
              {linkable
                ? (
                  <a
                    href={item.url}
                    onClick={onClick}
                    className="hover:text-foreground transition-colors"
                  >
                    {item.label}
                  </a>
                )
                : (
                  <span
                    aria-current={isLast ? 'page' : undefined}
                    className={isLast ? 'text-foreground font-medium' : undefined}
                  >
                    {item.label}
                  </span>
                )}
              {!isLast && (
                <span aria-hidden="true" className="text-muted-foreground/50">/</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Plan #11 — relation manager nav strip. Renders one anchor per tab;
 *  the active tab gets the same border-primary styling as ListTabs.
 *  SPA-navigates on plain left-click; cmd/ctrl/shift/middle-click fall
 *  through so users can open a manager in a new tab. */
function RelationTabsRenderer({ el }: { el: ElementMeta }) {
  const navigate = useNavigate()
  const tabs = (el['tabs'] as RelationTabMetaShape[] | undefined) ?? []
  if (tabs.length === 0) return null

  return (
    <div className="border-b border-border">
      <nav className="flex items-center gap-1 -mb-px overflow-x-auto" role="tablist">
        {tabs.map((t, i) => {
          const triggerCls = [
            'inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap',
            t.active
              ? 'border-primary text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
          ].join(' ')

          const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (e.button !== 0) return
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            void navigate(t.url)
          }

          return (
            <a
              key={t.key + ':' + i}
              href={t.url}
              onClick={onClick}
              role="tab"
              aria-selected={t.active}
              data-active={t.active || undefined}
              className={triggerCls}
            >
              <RelationTabIcon icon={t.icon} />
              <span>{t.label}</span>
            </a>
          )
        })}
      </nav>
    </div>
  )
}

function RelationTabIcon({ icon }: { icon: unknown }) {
  // SerializedIcon is `string | { class: string }`. Use useIconFor to
  // resolve component-typed icons through the Vite plugin's manifest.
  const Icon = useIconFor(icon as SerializedIcon | undefined)
  if (!Icon) return null
  return <Icon className="size-4 inline" aria-hidden="true" />
}

export interface SchemaRendererProps {
  /** Resolved schema elements (server-side `resolveSchema` output) that
   * the renderer walks recursively. */
  elements:   ElementMeta[]
  /**
   * Initial widget data — a record keyed by widget id whose values are
   * stamped onto the SSR pass by `tagWidgetUrls` + `resolveServerDataElements`.
   * Surfaces through `<WidgetDataProvider>` so per-widget components
   * can read their first-paint payload through `useInitialWidgetData`.
   * Optional — pages with no widgets ship `undefined` and the provider
   * is a no-op.
   */
  widgetData?: Record<string, unknown>
}

export function SchemaRenderer({ elements, widgetData }: SchemaRendererProps) {
  if (!elements || elements.length === 0) return null
  // exactOptionalPropertyTypes: only spread `data` when defined.
  const providerProps = widgetData !== undefined ? { data: widgetData } : {}
  return (
    <WidgetDataProvider {...providerProps}>
      <div className="flex flex-col gap-6">
        {elements.map((el, i) => renderElement(el, i))}
      </div>
    </WidgetDataProvider>
  )
}
