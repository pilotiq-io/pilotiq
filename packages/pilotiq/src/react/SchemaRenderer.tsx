import React, { useState } from 'react'
import type { ElementMeta } from '../schema/Element.js'
import { getFieldRenderer } from './registry.js'
import { Input } from './ui/input.js'
import { Textarea } from './ui/textarea.js'
import { Switch } from './ui/switch.js'
import { Checkbox } from './ui/checkbox.js'
import { Calendar } from './ui/calendar.js'
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover.js'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog.js'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js'
import {
  Table as DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import { CalendarIcon, FilterIcon, MoreHorizontalIcon } from 'lucide-react'
import { useNavigate } from './navigate.js'

const alertStyles: Record<string, string> = {
  info:    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  danger:  'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
}

// ─── Field rendering ────────────────────────────────────────

function ToggleFieldInput({
  name, defaultChecked, disabled,
}: { name: string; defaultChecked: boolean; disabled: boolean }) {
  const [checked, setChecked] = useState(defaultChecked)
  return (
    <div className="flex items-center gap-2">
      {/* Hidden input is the source of truth for form POST. Always present
          (even when unchecked) so coerceFormValues sees a definitive value. */}
      <input type="hidden" name={name} value={checked ? 'true' : 'false'} />
      <Switch
        id={name}
        checked={checked}
        onCheckedChange={(next) => setChecked(next)}
        disabled={disabled}
      />
    </div>
  )
}

function SelectFieldInput({
  name, defaultValue, disabled, required, placeholder, options,
}: {
  name:         string
  defaultValue: string | undefined
  disabled:     boolean
  required:     boolean
  placeholder:  string | undefined
  options:      Array<{ value: string; label: string }>
}) {
  // Always-controlled. Initialize to '' (not undefined) so Base UI's Select
  // doesn't see the value flip from undefined → string when the user picks
  // an option (warns: "changing the uncontrolled value state to controlled").
  const [value, setValue] = useState<string>(defaultValue ?? '')
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select
        value={value}
        onValueChange={(v) => setValue(v as string)}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger className="w-full" id={name}>
          <SelectValue placeholder={placeholder ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

function DateFieldInput({
  name, defaultValue, disabled, placeholder,
}: {
  name:         string
  defaultValue: string | undefined
  disabled:     boolean
  placeholder:  string | undefined
}) {
  const initial = defaultValue ? new Date(defaultValue) : undefined
  const [date, setDate] = useState<Date | undefined>(
    initial && !isNaN(initial.getTime()) ? initial : undefined,
  )
  const formatted = date ? date.toISOString().slice(0, 10) : ''
  const display   = date
    ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : (placeholder ?? 'Pick a date')

  return (
    <>
      <input type="hidden" name={name} value={formatted} />
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              id={name}
              disabled={disabled}
              className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${
                date ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              <span>{display}</span>
              <CalendarIcon className="size-4 opacity-60" />
            </button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
        </PopoverContent>
      </Popover>
    </>
  )
}

function renderField(el: ElementMeta, index: number): React.ReactNode {
  const fieldType   = String(el['fieldType'] ?? 'text')
  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const required    = Boolean(el['required'])
  const disabled    = Boolean(el['disabled'])
  const placeholder = el['placeholder'] ? String(el['placeholder']) : undefined
  const defaultValue = el['defaultValue']
  const defaultStr = defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : undefined

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
    ...(defaultStr !== undefined ? { defaultValue: defaultStr } : {}),
  }

  // External packages (e.g. @pilotiq/tiptap) register custom renderers
  // for non-built-in fieldTypes. The registry wins over the built-in
  // switch so consumers can override built-ins too if they want.
  const Custom = getFieldRenderer(fieldType)
  if (Custom) {
    return (
      <div key={index} className="flex flex-col gap-1.5">
        {labelEl}
        <Custom
          el={el}
          name={name}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
        />
      </div>
    )
  }

  let input: React.ReactNode
  switch (fieldType) {
    case 'textarea':
      input = <Textarea {...common} rows={Number(el['rows']) || 4} />
      break

    case 'select': {
      const options = (el['options'] as Array<{ value: string; label: string }>) ?? []
      input = (
        <SelectFieldInput
          name={name}
          defaultValue={defaultStr}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          options={options}
        />
      )
      break
    }

    case 'toggle': {
      const initialChecked = defaultValue === true || defaultValue === 'true' || defaultValue === 1 || defaultValue === '1'
      input = <ToggleFieldInput name={name} defaultChecked={initialChecked} disabled={disabled} />
      break
    }

    case 'number':
      input = (
        <Input
          {...common}
          type="number"
          {...(el['min']  !== undefined ? { min:  Number(el['min'])  } : {})}
          {...(el['max']  !== undefined ? { max:  Number(el['max'])  } : {})}
          {...(el['step'] !== undefined ? { step: Number(el['step']) } : {})}
        />
      )
      break

    case 'email':
      input = <Input {...common} type="email" />
      break

    case 'date': {
      // SSR may hand us a JS Date object directly; SPA JSON nav arrives as
      // an ISO string. Normalize both into a `YYYY-MM-DD` slice — naive
      // string slicing on `Date.toString()` ("Mon Apr 27 2026 ...") gives
      // garbage when re-parsed, so handle the Date branch explicitly.
      let iso: string | undefined
      if (defaultValue instanceof Date) {
        iso = isNaN(defaultValue.getTime())
          ? undefined
          : defaultValue.toISOString().slice(0, 10)
      } else if (typeof defaultValue === 'string' && defaultValue) {
        const parsed = new Date(defaultValue)
        iso = isNaN(parsed.getTime())
          ? undefined
          : parsed.toISOString().slice(0, 10)
      }
      input = (
        <DateFieldInput
          name={name}
          defaultValue={iso}
          disabled={disabled}
          placeholder={placeholder}
        />
      )
      break
    }

    case 'slug':
    case 'text':
    default:
      input = (
        <Input
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
 * Build a `<form method="POST">` (with optional `_method` spoof) and
 * submit it. Used for form-style row/header actions that fire from a
 * non-form context (e.g. a dropdown menu item).
 */
function submitMethodForm(
  url:    string,
  method: 'post' | 'put' | 'patch' | 'delete',
): void {
  if (typeof document === 'undefined') return
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = url
  const spoofed = method === 'put' || method === 'patch' || method === 'delete' ? method : undefined
  if (spoofed) {
    const input = document.createElement('input')
    input.type  = 'hidden'
    input.name  = '_method'
    input.value = spoofed
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

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

/**
 * Confirm-style dialog wrapping an action's button. The trigger button is
 * rendered inline; clicking it opens the dialog. On confirm we run
 * `onConfirm` (which is action-style-specific — submit a form, programmatic
 * POST, etc.) and close the dialog.
 */
function ConfirmActionDialog({
  trigger,
  title,
  message,
  destructive,
  onConfirm,
}: {
  trigger:     (open: () => void) => React.ReactNode
  title:       string | undefined
  message:     string
  destructive: boolean
  onConfirm:   () => void
}) {
  const [open, setOpen] = useState(false)
  const confirmClass = destructive
    ? 'inline-flex items-center justify-center rounded-md bg-destructive px-3 h-9 text-sm font-medium text-destructive-foreground hover:bg-destructive/90'
    : 'inline-flex items-center justify-center rounded-md bg-primary px-3 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90'
  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title ?? 'Are you sure?'}</DialogTitle>
            <DialogDescription>{message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-9 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onConfirm() }}
              className={confirmClass}
              autoFocus
            >
              {destructive ? 'Delete' : 'Confirm'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
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
    if (confirm) {
      // Confirm-gated submit: render as type="button" so click opens the
      // dialog instead of submitting; on confirm, programmatically submit
      // the targeted form (or the closest enclosing form if no formTarget).
      return (
        <ConfirmActionDialog
          key={index}
          title={confirm.title}
          message={confirm.message}
          destructive={destructive}
          onConfirm={() => {
            if (typeof document === 'undefined') return
            const form = formTarget
              ? document.getElementById(formTarget) as HTMLFormElement | null
              : document.querySelector<HTMLFormElement>('form')
            form?.requestSubmit()
          }}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className={className}
              data-action-name={name}
            >
              {label}
            </button>
          )}
        />
      )
    }
    return (
      <button
        key={index}
        type="submit"
        form={formTarget}
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
    const resolvedUrl = resolveTemplate(actionUrl)
    if (confirm) {
      // Build + submit the form on confirm. No server-rendered <form>, so
      // accidental Enter-key submit can't bypass the dialog.
      return (
        <ConfirmActionDialog
          key={index}
          title={confirm.title}
          message={confirm.message}
          destructive={destructive}
          onConfirm={() => {
            if (!resolvedUrl) return
            submitMethodForm(resolvedUrl, method)
          }}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className={className}
              data-action-name={name}
            >
              {label}
            </button>
          )}
        />
      )
    }
    return (
      <form
        key={index}
        method={httpMethod}
        action={resolvedUrl}
        className="inline-block"
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
    if (confirm) {
      return (
        <ConfirmActionDialog
          key={index}
          title={confirm.title}
          message={confirm.message}
          destructive={destructive}
          onConfirm={() => submitHandlerAction(dispatchUrl, ids)}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className={className}
              data-action-name={name}
            >
              {label}
            </button>
          )}
        />
      )
    }
    return (
      <button
        key={index}
        type="button"
        onClick={() => submitHandlerAction(dispatchUrl, ids)}
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

/**
 * Filter icon button + Popover containing every filter control.
 * Opens on click; the inner Selects don't dismiss the outer Popover when
 * an option is chosen (Base UI Popover doesn't auto-close on inner clicks).
 *
 * Each FilterSelect navigates the page on change (window.location), so the
 * filter form is no longer needed — keeps the search input in its own
 * lightweight form for native Enter-to-submit.
 */
function FilterPopover({ filters }: { filters: ElementMeta[] }) {
  const activeCount = filters.filter(f => {
    const v = f['value']
    return typeof v === 'string' && v !== ''
  }).length

  return (
    <Popover>
      <PopoverTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            aria-label="Filters"
            className="relative inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <FilterIcon className="size-4" />
            <span>Filters</span>
            {activeCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {activeCount}
              </span>
            )}
          </button>
        )}
      />
      <PopoverContent align="start" className="w-72 p-3">
        <div className="flex flex-col gap-3">
          {filters.map((f, i) => renderFilterControl(f, i))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Collapses all row-level actions into a single MoreHorizontal dropdown
 * trigger. Each action becomes a DropdownMenuItem; on click we either:
 *   - link-style: navigate to href (template `:id` substituted for rowId)
 *   - form-style: POST a synthetic <form> via submitMethodForm
 *   - handler-style: POST the dispatchUrl via submitHandlerAction
 *   - any of the above with `confirm`: open a Dialog at the row level,
 *     dispatch on confirm. The dropdown closes first (shadcn pattern —
 *     single visible popup at a time), then the dialog opens.
 */
function RowActionsMenu({
  rowId,
  actions,
}: {
  rowId:   string
  actions: ElementMeta[]
}) {
  const [pending, setPending] = useState<ElementMeta | null>(null)

  const resolveTemplate = (s: string | undefined): string | undefined =>
    s && rowId ? s.replace(':id', rowId) : s

  const dispatchAction = (action: ElementMeta): void => {
    const href        = action['href']        as string | undefined
    const method      = action['method']      as 'post' | 'put' | 'patch' | 'delete' | undefined
    const actionUrl   = action['action']      as string | undefined
    const dispatchUrl = action['dispatchUrl'] as string | undefined
    if (href) {
      const url = resolveTemplate(href)
      if (url && typeof window !== 'undefined') window.location.href = url
      return
    }
    if (method) {
      const url = resolveTemplate(actionUrl)
      if (url) submitMethodForm(url, method)
      return
    }
    if (dispatchUrl) {
      submitHandlerAction(dispatchUrl, [rowId])
      return
    }
  }

  const onClick = (action: ElementMeta): void => {
    if (action['confirm']) {
      setPending(action)
      return
    }
    dispatchAction(action)
  }

  const pendingConfirm = pending?.['confirm'] as
    | { title?: string; message: string }
    | undefined

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(props) => (
            <button
              {...props}
              type="button"
              aria-label="Row actions"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <MoreHorizontalIcon className="size-4" />
            </button>
          )}
        />
        <DropdownMenuContent align="end">
          {actions.map((a, i) => {
            const label       = String(a['label'] ?? a['name'] ?? '')
            const destructive = Boolean(a['destructive'])
            return (
              <DropdownMenuItem
                key={i}
                destructive={destructive}
                onClick={() => onClick(a)}
              >
                {label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null) }}>
        <DialogContent>
          {pending && pendingConfirm && (
            <>
              <DialogHeader>
                <DialogTitle>{pendingConfirm.title ?? 'Are you sure?'}</DialogTitle>
                <DialogDescription>{pendingConfirm.message}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-9 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    const action = pending
                    setPending(null)
                    dispatchAction(action)
                  }}
                  className={
                    pending['destructive']
                      ? 'inline-flex items-center justify-center rounded-md bg-destructive px-3 h-9 text-sm font-medium text-destructive-foreground hover:bg-destructive/90'
                      : 'inline-flex items-center justify-center rounded-md bg-primary px-3 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90'
                  }
                >
                  {pending['destructive'] ? 'Delete' : 'Confirm'}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function TabsRenderer({ el, index }: { el: ElementMeta; index: number }) {
  const tabs = (el.children ?? []).filter(c => c.type === 'tab')
  if (tabs.length === 0) return null

  const variant   = el['variant'] === 'underline' ? 'underline' : 'pills'
  const tabValues = tabs.map((_, i) => `tab-${i}`)
  const defaultValue = tabValues[0]!

  // Underline variant overrides the primitive's pill chrome with a bottom
  // border on the list and per-trigger underline-on-selected. No
  // `<TabsIndicator>` is rendered, so there's no sliding pill to hide.
  const listClass = variant === 'underline'
    ? 'relative flex h-auto w-fit justify-start gap-0 rounded-none bg-transparent p-0 text-muted-foreground border-b border-border'
    : undefined
  const triggerClass = variant === 'underline'
    ? 'rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium -mb-px data-[active]:border-primary data-[active]:text-foreground data-[active]:bg-transparent data-[active]:shadow-none'
    : undefined

  return (
    <Tabs key={index} defaultValue={defaultValue}>
      <TabsList className={listClass}>
        {tabs.map((tab, i) => (
          <TabsTrigger key={i} value={tabValues[i]!} className={triggerClass}>
            {String(tab['label'] ?? '')}
            {tab['badge'] ? (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-muted">
                {String(tab['badge'])}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab, i) => (
        <TabsContent key={i} value={tabValues[i]!} className="pt-2">
          {renderChildren(tab['children'] as ElementMeta[] | undefined)}
        </TabsContent>
      ))}
    </Tabs>
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
  state:        TableUrlState,
  override:     TableUrlState,
  pathname:     string,
  filterValues: Record<string, string> = {},
): string {
  const merged: TableUrlState = { ...state, ...override }
  const params = new URLSearchParams()
  // Carry forward active filter values so sort/pagination links don't
  // accidentally clear them. Filter names can't collide with reserved
  // keys (search/sort/page/perPage) — that's enforced upstream.
  for (const [name, val] of Object.entries(filterValues)) {
    if (val) params.set(name, val)
  }
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

/**
 * Filter dropdown that updates the URL directly on change. We don't rely
 * on a wrapping `<form>` because filters now live inside a portaled
 * Popover (the search input keeps its own form for Enter-to-submit).
 *
 * Empty value (`''`) is the "All" sentinel — the param is removed from
 * the URL rather than serialized as `&name=`.
 */
function FilterSelect({
  name, label, defaultValue, placeholder, options,
}: {
  name:         string
  label:        string
  defaultValue: string
  placeholder:  string
  options:      Array<{ value: string; label: string }>
}) {
  const [value, setValue] = useState(defaultValue)
  const navigate           = useNavigate()

  const onChange = (next: unknown) => {
    const v = typeof next === 'string' ? next : ''
    setValue(v)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (v === '') url.searchParams.delete(name)
    else          url.searchParams.set(name, v)
    // Filter changes reset pagination — first page of the new result set.
    url.searchParams.delete('page')
    // SPA navigate via context (vike's navigate when mounted under the
    // Vike-generated +Layout). Fallback is full reload — see useNavigate.
    void navigate(url.pathname + url.search)
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{placeholder}</SelectItem>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function renderFilterControl(el: ElementMeta, index: number): React.ReactNode {
  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const kind        = String(el['kind'] ?? 'select')
  const value       = el['value'] ? String(el['value']) : ''
  const placeholder = el['placeholder'] ? String(el['placeholder']) : 'All'

  if (kind === 'boolean') {
    return (
      <FilterSelect
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        placeholder={placeholder}
        options={[{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }]}
      />
    )
  }

  const options = (el['options'] as Array<{ value: string; label: string }> | undefined) ?? []
  return (
    <FilterSelect
      key={index}
      name={name}
      label={label}
      defaultValue={value}
      placeholder={placeholder}
      options={options}
    />
  )
}

function TableRenderer({ el }: { el: ElementMeta }) {
  const children = el.children ?? []
  const columns  = children.filter(c => c.type === 'column')
  const actions  = children.filter(c => c.type === 'action')
  const filters  = children.filter(c => c.type === 'filter')

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

  // Snapshot active filter values for sort/pagination href construction.
  // Filter form submits already carry these (selects are inside the
  // form); `<a href>` links don't, so we re-emit them here.
  const activeFilters: Record<string, string> = {}
  for (const f of filters) {
    const v = f['value']
    if (typeof v === 'string' && v !== '') activeFilters[String(f['name'])] = v
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
  const hasFilters     = filters.length > 0
  const showHeaderBar  = searchable || headerActions.length > 0 || hasFilters
  const hasBulkActions = bulkActions.length > 0
  const hasRowActions  = rowActions.length > 0
  const totalCols      = columns.length + (hasBulkActions ? 1 : 0) + (hasRowActions ? 1 : 0)

  return (
    <div className="flex flex-col gap-3">
      {showHeaderBar && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {(searchable || hasFilters) ? (
            <div className="flex items-center gap-2">
              {searchable && (
                <form method="get" action={currentPath || undefined} className="flex items-end gap-2">
                  <Input
                    type="search"
                    name="search"
                    defaultValue={search ?? ''}
                    placeholder="Search…"
                    className="h-9 w-64"
                  />
                  {/* Search submits via Enter natively. Hidden submit kept
                      for screen-reader form semantics. */}
                  <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
                    Apply
                  </button>
                </form>
              )}
              {hasFilters && (
                <FilterPopover filters={filters} />
              )}
            </div>
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
        <DataTable>
          <TableHeader className="bg-muted">
            <TableRow>
              {hasBulkActions && (
                <TableHead className="w-9 px-3">
                  <Checkbox
                    aria-label="Select all rows"
                    checked={allChecked}
                    onCheckedChange={() => toggleAll()}
                  />
                </TableHead>
              )}
              {columns.map((col, i) => {
                const name     = String(col['name'] ?? '')
                const label    = String(col['label'] ?? name)
                const sortable = Boolean(col['sortable'])
                const isActive = currentSort?.column === name

                if (!sortable) {
                  return (
                    <TableHead key={i} className="text-xs uppercase tracking-wider">
                      {label}
                    </TableHead>
                  )
                }
                const next = nextSortDir(currentSort, name)
                const href = buildTableQuery(state, { sort: next, page: 1 }, currentPath, activeFilters)
                return (
                  <TableHead key={i} className="text-xs uppercase tracking-wider">
                    <a href={href} className="inline-flex items-center gap-1 hover:text-foreground">
                      {label}
                      <span className="text-muted-foreground/70">
                        {isActive ? (currentSort!.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </a>
                  </TableHead>
                )
              })}
              {hasRowActions && (
                <TableHead className="w-px text-right text-xs uppercase tracking-wider">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalCols} className="py-12 text-center text-muted-foreground">
                  No records yet.
                </TableCell>
              </TableRow>
            ) : rows.map((row, ri) => {
              const id = visibleIds[ri]!
              const isSelected = selected.has(id)
              return (
                <TableRow key={id} data-state={isSelected ? 'selected' : undefined}>
                  {hasBulkActions && (
                    <TableCell className="w-9 px-3">
                      <Checkbox
                        aria-label={`Select row ${id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(id)}
                      />
                    </TableCell>
                  )}
                  {columns.map((col, ci) => {
                    const name = String(col['name'] ?? '')
                    const value = (row as Record<string, unknown>)[name]
                    return (
                      <TableCell key={ci} className="text-sm text-foreground">
                        {formatCell(value)}
                      </TableCell>
                    )
                  })}
                  {hasRowActions && (
                    <TableCell className="w-px text-right">
                      <RowActionsMenu rowId={id} actions={rowActions} />
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </DataTable>
      </div>
      {showPagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {currentPage} of {totalPages}{total > 0 ? ` · ${total} record${total === 1 ? '' : 's'}` : ''}
          </span>
          <div className="flex items-center gap-2">
            {currentPage > 1 && (
              <a
                href={buildTableQuery(state, { page: currentPage - 1 }, currentPath, activeFilters)}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                ← Previous
              </a>
            )}
            {currentPage < totalPages && (
              <a
                href={buildTableQuery(state, { page: currentPage + 1 }, currentPath, activeFilters)}
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
