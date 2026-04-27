import React, { useState } from 'react'
import type { ElementMeta } from '../schema/Element.js'

const alertStyles: Record<string, string> = {
  info:    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  danger:  'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
}

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ' +
  'transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

// ─── Field rendering ────────────────────────────────────────

function renderField(el: ElementMeta, index: number): React.ReactNode {
  const fieldType   = String(el['fieldType'] ?? 'text')
  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const required    = Boolean(el['required'])
  const disabled    = Boolean(el['disabled'])
  const placeholder = el['placeholder'] ? String(el['placeholder']) : undefined
  const defaultValue = el['defaultValue']

  const labelEl = (
    <label htmlFor={name} className="text-sm font-medium leading-none">
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  )

  const common = {
    id: name,
    name,
    disabled,
    placeholder,
    required,
    className: inputClass,
    ...(defaultValue !== undefined && defaultValue !== null
      ? { defaultValue: String(defaultValue) }
      : {}),
  }

  let input: React.ReactNode
  switch (fieldType) {
    case 'textarea':
      input = (
        <textarea
          {...common}
          rows={Number(el['rows']) || 4}
          className={`${inputClass} h-auto`}
        />
      )
      break

    case 'select':
      input = (
        <select {...common}>
          <option value="">{placeholder ?? 'Select…'}</option>
          {((el['options'] as Array<{ value: string; label: string }>) ?? []).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )
      break

    case 'toggle':
      input = (
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" disabled={disabled} className="h-4 w-4 rounded border-input" />
          <span className="text-sm text-muted-foreground">Enabled</span>
        </label>
      )
      break

    case 'number':
      input = (
        <input
          {...common}
          type="number"
          {...(el['min']  !== undefined ? { min:  Number(el['min'])  } : {})}
          {...(el['max']  !== undefined ? { max:  Number(el['max'])  } : {})}
          {...(el['step'] !== undefined ? { step: Number(el['step']) } : {})}
        />
      )
      break

    case 'email':    input = <input {...common} type="email" />; break
    case 'date':     input = <input {...common} type="date"  />; break
    case 'slug':
    case 'text':
    default:
      input = (
        <input
          {...common}
          type="text"
          {...(el['maxLength'] !== undefined ? { maxLength: Number(el['maxLength']) } : {})}
        />
      )
  }

  return (
    <div key={index} className="flex flex-col gap-1.5">
      {labelEl}
      {input}
    </div>
  )
}

// ─── Action rendering ───────────────────────────────────────

/**
 * Build a hidden `<form>` with `ids[]` + arbitrary value fields and
 * submit it. Browsers handle the 303 redirect natively, so this is
 * a one-shot navigation rather than a fetch + manual `location.assign`.
 */
function submitHandlerAction(
  url:    string,
  ids:    string[],
  values: Record<string, string> = {},
): void {
  if (typeof document === 'undefined') return
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = url
  form.style.display = 'none'
  for (const id of ids) {
    const input = document.createElement('input')
    input.type  = 'hidden'
    input.name  = 'ids'
    input.value = id
    form.appendChild(input)
  }
  for (const [k, v] of Object.entries(values)) {
    const input = document.createElement('input')
    input.type  = 'hidden'
    input.name  = k
    input.value = v
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

interface RenderActionOptions {
  /** Ids to send when this action is handler-style. Used by row + bulk
   * placements to pass selected/current record id(s). */
  ids?: string[]
  /** Optional sizing override (e.g. row actions render smaller). */
  size?: 'sm' | 'md'
}

function renderAction(
  el: ElementMeta,
  index: number,
  opts: RenderActionOptions = {},
): React.ReactNode {
  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const destructive = Boolean(el['destructive'])
  const placement   = String(el['placement'] ?? 'inline')
  const href        = el['href']        as string | undefined
  const method      = el['method']      as 'post' | 'put' | 'patch' | 'delete' | undefined
  const actionUrl   = el['action']      as string | undefined
  const dispatchUrl = el['dispatchUrl'] as string | undefined
  const submit      = Boolean(el['submit'])
  const confirm     = el['confirm']     as { title?: string; message: string } | undefined

  const variant = destructive
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
    : 'bg-primary text-primary-foreground hover:bg-primary/90'

  const sizingClass = opts.size === 'sm' || placement === 'row'
    ? 'h-7 px-2 text-xs'
    : 'h-8 px-3 text-sm'

  const className = `inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition ${variant} ${sizingClass}`

  // Submit-style action — renders as <button type="submit">. Optionally
  // targets a specific form via the HTML `form="<id>"` attribute so the
  // button can submit a form it lives outside of (e.g. a page-header
  // Save button driving a form below).
  if (submit) {
    const formTarget = el['form'] as string | undefined
    const onClick = confirm
      ? (e: React.MouseEvent<HTMLButtonElement>) => {
          if (typeof window !== 'undefined' && !window.confirm(confirm.message)) {
            e.preventDefault()
          }
        }
      : undefined
    return (
      <button
        key={index}
        type="submit"
        form={formTarget}
        onClick={onClick}
        className={className}
        data-action-name={name}
      >
        {label}
      </button>
    )
  }

  // Substitute the `:id` placeholder with the current row id when this
  // action is rendered in a row context. Lets row-level link/form actions
  // ship a single template URL like `/admin/articles/:id/edit`.
  const rowId = opts.ids?.length === 1 ? opts.ids[0]! : undefined
  const resolveTemplate = (s: string | undefined): string | undefined =>
    s && rowId ? s.replace(':id', rowId) : s

  // Link-style action.
  if (href) {
    return (
      <a key={index} href={resolveTemplate(href)} className={className} data-action-name={name}>
        {label}
      </a>
    )
  }

  // Form-style action (POST/PUT/PATCH/DELETE) — server-rendered <form>.
  if (method) {
    const httpMethod = 'post' // hono accepts POST + _method spoof for non-POST
    const spoofed = method === 'put' || method === 'patch' || method === 'delete' ? method : undefined
    const handleSubmit = confirm
      ? (e: React.FormEvent<HTMLFormElement>) => {
          if (typeof window !== 'undefined' && !window.confirm(confirm.message)) {
            e.preventDefault()
          }
        }
      : undefined
    return (
      <form
        key={index}
        method={httpMethod}
        action={resolveTemplate(actionUrl)}
        className="inline-block"
        onSubmit={handleSubmit}
      >
        {spoofed && <input type="hidden" name="_method" value={spoofed} />}
        <button type="submit" className={className} data-action-name={name}>
          {label}
        </button>
      </form>
    )
  }

  // Handler-style action — POSTs to `dispatchUrl` with `ids[]` body.
  if (dispatchUrl) {
    const ids = opts.ids ?? []
    const onClick = () => {
      if (confirm && typeof window !== 'undefined' && !window.confirm(confirm.message)) return
      submitHandlerAction(dispatchUrl, ids)
    }
    return (
      <button
        key={index}
        type="button"
        onClick={onClick}
        className={className}
        data-action-name={name}
      >
        {label}
      </button>
    )
  }

  // No dispatch wired (no href / method / dispatchUrl). Render a disabled
  // placeholder so the user sees the button, but it does nothing.
  return (
    <button
      key={index}
      type="button"
      disabled
      className={className + ' opacity-50 cursor-not-allowed'}
      data-action-name={name}
    >
      {label}
    </button>
  )
}

// ─── Container helpers ──────────────────────────────────────

function renderChildren(children: ElementMeta[] | undefined, gap = 'gap-4'): React.ReactNode {
  if (!children || children.length === 0) return null
  return (
    <div className={`flex flex-col ${gap}`}>
      {children.map((child, i) => renderElement(child, i))}
    </div>
  )
}

// ─── Tabs (stateful — needs useState) ────────────────────────

function TabsRenderer({ el, index }: { el: ElementMeta; index: number }) {
  const tabs = (el.children ?? []).filter(c => c.type === 'tab')
  const [active, setActive] = useState(0)

  if (tabs.length === 0) return null

  return (
    <div key={index} className="flex flex-col gap-4">
      <div className="flex border-b border-border">
        {tabs.map((tab, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              i === active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {String(tab['label'] ?? '')}
            {tab['badge'] ? <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-muted">{String(tab['badge'])}</span> : null}
          </button>
        ))}
      </div>
      <div>{renderChildren(tabs[active]?.children)}</div>
    </div>
  )
}

// ─── Section (stateful when collapsible) ────────────────────

function SectionRenderer({ el, index }: { el: ElementMeta; index: number }) {
  const title       = el['title']       ? String(el['title']) : undefined
  const description = el['description'] ? String(el['description']) : undefined
  const columns     = Number(el['columns'] ?? 1)
  const collapsible = Boolean(el['collapsible'])
  const [collapsed, setCollapsed] = useState(Boolean(el['defaultCollapsed']))

  const gridClass = columns === 2 ? 'grid grid-cols-2 gap-4' : columns === 3 ? 'grid grid-cols-3 gap-4' : 'flex flex-col gap-4'

  return (
    <section key={index} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      {(title || description || collapsible) && (
        <header className="flex items-start justify-between gap-2">
          <div>
            {title && <h3 className="text-base font-semibold">{title}</h3>}
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {collapsible && (
            <button
              type="button"
              onClick={() => setCollapsed(c => !c)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {collapsed ? 'Expand' : 'Collapse'}
            </button>
          )}
        </header>
      )}
      {!collapsed && el.children && el.children.length > 0 && (
        <div className={gridClass}>
          {el.children.map((c, i) => renderElement(c, i))}
        </div>
      )}
    </section>
  )
}

// ─── Top-level dispatch ─────────────────────────────────────

function renderElement(el: ElementMeta, index: number): React.ReactNode {
  switch (el.type) {
    case 'text':
      return (
        <p key={index} className="text-sm text-muted-foreground">
          {String(el['content'] ?? '')}
        </p>
      )

    case 'heading': {
      const level = (el['level'] as number) ?? 1
      const content = String(el['content'] ?? '')
      const description = el['description'] ? String(el['description']) : undefined
      const headerActions = (el.children ?? []).filter(c => c.type === 'action')
      const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
      const sizes = { 1: 'text-2xl', 2: 'text-xl', 3: 'text-lg' } as const
      const titleBlock = (
        <div>
          <Tag className={`${sizes[level as 1 | 2 | 3]} font-bold tracking-tight`}>
            {content}
          </Tag>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      )
      if (headerActions.length === 0) {
        return <div key={index}>{titleBlock}</div>
      }
      return (
        <div key={index} className="flex items-start justify-between gap-4">
          {titleBlock}
          <div className="flex items-center gap-2 shrink-0">
            {headerActions.map((a, i) => renderAction(a, i))}
          </div>
        </div>
      )
    }

    case 'alert': {
      const alertType = String(el['alertType'] ?? 'info')
      const styles = alertStyles[alertType] ?? alertStyles['info']
      const title = el['title'] ? String(el['title']) : undefined
      return (
        <div key={index} className={`rounded-lg border p-4 ${styles}`}>
          {title && <p className="font-medium mb-1">{title}</p>}
          <p className="text-sm">{String(el['content'] ?? '')}</p>
        </div>
      )
    }

    case 'divider': {
      const label = el['label'] ? String(el['label']) : undefined
      return label
        ? <div key={index} className="relative py-2">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center"><span className="bg-background px-2 text-xs text-muted-foreground">{label}</span></div>
          </div>
        : <hr key={index} className="border-border" />
    }

    case 'card': {
      const title = el['title'] ? String(el['title']) : undefined
      const description = el['description'] ? String(el['description']) : undefined
      return (
        <div key={index} className="rounded-xl border bg-card p-6 shadow-sm">
          {title && <h3 className="font-semibold mb-1">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
          {renderChildren(el.children)}
        </div>
      )
    }

    case 'section':
      return <SectionRenderer key={index} el={el} index={index} />

    case 'tabs':
      return <TabsRenderer key={index} el={el} index={index} />

    case 'tab':
      // Tabs are rendered by their parent `tabs` element; standalone Tab is a no-op.
      return null

    case 'grid': {
      const columns = Math.max(1, Math.min(12, Number(el['columns'] ?? 2)))
      const gapPx   = el['gap'] !== undefined ? `${Number(el['gap'])}px` : undefined
      return (
        <div
          key={index}
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            ...(gapPx ? { gap: gapPx } : {}),
          }}
        >
          {(el.children ?? []).map((c, i) => renderElement(c, i))}
        </div>
      )
    }

    case 'field':
      return renderField(el, index)

    case 'action':
      return renderAction(el, index)

    case 'form':
      return <FormRenderer key={index} el={el} />

    case 'table':
      return <TableRenderer key={index} el={el} />

    case 'column':
      // Columns are rendered by their parent table; standalone column is a no-op.
      return null

    default:
      return null
  }
}

// ─── Form ───────────────────────────────────────────────────

function FormRenderer({ el }: { el: ElementMeta }) {
  const formId = String(el['formId'] ?? '')
  const method = String(el['method'] ?? 'post').toLowerCase()
  const action = el['action'] ? String(el['action']) : undefined
  const values = (el['values'] as Record<string, unknown> | undefined) ?? {}
  const errors = (el['errors'] as Record<string, string[]> | undefined) ?? {}

  // Methods other than GET/POST are spoofed via _method, mirroring Laravel.
  const httpMethod = method === 'get' ? 'get' : 'post'
  const spoofedMethod = method !== 'get' && method !== 'post' ? method : undefined

  const formErrors = errors['_form'] ?? []
  const hasFieldErrors = Object.keys(errors).some(k => k !== '_form')

  return (
    <form
      id={formId || undefined}
      data-form-id={formId || undefined}
      method={httpMethod}
      action={action}
      className="flex flex-col gap-6"
    >
      {formId && <input type="hidden" name="_formId" value={formId} />}
      {spoofedMethod && <input type="hidden" name="_method" value={spoofedMethod} />}
      {(formErrors.length > 0 || hasFieldErrors) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 text-destructive p-3 text-sm">
          {formErrors.length > 0 ? (
            <ul className="list-disc pl-4">
              {formErrors.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          ) : (
            'Please correct the errors below.'
          )}
        </div>
      )}
      {(el.children ?? []).map((child, i) => renderFormChild(child, i, values, errors))}
    </form>
  )
}

function renderFormChild(
  child: ElementMeta,
  index: number,
  values: Record<string, unknown>,
  errors: Record<string, string[]>,
): React.ReactNode {
  if (child.type === 'field') {
    const name      = String(child['name'] ?? '')
    const fieldErrors = errors[name] ?? []
    const value     = values[name]
    return (
      <div key={index} className="flex flex-col gap-1">
        {renderFieldWithValue(child, index, value)}
        {fieldErrors.map((msg, i) => (
          <p key={i} className="text-xs text-destructive">{msg}</p>
        ))}
      </div>
    )
  }
  return renderElement(child, index)
}

function renderFieldWithValue(el: ElementMeta, index: number, value: unknown): React.ReactNode {
  // Spread the original meta so renderField sees defaultValue.
  const enriched: ElementMeta = { ...el, defaultValue: value }
  return renderField(enriched, index)
}

// ─── Table ──────────────────────────────────────────────────

interface TableUrlState {
  search?: string
  sort?:   { column: string; direction: 'asc' | 'desc' }
  page?:   number
}

function buildTableQuery(
  state:    TableUrlState,
  override: TableUrlState,
  pathname: string,
): string {
  const merged: TableUrlState = { ...state, ...override }
  const params = new URLSearchParams()
  if (merged.search)    params.set('search', merged.search)
  if (merged.sort)      params.set('sort', `${merged.sort.column}:${merged.sort.direction}`)
  if (merged.page && merged.page > 1) params.set('page', String(merged.page))
  const qs = params.toString()
  // Always anchor to a real pathname — Vike's client-side router treats
  // a bare `?qs` href as a fresh URL with empty pathname, which routes
  // to the dashboard and blanks the page during SPA navigation.
  const base = pathname || (typeof window !== 'undefined' ? window.location.pathname : '')
  return qs ? `${base}?${qs}` : (base || '#')
}

function nextSortDir(
  current: TableUrlState['sort'],
  column:  string,
): { column: string; direction: 'asc' | 'desc' } {
  if (current?.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { column, direction: 'asc' }
}

function formatCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
  if (value instanceof Date)               return value.toISOString().slice(0, 10)
  if (typeof value === 'boolean')          return value ? 'Yes' : 'No'
  if (typeof value === 'object')           return JSON.stringify(value)
  return String(value)
}

function rowId(row: unknown, index: number): string {
  if (row && typeof row === 'object' && 'id' in row) {
    const id = (row as { id?: unknown }).id
    if (id !== undefined && id !== null) return String(id)
  }
  return String(index)
}

function TableRenderer({ el }: { el: ElementMeta }) {
  const children = el.children ?? []
  const columns  = children.filter(c => c.type === 'column')
  const actions  = children.filter(c => c.type === 'action')

  // Group actions by placement. `inline` defaults to header so it shows up
  // somewhere visible — explicit placements always win.
  const placementOf = (a: ElementMeta): string => String(a['placement'] ?? 'inline')
  const headerActions = actions.filter(a => { const p = placementOf(a); return p === 'header' || p === 'inline' })
  const bulkActions   = actions.filter(a => placementOf(a) === 'bulk')
  const rowActions    = actions.filter(a => placementOf(a) === 'row')

  const rows        = (el['rows'] as unknown[] | undefined) ?? []
  const total       = (el['total'] as number | undefined) ?? rows.length
  const search      = el['search'] as string | undefined
  const currentSort = el['currentSort'] as { column: string; direction: 'asc' | 'desc' } | undefined
  const currentPage = (el['currentPage'] as number | undefined) ?? 1
  const perPage     = el['perPage'] as number | undefined
  const searchable  = Boolean(el['searchable'])
  const currentPath = (el['currentPath'] as string | undefined) ?? ''

  const state: TableUrlState = {
    ...(search       !== undefined ? { search }      : {}),
    ...(currentSort  !== undefined ? { sort: currentSort } : {}),
    page: currentPage,
  }

  // Track which row ids are currently checked. Keyed by id (string), not
  // by index, so pagination and re-renders don't drop selection state.
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const visibleIds = rows.map((row, i) => rowId(row, i))
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
  const someChecked = selected.size > 0

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setSelected(prev => {
      if (visibleIds.every(id => prev.has(id))) {
        const next = new Set(prev)
        for (const id of visibleIds) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of visibleIds) next.add(id)
      return next
    })
  }

  if (columns.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No columns configured for this table.
      </div>
    )
  }

  const totalPages = perPage && perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1
  const showPagination = totalPages > 1
  const showHeaderBar  = searchable || headerActions.length > 0
  const hasBulkActions = bulkActions.length > 0
  const hasRowActions  = rowActions.length > 0
  const totalCols      = columns.length + (hasBulkActions ? 1 : 0) + (hasRowActions ? 1 : 0)

  return (
    <div className="flex flex-col gap-3">
      {showHeaderBar && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {searchable ? (
            <form method="get" action={currentPath || undefined} className="flex items-center gap-2">
              <input
                type="search"
                name="search"
                defaultValue={search ?? ''}
                placeholder="Search…"
                className={inputClass + ' max-w-xs'}
              />
              {currentSort && <input type="hidden" name="sort" value={`${currentSort.column}:${currentSort.direction}`} />}
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-3 text-sm"
              >
                Search
              </button>
            </form>
          ) : <span />}
          {headerActions.length > 0 && (
            <div className="flex items-center gap-2">
              {headerActions.map((a, i) => renderAction(a, i))}
            </div>
          )}
        </div>
      )}
      {hasBulkActions && someChecked && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            {bulkActions.map((a, i) =>
              renderAction(a, i, { ids: Array.from(selected) }),
            )}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      )}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              {hasBulkActions && (
                <th className="px-3 py-3 w-9">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-input"
                  />
                </th>
              )}
              {columns.map((col, i) => {
                const name     = String(col['name'] ?? '')
                const label    = String(col['label'] ?? name)
                const sortable = Boolean(col['sortable'])
                const isActive = currentSort?.column === name

                if (!sortable) {
                  return (
                    <th
                      key={i}
                      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {label}
                    </th>
                  )
                }
                const next = nextSortDir(currentSort, name)
                const href = buildTableQuery(state, { sort: next, page: 1 }, currentPath)
                return (
                  <th
                    key={i}
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    <a href={href} className="inline-flex items-center gap-1 hover:text-foreground">
                      {label}
                      <span className="text-muted-foreground/70">
                        {isActive ? (currentSort!.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </a>
                  </th>
                )
              })}
              {hasRowActions && (
                <th className="px-4 py-3 w-px text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="px-4 py-12 text-center text-muted-foreground">
                  No records yet.
                </td>
              </tr>
            ) : rows.map((row, ri) => {
              const id = visibleIds[ri]!
              const isSelected = selected.has(id)
              return (
                <tr key={id} className={`border-b last:border-b-0 ${isSelected ? 'bg-muted/30' : ''}`}>
                  {hasBulkActions && (
                    <td className="px-3 py-3 w-9">
                      <input
                        type="checkbox"
                        aria-label={`Select row ${id}`}
                        checked={isSelected}
                        onChange={() => toggleRow(id)}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                  )}
                  {columns.map((col, ci) => {
                    const name = String(col['name'] ?? '')
                    const value = (row as Record<string, unknown>)[name]
                    return (
                      <td key={ci} className="px-4 py-3 text-sm text-foreground">
                        {formatCell(value)}
                      </td>
                    )
                  })}
                  {hasRowActions && (
                    <td className="px-4 py-3 w-px whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {rowActions.map((a, ai) =>
                          renderAction(a, ai, { ids: [id], size: 'sm' }),
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {showPagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {currentPage} of {totalPages}{total > 0 ? ` · ${total} record${total === 1 ? '' : 's'}` : ''}
          </span>
          <div className="flex items-center gap-2">
            {currentPage > 1 && (
              <a
                href={buildTableQuery(state, { page: currentPage - 1 }, currentPath)}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                ← Previous
              </a>
            )}
            {currentPage < totalPages && (
              <a
                href={buildTableQuery(state, { page: currentPage + 1 }, currentPath)}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export interface SchemaRendererProps {
  elements: ElementMeta[]
}

export function SchemaRenderer({ elements }: SchemaRendererProps) {
  if (!elements || elements.length === 0) return null
  return (
    <div className="flex flex-col gap-6">
      {elements.map((el, i) => renderElement(el, i))}
    </div>
  )
}
