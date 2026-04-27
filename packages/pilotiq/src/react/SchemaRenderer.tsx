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

function renderAction(el: ElementMeta, index: number): React.ReactNode {
  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const destructive = Boolean(el['destructive'])
  const placement   = String(el['placement'] ?? 'inline')
  const href        = el['href']    as string | undefined
  const method      = el['method']  as 'post' | 'put' | 'patch' | 'delete' | undefined
  const actionUrl   = el['action']  as string | undefined
  const confirm     = el['confirm'] as { title?: string; message: string } | undefined

  const variant = destructive
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
    : 'bg-primary text-primary-foreground hover:bg-primary/90'

  const sizing = placement === 'row'
    ? 'h-7 px-2 text-xs'
    : 'h-8 px-3 text-sm'

  const className = `inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition ${variant} ${sizing}`

  // Link-style action.
  if (href) {
    return (
      <a key={index} href={href} className={className} data-action-name={name}>
        {label}
      </a>
    )
  }

  // Form-style action (POST/PUT/PATCH/DELETE).
  if (method) {
    const httpMethod = method === 'post' ? 'post' : 'post' // hono accepts POST + _method spoof
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
        action={actionUrl}
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

  // Plain button (no dispatch wired yet).
  return (
    <button
      key={index}
      type="button"
      className={className}
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
      const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
      const sizes = { 1: 'text-2xl', 2: 'text-xl', 3: 'text-lg' } as const
      return (
        <div key={index}>
          <Tag className={`${sizes[level as 1 | 2 | 3]} font-bold tracking-tight`}>
            {content}
          </Tag>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
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

function buildTableQuery(state: TableUrlState, override: TableUrlState): string {
  const merged: TableUrlState = { ...state, ...override }
  const params = new URLSearchParams()
  if (merged.search)    params.set('search', merged.search)
  if (merged.sort)      params.set('sort', `${merged.sort.column}:${merged.sort.direction}`)
  if (merged.page && merged.page > 1) params.set('page', String(merged.page))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
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

function TableRenderer({ el }: { el: ElementMeta }) {
  const children = el.children ?? []
  const columns  = children.filter(c => c.type === 'column')
  const actions  = children.filter(c => c.type === 'action')

  const rows        = (el['rows'] as unknown[] | undefined) ?? []
  const total       = (el['total'] as number | undefined) ?? rows.length
  const search      = el['search'] as string | undefined
  const currentSort = el['currentSort'] as { column: string; direction: 'asc' | 'desc' } | undefined
  const currentPage = (el['currentPage'] as number | undefined) ?? 1
  const perPage     = el['perPage'] as number | undefined
  const searchable  = Boolean(el['searchable'])

  const state: TableUrlState = {
    ...(search       !== undefined ? { search }      : {}),
    ...(currentSort  !== undefined ? { sort: currentSort } : {}),
    page: currentPage,
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
  const showHeaderBar  = searchable || actions.length > 0

  return (
    <div className="flex flex-col gap-3">
      {showHeaderBar && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {searchable ? (
            <form method="get" className="flex items-center gap-2">
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
          {actions.length > 0 && (
            <div className="flex items-center gap-2">
              {actions.map((a, i) => renderAction(a, i))}
            </div>
          )}
        </div>
      )}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
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
                const href = buildTableQuery(state, { sort: next, page: 1 })
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">
                  No records yet.
                </td>
              </tr>
            ) : rows.map((row, ri) => (
              <tr key={ri} className="border-b last:border-b-0">
                {columns.map((col, ci) => {
                  const name = String(col['name'] ?? '')
                  const value = (row as Record<string, unknown>)[name]
                  return (
                    <td key={ci} className="px-4 py-3 text-sm text-foreground">
                      {formatCell(value)}
                    </td>
                  )
                })}
              </tr>
            ))}
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
                href={buildTableQuery(state, { page: currentPage - 1 })}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                ← Previous
              </a>
            )}
            {currentPage < totalPages && (
              <a
                href={buildTableQuery(state, { page: currentPage + 1 })}
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
