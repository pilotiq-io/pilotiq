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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip.js'
import {
  CalendarIcon, FilterIcon, MoreHorizontalIcon,
  CheckCircle2Icon, CircleIcon, XCircleIcon,
  CheckIcon, XIcon, ShieldCheckIcon, UserIcon, StarIcon,
  EyeIcon, EyeOffIcon, InboxIcon, BellIcon, MailIcon,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from './navigate.js'
import { useToast } from './Toaster.js'

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

import type { NotificationMeta } from '../notifications/Notification.js'

type Notify    = (n: NotificationMeta | Omit<NotificationMeta, 'id'>) => void
type Navigate  = (url: string) => void
type Notif     = NotificationMeta

/** Drain `notifications[]` from a JSON response into `useToast().notify`. */
function dispatchNotifications(data: unknown, notify: Notify): void {
  const notifs = (data as { notifications?: Notif[] }).notifications
  if (!notifs || notifs.length === 0) return
  for (const n of notifs) notify(n)
}

/**
 * Fetch + JSON dispatch for form-method actions (Delete-style — no
 * server-rendered <form>, no 303 redirect, no full page reload). Sends
 * `_method` as a body field so Hono's POST handler dispatches the
 * intended verb. On success: drain notifications, SPA-navigate to the
 * server-supplied redirect (or stay on current path if none).
 *
 * Failure modes:
 *   - 4xx/5xx with `{ error }`: surfaced as an error toast.
 *   - Network errors: error toast with the exception message.
 */
async function dispatchMethodAction(
  url:      string,
  method:   'post' | 'put' | 'patch' | 'delete',
  navigate: Navigate,
  notify:   Notify,
): Promise<void> {
  try {
    const fd = new FormData()
    if (method !== 'post') fd.append('_method', method)
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Accept': 'application/json' },
      body:    fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = String((data as { error?: string }).error ?? `Request failed (${res.status})`)
      notify({ type: 'error', title: 'Action failed', body: message })
      return
    }
    dispatchNotifications(data, notify)
    const redirect = String((data as { redirect?: string }).redirect ?? '')
    if (redirect) navigate(redirect)
    else if (typeof window !== 'undefined') navigate(window.location.pathname + window.location.search)
  } catch (err) {
    notify({ type: 'error', title: 'Action failed', body: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * Fetch + JSON dispatch for handler-style actions (no schema, no modal,
 * just a button). Sends `ids[]` plus arbitrary `values` fields. Server
 * returns `{ ok, redirect, notifications }` (or `{ ok: false, error }` on
 * failure). On success: drain notifications, SPA-navigate; on failure:
 * surface the error as a toast. No full page reload in any case.
 */
async function dispatchHandlerAction(
  url:      string,
  ids:      string[],
  navigate: Navigate,
  notify:   Notify,
  values:   Record<string, string> = {},
): Promise<void> {
  try {
    const fd = new FormData()
    for (const id of ids) fd.append('ids', id)
    for (const [k, v] of Object.entries(values)) fd.append(k, v)
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Accept': 'application/json' },
      body:    fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = String((data as { error?: string }).error ?? `Request failed (${res.status})`)
      notify({ type: 'error', title: 'Action failed', body: message })
      return
    }
    dispatchNotifications(data, notify)
    const redirect = String((data as { redirect?: string }).redirect ?? '')
    if (redirect) navigate(redirect)
    else if (typeof window !== 'undefined') navigate(window.location.pathname + window.location.search)
  } catch (err) {
    notify({ type: 'error', title: 'Action failed', body: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * Modal-form action dialog. Opens a Dialog with an optional form schema
 * (rendered from `meta.children`) plus header/footer chrome from
 * `meta.modal`. On submit, fetches the dispatchUrl with `Accept:
 * application/json` so the server can return:
 *   - 200 `{ ok: true, redirect }` → navigate (SPA via useNavigate)
 *   - 422 `{ ok: false, errors: { field: string[] } }` → inline errors
 *   - 500 `{ ok: false, error }` → server error banner
 *
 * Used for handler-style actions that have a schema and/or a modal config.
 * Replaces the older ConfirmActionDialog for that path; confirm-only
 * actions without a schema also flow through here (no fields rendered,
 * just header + footer = same UX as the old confirm dialog).
 */
function ActionModalDialog({
  trigger,
  meta,
  ids,
  initialValues = {},
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?:       (open: () => void) => React.ReactNode
  meta:           ElementMeta
  ids:            string[]
  initialValues?: Record<string, unknown>
  open?:          boolean
  onOpenChange?:  (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = (o: boolean): void => {
    if (isControlled) onOpenChange?.(o)
    else setInternalOpen(o)
  }
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const { notify } = useToast()

  const modal       = meta['modal']    as { heading?: string; description?: string; submitLabel?: string; cancelLabel?: string; icon?: string; width?: 'sm'|'md'|'lg'|'xl'; slideOver?: boolean } | undefined
  const confirm     = meta['confirm']  as { title?: string; message: string } | undefined
  const destructive = Boolean(meta['destructive'])
  const dispatchUrl = meta['dispatchUrl'] as string | undefined
  const fields      = (meta.children ?? []) as ElementMeta[]
  const hasForm     = fields.length > 0

  const heading     = modal?.heading ?? confirm?.title ?? (hasForm ? String(meta['label'] ?? 'Submit') : 'Are you sure?')
  const description = modal?.description ?? confirm?.message
  const submitLabel = modal?.submitLabel ?? (destructive ? 'Delete' : (hasForm ? 'Submit' : 'Confirm'))
  const cancelLabel = modal?.cancelLabel ?? 'Cancel'
  const widthClass  = ({ sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' } as const)[modal?.width ?? 'md']

  const reset = (): void => { setErrors({}); setServerError(null); setSubmitting(false) }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (!dispatchUrl) return
    setSubmitting(true)
    setServerError(null)
    setErrors({})

    const fd = new FormData(e.currentTarget)
    for (const id of ids) fd.append('ids', id)

    try {
      const res = await fetch(dispatchUrl, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 422) {
        setErrors((data as { errors?: Record<string, string[]> }).errors ?? {})
        setSubmitting(false)
        return
      }
      if (!res.ok) {
        setServerError(String((data as { error?: string }).error ?? `Request failed (${res.status})`))
        setSubmitting(false)
        return
      }
      setOpen(false)
      reset()
      // Server-emitted notifications come through the JSON response;
      // surface them via the Toaster before navigating so the user
      // sees the success/error toast even when navigation re-renders.
      const notifs = (data as { notifications?: Array<{ id: string; type: string; title: string; body?: string; icon?: string; duration?: number }> }).notifications
      if (notifs && notifs.length > 0) {
        for (const n of notifs) notify(n as Parameters<typeof notify>[0])
      }
      const redirect = String((data as { redirect?: string }).redirect ?? '')
      if (redirect) navigate(redirect)
      else if (typeof window !== 'undefined') navigate(window.location.pathname + window.location.search)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Submit failed')
      setSubmitting(false)
    }
  }

  const cancelClass  = 'inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-9 text-sm font-medium hover:bg-accent hover:text-accent-foreground'
  const confirmClass = destructive
    ? 'inline-flex items-center justify-center rounded-md bg-destructive px-3 h-9 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50'
    : 'inline-flex items-center justify-center rounded-md bg-primary px-3 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'

  return (
    <>
      {trigger?.(() => { reset(); setOpen(true) })}
      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); setOpen(o) }}>
        <DialogContent className={widthClass}>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{heading}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            {hasForm && (
              <div className="flex flex-col gap-3 py-2">
                {fields.map((f, i) => renderFormChild(f, i, initialValues, errors))}
              </div>
            )}
            {serverError && (
              <p className="py-2 text-sm text-destructive">{serverError}</p>
            )}
            <DialogFooter>
              <button type="button" onClick={() => setOpen(false)} className={cancelClass}>
                {cancelLabel}
              </button>
              <button type="submit" disabled={submitting} autoFocus={!hasForm} className={confirmClass}>
                {submitting ? 'Working…' : submitLabel}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Confirm-style dialog wrapping an action's button. The trigger button is
 * rendered inline; clicking it opens the dialog. On confirm we run
 * `onConfirm` (which is action-style-specific — submit a form, programmatic
 * POST, etc.) and close the dialog. Used by submit-style and form-method
 * actions; handler-style + confirm/modal flows through ActionModalDialog
 * instead.
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

/**
 * Button + optional confirm dialog for a form-method action (Delete and
 * the like). Click → fetch + JSON dispatch via `dispatchMethodAction` —
 * no full page reload, no server-rendered form. Confirm dialog gates the
 * dispatch when configured.
 */
function MethodActionButton({
  url,
  method,
  confirm,
  destructive,
  className,
  name,
  ariaLabel,
  tooltip,
  inner,
}: {
  url:         string | undefined
  method:      'post' | 'put' | 'patch' | 'delete'
  confirm:     { title?: string; message: string } | undefined
  destructive: boolean
  className:   string
  name:        string
  ariaLabel:   string | undefined
  tooltip:     string | undefined
  inner:       React.ReactNode
}) {
  const navigate = useNavigate()
  const { notify } = useToast()
  const dispatch = (): void => {
    if (!url) return
    void dispatchMethodAction(url, method, navigate, notify)
  }

  if (confirm) {
    return (
      <ConfirmActionDialog
        title={confirm.title}
        message={confirm.message}
        destructive={destructive}
        onConfirm={dispatch}
        trigger={(open) => withTooltip(
          <button type="button" onClick={open} className={className} data-action-name={name} aria-label={ariaLabel}>
            {inner}
          </button>,
          tooltip,
        )}
      />
    )
  }
  return withTooltip(
    <button type="button" onClick={dispatch} className={className} data-action-name={name} aria-label={ariaLabel}>
      {inner}
    </button>,
    tooltip,
  )
}

/**
 * Button for a handler-style action without confirm/modal. Click →
 * fetch + JSON via `dispatchHandlerAction`, then SPA-navigate +
 * show notifications. No full page reload.
 */
function HandlerActionButton({
  url,
  ids,
  className,
  name,
  ariaLabel,
  tooltip,
  inner,
}: {
  url:       string
  ids:       string[]
  className: string
  name:      string
  ariaLabel: string | undefined
  tooltip:   string | undefined
  inner:     React.ReactNode
}) {
  const navigate = useNavigate()
  const { notify } = useToast()
  return withTooltip(
    <button
      type="button"
      onClick={() => void dispatchHandlerAction(url, ids, navigate, notify)}
      className={className}
      data-action-name={name}
      aria-label={ariaLabel}
    >
      {inner}
    </button>,
    tooltip,
  )
}

interface RenderActionOptions {
  /** Ids to send when this action is handler-style. Used by row + bulk
   * placements to pass selected/current record id(s). */
  ids?: string[]
  /** Optional sizing override (e.g. row actions render smaller). */
  size?: 'sm' | 'md'
}

/** Render either a single Action or an ActionGroup based on `el.type`.
 * Used by callsites that accept both (table header / bulk toolbars,
 * heading actions, container schemas). */
function renderActionLike(
  el:    ElementMeta,
  index: number,
  opts:  RenderActionOptions = {},
): React.ReactNode {
  if (el.type === 'actionGroup') {
    return <ActionGroupTrigger key={index} el={el} ids={opts.ids ?? []} />
  }
  return renderAction(el, index, opts)
}

/** Color preset → tailwind class group. `ghost` is bg-less and works
 * with hover:bg-accent. Others are solid + hover-darken. */
const COLOR_VARIANTS: Record<string, string> = {
  primary:     'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  success:     'bg-emerald-600 text-white hover:bg-emerald-600/90',
  warning:     'bg-amber-500 text-white hover:bg-amber-500/90',
  info:        'bg-blue-600 text-white hover:bg-blue-600/90',
  ghost:       'bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
}

/** Outlined variant — replaces solid bg with a border + transparent bg. */
const OUTLINED_VARIANTS: Record<string, string> = {
  primary:     'border border-primary/40 text-primary bg-transparent hover:bg-primary/10',
  destructive: 'border border-destructive/40 text-destructive bg-transparent hover:bg-destructive/10',
  success:     'border border-emerald-600/40 text-emerald-700 dark:text-emerald-400 bg-transparent hover:bg-emerald-600/10',
  warning:     'border border-amber-500/40 text-amber-700 dark:text-amber-400 bg-transparent hover:bg-amber-500/10',
  info:        'border border-blue-600/40 text-blue-700 dark:text-blue-400 bg-transparent hover:bg-blue-600/10',
  ghost:       'border border-input text-foreground bg-transparent hover:bg-accent',
}

/** Size preset → tailwind sizing classes. Icon-only buttons use the
 * width=height variants from the second map. */
const SIZE_CLASSES: Record<string, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-8 px-3 text-sm',
  lg: 'h-10 px-4 text-base',
}
const ICON_SIZE_CLASSES: Record<string, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
}

/** Build the trigger button className from action meta + render context. */
function actionButtonClass(el: ElementMeta, opts: RenderActionOptions): string {
  const destructive = Boolean(el['destructive'])
  const placement   = String(el['placement'] ?? 'inline')
  const outlined    = Boolean(el['outlined'])
  const iconOnly    = Boolean(el['iconOnly'])
  const explicitColor = el['color'] as string | undefined
  const explicitSize  = el['size'] as 'sm' | 'md' | 'lg' | undefined

  // Color: explicit `.color()` wins; `destructive` flag falls back to
  // 'destructive'; otherwise 'primary'.
  const color = explicitColor ?? (destructive ? 'destructive' : 'primary')
  const variant = (outlined ? OUTLINED_VARIANTS[color] : COLOR_VARIANTS[color]) ?? COLOR_VARIANTS['primary']

  // Size: explicit `.size()` wins; otherwise small for row context, md elsewhere.
  const size = explicitSize ?? (opts.size === 'sm' || placement === 'row' ? 'sm' : 'md')
  const sizingMap = iconOnly ? ICON_SIZE_CLASSES : SIZE_CLASSES
  const sizing = sizingMap[size] ?? sizingMap['md']

  return `relative inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition ${variant} ${sizing}`
}

/** Render the action's icon (when set) — currently a placeholder string;
 * Plan #3 will wire up Lucide icon resolution. */
function renderActionIcon(_el: ElementMeta): React.ReactNode {
  // Icon registry resolution lands later; for now icons are passed through
  // to consumers that need to render them.
  return null
}

/** Tiny corner badge for actions that set `.badge(...)`. */
function renderActionBadge(el: ElementMeta): React.ReactNode {
  const value = el['badge']
  if (value === undefined || value === null || value === '') return null
  const color = (el['badgeColor'] as string | undefined) ?? 'bg-primary text-primary-foreground'
  return (
    <span className={`absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium ${color}`}>
      {String(value)}
    </span>
  )
}

/** If `meta.tooltip` is set, wrap the trigger in a Tooltip. The Tooltip's
 * provider mounts on demand so multiple actions on a page don't share
 * state. */
function withTooltip(node: React.ReactNode, tooltip: string | undefined): React.ReactNode {
  if (!tooltip) return node
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={() => node as React.ReactElement} />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function renderAction(
  el: ElementMeta,
  index: number,
  opts: RenderActionOptions = {},
): React.ReactNode {
  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const destructive = Boolean(el['destructive'])
  const href        = el['href']        as string | undefined
  const method      = el['method']      as 'post' | 'put' | 'patch' | 'delete' | undefined
  const actionUrl   = el['action']      as string | undefined
  const dispatchUrl = el['dispatchUrl'] as string | undefined
  const submit      = Boolean(el['submit'])
  const confirm     = el['confirm']     as { title?: string; message: string } | undefined
  const tooltip     = el['tooltip'] as string | undefined
  const iconOnly    = Boolean(el['iconOnly'])
  const isDisabled  = Boolean(el['disabled'])

  const className = actionButtonClass(el, opts) + (isDisabled ? ' opacity-50 cursor-not-allowed pointer-events-none' : '')
  const icon  = renderActionIcon(el)
  const badge = renderActionBadge(el)
  // Icon-only buttons hide the label visually but expose it via aria-label.
  const ariaLabel = iconOnly ? label : undefined
  const inner = iconOnly ? <>{icon}{badge}</> : <>{icon}<span>{label}</span>{badge}</>

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
          trigger={(open) => withTooltip(
            <button
              type="button"
              onClick={open}
              className={className}
              data-action-name={name}
              aria-label={ariaLabel}
            >
              {inner}
            </button>,
            tooltip,
          )}
        />
      )
    }
    return withTooltip(
      <button
        key={index}
        type="submit"
        form={formTarget}
        className={className}
        data-action-name={name}
        aria-label={ariaLabel}
      >
        {inner}
      </button>,
      tooltip,
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
    return withTooltip(
      <a
        key={index}
        href={resolveTemplate(href)}
        className={className}
        data-action-name={name}
        aria-label={ariaLabel}
      >
        {inner}
      </a>,
      tooltip,
    )
  }

  // Form-style action (POST/PUT/PATCH/DELETE) — fetch + JSON, no full reload.
  if (method) {
    const resolvedUrl = resolveTemplate(actionUrl)
    return (
      <MethodActionButton
        key={index}
        url={resolvedUrl}
        method={method}
        confirm={confirm}
        destructive={destructive}
        className={className}
        name={name}
        ariaLabel={ariaLabel}
        tooltip={tooltip}
        inner={inner}
      />
    )
  }

  // Handler-style action — fetch + JSON dispatch with `ids[]` body.
  if (dispatchUrl) {
    const ids = opts.ids ?? []
    const modal = el['modal']
    if (confirm || modal) {
      return (
        <ActionModalDialog
          key={index}
          meta={el}
          ids={ids}
          trigger={(open) => withTooltip(
            <button
              type="button"
              onClick={open}
              className={className}
              data-action-name={name}
              aria-label={ariaLabel}
            >
              {inner}
            </button>,
            tooltip,
          )}
        />
      )
    }
    return (
      <HandlerActionButton
        key={index}
        url={dispatchUrl}
        ids={ids}
        className={className}
        name={name}
        ariaLabel={ariaLabel}
        tooltip={tooltip}
        inner={inner}
      />
    )
  }

  // No dispatch wired (no href / method / dispatchUrl). Render a disabled
  // placeholder so the user sees the button, but it does nothing.
  return withTooltip(
    <button
      key={index}
      type="button"
      disabled
      className={className + ' opacity-50 cursor-not-allowed'}
      data-action-name={name}
      aria-label={ariaLabel}
    >
      {inner}
    </button>,
    tooltip,
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
 * Render row actions inline. Each Action becomes a small button next to
 * the others; an `ActionGroup` placed in row position keeps its dropdown
 * via `ActionGroupTrigger` (the dropdown UX is opt-in via grouping, not
 * a default). Per-row visibility and disabled state come from the
 * server-side eval inside `dispatchTable` (`_visibleActions` /
 * `_disabledActions` keys on the row).
 *
 * Each Action's dispatch (link / fetch+JSON / modal / confirm) is handled
 * by `renderActionLike` → `renderAction`, same path as header / inline /
 * bulk placements. The `:id` substitution comes from `opts.ids = [rowId]`.
 */
function renderRowActions(
  rowId:     string,
  rowRecord: Record<string, unknown> | undefined,
  actions:   ElementMeta[],
): React.ReactNode {
  const rowVisibleSet  = new Set((rowRecord?.['_visibleActions']  as string[] | undefined) ?? [])
  const rowDisabledSet = new Set((rowRecord?.['_disabledActions'] as string[] | undefined) ?? [])

  const visible = actions.filter(a => {
    if (!a['conditional']) return true
    return rowVisibleSet.has(String(a['name'] ?? ''))
  })

  const decorate = (a: ElementMeta): ElementMeta => {
    const name = String(a['name'] ?? '')
    if (rowDisabledSet.has(name)) {
      return { ...a, disabled: true }
    }
    return a
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {visible.map((a, i) => renderActionLike(decorate(a), i, { ids: [rowId], size: 'sm' }))}
    </div>
  )
}


/**
 * Trigger button + dropdown menu for an `ActionGroup` meta. Reuses the
 * action button styling helpers so a group's chrome (color/size/outlined/
 * tooltip/iconButton) matches a regular Action. Each child Action
 * dispatches via the same logic as `renderAction` — link/method/handler/
 * confirm/modal — but routed through a `pending` state so the dropdown
 * closes before any dialog opens (shadcn pattern: one popup at a time).
 */
function ActionGroupTrigger({
  el,
  ids = [],
}: {
  el:   ElementMeta
  ids?: string[]
}) {
  const [pending, setPending] = useState<ElementMeta | null>(null)
  const navigate = useNavigate()
  const { notify } = useToast()

  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const tooltip     = el['tooltip'] as string | undefined
  const iconOnly    = Boolean(el['iconOnly'])
  const isDisabled  = Boolean(el['disabled'])
  const childActions = (el.children ?? []).filter(c => c.type === 'action')

  const className = actionButtonClass(el, {}) + (isDisabled ? ' opacity-50 cursor-not-allowed pointer-events-none' : '')
  const ariaLabel = iconOnly ? label : undefined

  // Direct-dispatch path mirrors renderAction's branches but skipping
  // confirm/modal (those queue into `pending` so the dropdown can close).
  const dispatch = (action: ElementMeta): void => {
    const href        = action['href']        as string | undefined
    const method      = action['method']      as 'post' | 'put' | 'patch' | 'delete' | undefined
    const actionUrl   = action['action']      as string | undefined
    const dispatchUrl = action['dispatchUrl'] as string | undefined
    if (href) {
      navigate(href)
      return
    }
    if (method && actionUrl) {
      void dispatchMethodAction(actionUrl, method, navigate, notify)
      return
    }
    if (dispatchUrl) {
      void dispatchHandlerAction(dispatchUrl, ids, navigate, notify)
      return
    }
  }

  const onItemClick = (action: ElementMeta): void => {
    if (action['modal'] || action['confirm']) {
      setPending(action)
      return
    }
    dispatch(action)
  }

  const pendingHandler     = pending && pending['dispatchUrl']
  const pendingConfirmOnly = pending && !pendingHandler && (pending['confirm'] as { title?: string; message: string } | undefined)
  const pendingConfirm     = pendingConfirmOnly || (pending?.['confirm'] as { title?: string; message: string } | undefined)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(props) => withTooltip(
            <button
              {...props}
              type="button"
              className={className}
              data-action-group-name={name}
              aria-label={ariaLabel}
            >
              {iconOnly ? null : <span>{label}</span>}
            </button>,
            tooltip,
          ) as React.ReactElement}
        />
        <DropdownMenuContent align="end">
          {childActions.map((a, i) => {
            const itemLabel    = String(a['label'] ?? a['name'] ?? '')
            const destructive  = Boolean(a['destructive'])
            const itemDisabled = Boolean(a['disabled'])
            return (
              <DropdownMenuItem
                key={i}
                destructive={destructive}
                disabled={itemDisabled}
                onClick={() => { if (!itemDisabled) onItemClick(a) }}
              >
                {itemLabel}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modal / handler-style pending — fetch+JSON dispatch via ActionModalDialog. */}
      {pendingHandler && pending && (
        <ActionModalDialog
          meta={pending}
          ids={ids}
          open={true}
          onOpenChange={(o) => { if (!o) setPending(null) }}
        />
      )}

      {/* Form-method confirm — fetch+JSON dispatch via dispatchMethodAction; SPA-navigates on success. */}
      <Dialog
        open={Boolean(pendingConfirmOnly)}
        onOpenChange={(o) => { if (!o) setPending(null) }}
      >
        <DialogContent>
          {pendingConfirmOnly && pendingConfirm && (
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
                    if (action) dispatch(action)
                  }}
                  className={
                    pending && pending['destructive']
                      ? 'inline-flex items-center justify-center rounded-md bg-destructive px-3 h-9 text-sm font-medium text-destructive-foreground hover:bg-destructive/90'
                      : 'inline-flex items-center justify-center rounded-md bg-primary px-3 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90'
                  }
                >
                  {pending && pending['destructive'] ? 'Delete' : 'Confirm'}
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
      const headerActions = (el.children ?? []).filter(c => c.type === 'action' || c.type === 'actionGroup')
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
            {headerActions.map((a, i) => renderActionLike(a, i))}
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

    case 'actionGroup':
      return <ActionGroupTrigger key={index} el={el} />

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

    default:
      return null
  }
}

// ─── Form ───────────────────────────────────────────────────

function FormRenderer({ el }: { el: ElementMeta }) {
  const formId = String(el['formId'] ?? '')
  const method = String(el['method'] ?? 'post').toLowerCase()
  const action = el['action'] ? String(el['action']) : undefined
  const serverValues = (el['values'] as Record<string, unknown> | undefined) ?? {}
  const serverErrors = (el['errors'] as Record<string, string[]> | undefined) ?? {}

  // Methods other than GET/POST are spoofed via _method, mirroring Laravel.
  const httpMethod = method === 'get' ? 'get' : 'post'
  const spoofedMethod = method !== 'get' && method !== 'post' ? method : undefined

  const navigate = useNavigate()
  const { notify } = useToast()

  // Client-side errors override server-rendered ones after a fetch-mode
  // 422 response. Field values stay uncontrolled — the inputs in the DOM
  // still hold whatever the user typed, so we don't need to mirror them.
  const [clientErrors, setClientErrors] = useState<Record<string, string[]> | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const errors = clientErrors ?? serverErrors

  const formErrors = errors['_form'] ?? []
  const hasFieldErrors = Object.keys(errors).some(k => k !== '_form')

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    if (!action) return                       // no action URL → fall through to native submit
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setClientErrors(null)

    try {
      const fd = new FormData(e.currentTarget)
      const res = await fetch(action, {
        method:  'POST',
        headers: { 'Accept': 'application/json' },
        body:    fd,
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 422) {
        const next = (data as { errors?: Record<string, string[]> }).errors ?? {}
        setClientErrors(next)
        // Surface a banner-level message if no field errors were returned
        // — the form-level _form key lights up the existing banner.
        setSubmitting(false)
        return
      }
      if (!res.ok) {
        const message = String((data as { error?: string }).error ?? `Request failed (${res.status})`)
        notify({ type: 'error', title: 'Save failed', body: message })
        setSubmitting(false)
        return
      }

      // Success — drain notifications and SPA-navigate to the redirect.
      const notifs = (data as { notifications?: NotificationMeta[] }).notifications
      if (notifs && notifs.length > 0) for (const n of notifs) notify(n)
      const redirect = String((data as { redirect?: string }).redirect ?? '')
      // Skip navigate when the redirect is the current URL — re-fetching
      // the same page would force a form remount (formId changes per
      // server render) and reset scroll. The user's input is already on
      // screen; the toast confirms the save. Only navigate when the URL
      // actually differs (e.g. create → redirect to /edit/{newId}).
      const currentUrl = typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : ''
      if (redirect && redirect !== currentUrl) {
        navigate(redirect)
        // Don't reset submitting on success — the navigation will unmount us.
      } else {
        setSubmitting(false)
      }
    } catch (err) {
      notify({ type: 'error', title: 'Save failed', body: err instanceof Error ? err.message : String(err) })
      setSubmitting(false)
    }
  }

  return (
    <form
      id={formId || undefined}
      data-form-id={formId || undefined}
      method={httpMethod}
      action={action}
      onSubmit={onSubmit}
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
      {(el.children ?? []).map((child, i) => renderFormChild(child, i, serverValues, errors))}
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

/** Lucide icon registry for IconColumn / BooleanColumn. Unknown names fall
 * back to `CircleIcon`. Add to this map when a new icon name shows up
 * in user code; or wire dynamic loading later. */
const ICON_REGISTRY: Record<string, LucideIcon> = {
  'check':            CheckIcon,
  'check-circle':     CheckCircle2Icon,
  'check-circle-2':   CheckCircle2Icon,
  'circle':           CircleIcon,
  'x':                XIcon,
  'x-circle':         XCircleIcon,
  'shield-check':     ShieldCheckIcon,
  'user':             UserIcon,
  'star':             StarIcon,
  'eye':              EyeIcon,
  'eye-off':          EyeOffIcon,
  'inbox':            InboxIcon,
  'bell':             BellIcon,
  'mail':             MailIcon,
}

/** Map ColumnColor → tailwind text-color class. Used by TextColumn and
 * IconColumn alike. */
const COLUMN_COLOR_CLASSES: Record<string, string> = {
  default:     '',
  muted:       'text-muted-foreground',
  primary:     'text-primary',
  destructive: 'text-destructive',
  success:     'text-emerald-600 dark:text-emerald-400',
  warning:     'text-amber-600 dark:text-amber-400',
  info:        'text-blue-600 dark:text-blue-400',
}

const COLUMN_WEIGHT_CLASSES: Record<string, string> = {
  normal:   'font-normal',
  medium:   'font-medium',
  semibold: 'font-semibold',
  bold:     'font-bold',
}

const BADGE_COLOR_CLASSES: Record<string, string> = {
  gray:        'bg-muted text-muted-foreground',
  primary:     'bg-primary/10 text-primary',
  success:     'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  warning:     'bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-200',
  destructive: 'bg-destructive/10 text-destructive',
  info:        'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
}

/** Apply a built-in `ColumnFormat` to a raw value; returns a string. */
function applyColumnFormat(value: unknown, format: { kind: string; [k: string]: unknown }): string {
  if (value === null || value === undefined || value === '') return ''
  switch (format['kind']) {
    case 'dateTime': {
      const d = value instanceof Date ? value : new Date(String(value))
      if (isNaN(d.getTime())) return String(value)
      // Default — locale-aware short date+time. Custom patterns aren't
      // supported (no date-fns dep); pattern is kept on meta for future use.
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    }
    case 'since': {
      const d = value instanceof Date ? value : new Date(String(value))
      if (isNaN(d.getTime())) return String(value)
      const seconds = Math.round((Date.now() - d.getTime()) / 1000)
      const abs = Math.abs(seconds)
      const past = seconds >= 0
      const fmt = (n: number, unit: string): string =>
        past ? `${n} ${unit}${n === 1 ? '' : 's'} ago` : `in ${n} ${unit}${n === 1 ? '' : 's'}`
      if (abs < 60)        return past ? 'just now' : 'in a moment'
      if (abs < 3600)      return fmt(Math.floor(abs / 60),    'minute')
      if (abs < 86400)     return fmt(Math.floor(abs / 3600),  'hour')
      if (abs < 2592000)   return fmt(Math.floor(abs / 86400), 'day')
      if (abs < 31536000)  return fmt(Math.floor(abs / 2592000), 'month')
      return fmt(Math.floor(abs / 31536000), 'year')
    }
    case 'money': {
      const n = typeof value === 'number' ? value : Number(value)
      if (isNaN(n)) return String(value)
      const currency = String(format['currency'] ?? 'USD')
      const locale   = format['locale'] as string | undefined
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n)
    }
    case 'numeric': {
      const n = typeof value === 'number' ? value : Number(value)
      if (isNaN(n)) return String(value)
      const decimals = format['decimals'] as number | undefined
      const locale   = format['locale']   as string | undefined
      const opts: Intl.NumberFormatOptions = {}
      if (decimals !== undefined) {
        opts.minimumFractionDigits = decimals
        opts.maximumFractionDigits = decimals
      }
      return new Intl.NumberFormat(locale, opts).format(n)
    }
    case 'limit': {
      const s = String(value)
      const n = format['chars'] as number
      return s.length > n ? s.slice(0, n) + '…' : s
    }
    default:
      return String(value)
  }
}

/** Render a cell. Honors the column's `columnType` (badge/icon/boolean/
 * image), built-in `format` spec, and per-row `_formatted[name]`
 * overrides from server-side `formatStateUsing` callbacks. */
function formatCell(
  value: unknown,
  col?:  ElementMeta,
  row?:  Record<string, unknown>,
): React.ReactNode {
  if (col === undefined) {
    // Legacy raw-value fallback for non-column callsites.
    if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
    if (value instanceof Date)               return value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    if (typeof value === 'boolean')          return value ? 'Yes' : 'No'
    if (typeof value === 'object')           return JSON.stringify(value)
    return String(value)
  }

  const columnType = String(col['columnType'] ?? 'text')
  const fallback   = (col['default'] as string | undefined)

  // Per-row server-eval result wins over everything.
  const formatted  = (row?.['_formatted'] as Record<string, string> | undefined)?.[String(col['name'] ?? '')]
  const isBlank    = value === null || value === undefined || value === ''

  if (formatted !== undefined && formatted !== '') {
    return wrapCell(formatted, col)
  }
  if (isBlank) {
    return <span className="text-muted-foreground">{fallback ?? '—'}</span>
  }

  switch (columnType) {
    case 'badge': {
      const map  = (col['badgeColors'] as Record<string, string> | undefined) ?? {}
      const color = map[String(value)] ?? 'gray'
      const cls  = BADGE_COLOR_CLASSES[color] ?? BADGE_COLOR_CLASSES['gray']
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
          {String(value)}
        </span>
      )
    }
    case 'icon':
    case 'boolean': {
      const map  = (col['iconOptions'] as Record<string, { icon: string; color?: string }> | undefined) ?? {}
      const opt  = map[String(value)]
      if (!opt) return <span className="text-muted-foreground">—</span>
      const Icon = ICON_REGISTRY[opt.icon] ?? CircleIcon
      const colorClass = opt.color ? (COLUMN_COLOR_CLASSES[opt.color] ?? '') : ''
      return <Icon className={`size-4 inline ${colorClass}`} aria-label={String(value)} />
    }
    case 'image': {
      const url = String(value)
      const size = (col['imageSize'] as number | undefined) ?? 32
      const shape = col['imageShape'] === 'circle' ? 'rounded-full' : 'rounded-md'
      return (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          className={`${shape} object-cover`}
        />
      )
    }
    default: {
      // Text column — apply built-in format, then wrapper.
      const fmt = col['format'] as { kind: string; [k: string]: unknown } | undefined
      const display = fmt ? applyColumnFormat(value, fmt) : String(value)
      return wrapCell(display, col)
    }
  }
}

/** Apply text-rendering chrome (color, weight, line-clamp, wrap, tooltip)
 * to a stringified cell value. Used by the text and per-row formatter
 * paths so styling stays consistent. */
function wrapCell(content: string, col: ElementMeta): React.ReactNode {
  const color    = col['color']    as string | undefined
  const weight   = col['weight']   as string | undefined
  const tooltip  = col['tooltip']  as string | undefined
  const wrapping = Boolean(col['wrap'])
  const clamp    = col['lineClamp'] as number | undefined

  const colorCls   = color  ? (COLUMN_COLOR_CLASSES[color]  ?? '') : ''
  const weightCls  = weight ? (COLUMN_WEIGHT_CLASSES[weight] ?? '') : ''
  const wrapCls    = wrapping ? 'whitespace-normal' : ''
  const clampStyle = clamp !== undefined
    ? { display: '-webkit-box', WebkitLineClamp: String(clamp), WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
    : undefined

  const node = (
    <span
      className={`${colorCls} ${weightCls} ${wrapCls}`.trim()}
      title={tooltip}
      style={clampStyle}
    >
      {content}
    </span>
  )
  return node
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
  const navigate = useNavigate()
  const children = el.children ?? []
  const columns  = children.filter(c => c.type === 'column')
  // Actions and ActionGroups share placement — both show up in the
  // header/bulk/row toolbars depending on their `placement` field.
  const actionLike = children.filter(c => c.type === 'action' || c.type === 'actionGroup')
  const filters    = children.filter(c => c.type === 'filter')
  const hasRecordUrl = Boolean(el['recordUrl'])

  // Group actions by placement. `inline` defaults to header so it shows up
  // somewhere visible — explicit placements always win.
  const placementOf = (a: ElementMeta): string => String(a['placement'] ?? 'inline')
  const headerActions = actionLike.filter(a => { const p = placementOf(a); return p === 'header' || p === 'inline' })
  const bulkActions   = actionLike.filter(a => placementOf(a) === 'bulk')
  const rowActions    = actionLike.filter(a => placementOf(a) === 'row')

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

  // Top-bar chrome (heading / description / striped / emptyState).
  const tableHeading     = el['heading']     as string | undefined
  const tableDescription = el['description'] as string | undefined
  const striped          = Boolean(el['striped'])
  const emptyState       = el['emptyState']  as { heading?: string; description?: string; icon?: string } | undefined
  const hasFilterOrSearch = (search !== undefined && search !== '') ||
    Object.keys(activeFilters).length > 0
  const EmptyIcon = emptyState?.icon ? (ICON_REGISTRY[emptyState.icon] ?? InboxIcon) : InboxIcon

  return (
    <div className="flex flex-col gap-3">
      {(tableHeading || tableDescription) && (
        <div className="flex flex-col gap-1">
          {tableHeading && <h2 className="text-lg font-semibold">{tableHeading}</h2>}
          {tableDescription && <p className="text-sm text-muted-foreground">{tableDescription}</p>}
        </div>
      )}
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
              {headerActions.map((a, i) => renderActionLike(a, i))}
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
              renderActionLike(a, i, { ids: Array.from(selected) }),
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
                <TableCell colSpan={totalCols} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <EmptyIcon className="size-8 opacity-60" />
                    <p className="text-base font-medium text-foreground">
                      {emptyState?.heading
                        ?? (hasFilterOrSearch ? 'No matching records' : 'No records yet')}
                    </p>
                    {(emptyState?.description ||
                      (hasFilterOrSearch && !emptyState?.description)) && (
                      <p className="text-sm">
                        {emptyState?.description
                          ?? 'Try clearing filters or adjusting your search.'}
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.map((row, ri) => {
              const id = visibleIds[ri]!
              const recordObj = row as Record<string, unknown>
              const isSelected = selected.has(id)
              const stripedClass = striped && ri % 2 === 1 ? 'bg-muted/30' : ''
              // Per-row navigation URL stamped server-side by
              // `Table.recordUrl(fn)` → `loadTableRecords` → `_recordUrl`.
              // Cells with their own interactive content (bulk checkbox,
              // actions menu) carry `data-no-row-nav` so clicks there
              // don't double-fire as a row navigation.
              const recordUrl = hasRecordUrl ? (recordObj['_recordUrl'] as string | undefined) : undefined
              const rowClickable = recordUrl !== undefined
              const rowClassName = `${stripedClass}${rowClickable ? ' cursor-pointer' : ''}`.trim()
              const onRowClick: React.MouseEventHandler<HTMLTableRowElement> | undefined = rowClickable
                ? (e) => {
                    if ((e.target as HTMLElement).closest('[data-no-row-nav]')) return
                    navigate(recordUrl)
                  }
                : undefined
              return (
                <TableRow
                  key={id}
                  data-state={isSelected ? 'selected' : undefined}
                  className={rowClassName || undefined}
                  onClick={onRowClick}
                >
                  {hasBulkActions && (
                    <TableCell className="w-9 px-3" data-no-row-nav>
                      <Checkbox
                        aria-label={`Select row ${id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(id)}
                      />
                    </TableCell>
                  )}
                  {columns.map((col, ci) => {
                    const name = String(col['name'] ?? '')
                    const value = recordObj[name]
                    const align = col['alignment'] === 'center' ? 'text-center'
                                : col['alignment'] === 'end'    ? 'text-right'
                                : 'text-left'
                    const widthStyle = col['width']
                      ? { width: String(col['width']) }
                      : undefined
                    return (
                      <TableCell key={ci} className={`text-sm text-foreground ${align}`} style={widthStyle}>
                        {formatCell(value, col, recordObj)}
                      </TableCell>
                    )
                  })}
                  {hasRowActions && (
                    <TableCell className="w-px text-right" data-no-row-nav>
                      {renderRowActions(id, recordObj, rowActions)}
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
