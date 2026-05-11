import React, { useEffect, useRef, useState } from 'react'
import type { ElementMeta } from '../schema/Element.js'
import { getFieldRenderer } from './registry.js'
import { getFieldLabelSlot } from './FieldLabelSlotRegistry.js'
import { FormStateProvider, useFormState, FormIdContext } from './FormStateContext.js'
import { Checkbox } from './ui/checkbox.js'
import { Input } from './ui/input.js'
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover.js'
import { FieldShell } from './fields/FieldShell.js'
import { TextLikeInput }     from './fields/TextLikeInput.js'
import { useTextInputControls } from './fields/textInputControls.js'
import { SelectFieldInput }  from './fields/SelectFieldInput.js'
import { ToggleFieldInput }  from './fields/ToggleFieldInput.js'
import { DateFieldInput }    from './fields/DateFieldInput.js'
import { HiddenInput }       from './fields/HiddenInput.js'
import { CheckboxInput }     from './fields/CheckboxInput.js'
import { RadioInput }        from './fields/RadioInput.js'
import { ToggleButtonsInput } from './fields/ToggleButtonsInput.js'
import { CheckboxListInput } from './fields/CheckboxListInput.js'
import { SliderInput }       from './fields/SliderInput.js'
import { ColorInput }        from './fields/ColorInput.js'
import { DateTimeInput }     from './fields/DateTimeInput.js'
import { KeyValueInput }     from './fields/KeyValueInput.js'
import { TagsInput }         from './fields/TagsInput.js'
import { FileUploadInput }   from './fields/FileUploadInput.js'
import { MarkdownInput }     from './fields/MarkdownInput.js'
import { RepeaterInput }     from './fields/RepeaterInput.js'
import { BuilderInput }      from './fields/BuilderInput.js'
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
  TableFooter,
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
  CalendarIcon, FilterIcon, MoreHorizontalIcon,
  CircleIcon, InboxIcon, GripVerticalIcon,
  ChevronDownIcon, CopyIcon, CheckIcon, XIcon,
  Columns3Icon,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useNavigate, type NavigateFn } from './navigate.js'
import {
  parseDateRangeValue,
  encodeDateRangeValue,
} from '../filters/DateRangeFilter.js'
import {
  parseMultiSelectValue,
  encodeMultiSelectValue,
} from '../filters/MultiSelectFilter.js'
import { encodeFormFilterValue } from '../filters/FormFilter.js'
import {
  parseQueryBuilderValue,
  encodeQueryBuilderValue,
  isQueryBuilderTree,
  type QueryBuilderRule,
  type QueryBuilderTree,
  type QueryBuilderTreeChild,
} from '../filters/QueryBuilderFilter.js'
import type {
  ConstraintMeta,
  ConstraintOperator,
  ConstraintOperatorName,
  ConstraintValueKind,
} from '../filters/queryBuilder/Constraint.js'
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

// ─── Field rendering ────────────────────────────────────────
//
// Each input lives in its own file under `react/fields/`. This file
// stays a thin dispatcher: parse meta → pick component → wrap in
// `<FieldShell>`.

function renderField(el: ElementMeta, index: number): React.ReactNode {
  const fieldType   = String(el['fieldType'] ?? 'text')
  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const required    = Boolean(el['required'])
  const disabled    = Boolean(el['disabled'])
  const placeholder = el['placeholder'] ? String(el['placeholder']) : undefined
  const defaultValue = el['defaultValue']
  const defaultStr = defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : undefined

  // Hidden fields render bare — no label, no shell, no chrome. Bail
  // before the renderField switch + FieldShell wrap.
  if (fieldType === 'hidden') {
    return <HiddenInput key={index} name={name} defaultValue={defaultValue} />
  }

  // Field label slot — rendered next to the label when a plugin registered
  // a component via registerFieldLabelSlot() and the field has aiActions +
  // _agentRunBase stamped on its meta (set by tagFieldAiUrls in pageData).
  const LabelSlot = getFieldLabelSlot()
  const aiActions = Array.isArray(el['aiActions']) ? el['aiActions'] as Array<{ slug: string; label: string; icon?: string }> : undefined
  const agentRunBase = typeof el['_agentRunBase'] === 'string' ? el['_agentRunBase'] : undefined
  const labelSlot = (LabelSlot && aiActions?.length && agentRunBase)
    ? <LabelSlot fieldName={name} actions={aiActions} agentRunBase={agentRunBase} />
    : undefined

  const autofocus = el['autofocus'] === true
  const extraInput = el['extraInputAttributes'] as Record<string, string | number | boolean> | undefined
  const common = {
    id: name,
    name,
    disabled,
    placeholder,
    required,
    ...(defaultStr !== undefined ? { defaultValue: defaultStr } : {}),
    ...(autofocus ? { autoFocus: true } : {}),
    ...(extraInput ?? {}),
  }

  // External packages (e.g. @pilotiq/tiptap) register custom renderers
  // for non-built-in fieldTypes. The registry wins over the built-in
  // switch so consumers can override built-ins too if they want.
  const Custom = getFieldRenderer(fieldType)
  if (Custom) {
    return (
      <FieldShell key={index} el={el} name={name} label={label} required={required} labelSlot={labelSlot}>
        <Custom
          el={el}
          name={name}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
        />
      </FieldShell>
    )
  }

  // TextField (and slug) rich affordances live in a dedicated shell so
  // `useTextInputControls` can hold reveal-toggle / mask state via React
  // hooks (renderField itself is a plain function, hooks would violate
  // rules-of-hooks here).
  if (fieldType === 'text' || fieldType === 'slug') {
    return (
      <TextFieldShell
        key={index}
        el={el}
        name={name}
        label={label}
        required={required}
        common={common}
        labelSlot={labelSlot}
      />
    )
  }

  const input = renderFieldInput(fieldType, el, name, defaultValue, defaultStr, common, disabled, required, placeholder)

  return (
    <FieldShell key={index} el={el} name={name} label={label} required={required} labelSlot={labelSlot}>
      {input}
    </FieldShell>
  )
}

/**
 * Component-shape TextField renderer — wraps the input shell so we can
 * use `useTextInputControls()` (which holds the eye-toggle / mask state).
 * Keeps `renderField` itself hook-free.
 */
function TextFieldShell({
  el, name, label, required, common, labelSlot,
}: {
  el:          ElementMeta
  name:        string
  label:       string
  required:    boolean
  common:      Record<string, unknown>
  labelSlot?:  React.ReactNode
}): React.ReactElement {
  const controls = useTextInputControls(el, name, (m) => renderElement(m, 0))

  // Build the input with all the new HTML attrs (inputMode /
  // autocapitalize / list / maxLength + the password/text type from
  // the controls hook).
  const textExtra: Record<string, unknown> = {}
  if (el['maxLength']      !== undefined) textExtra['maxLength']      = Number(el['maxLength'])
  if (el['inputMode']      !== undefined) textExtra['inputMode']      = String(el['inputMode'])
  if (el['autocapitalize'] !== undefined) textExtra['autoCapitalize'] = String(el['autocapitalize'])
  if (Array.isArray(el['datalist'])) textExtra['list'] = `${name}__datalist`

  const datalist = Array.isArray(el['datalist']) ? (el['datalist'] as string[]) : undefined

  const input = (
    <>
      <TextLikeInput
        el={el}
        name={name}
        common={common}
        type={controls.type}
        extraProps={textExtra}
        multiline={false}
        applyMask={controls.applyMask}
      />
      {datalist && (
        <datalist id={`${name}__datalist`}>
          {datalist.map((v, i) => <option key={i} value={v} />)}
        </datalist>
      )}
    </>
  )

  return (
    <FieldShell
      el={el}
      name={name}
      label={label}
      required={required}
      before={controls.before}
      after={controls.after}
      labelSlot={labelSlot}
    >
      {input}
    </FieldShell>
  )
}

function renderFieldInput(
  fieldType:    string,
  el:           ElementMeta,
  name:         string,
  defaultValue: unknown,
  defaultStr:   string | undefined,
  common:       Record<string, unknown>,
  disabled:     boolean,
  required:     boolean,
  placeholder:  string | undefined,
): React.ReactNode {
  switch (fieldType) {
    case 'textarea': {
      const autosize = el['autosize'] === true
      const cols     = typeof el['cols'] === 'number' ? Number(el['cols']) : undefined
      const extra: Record<string, unknown> = {}
      // `field-sizing-content` on the Textarea component already grows
      // the box with content; `autosize()` just unsets the explicit
      // `rows` so the browser doesn't reserve a fixed minimum height.
      if (!autosize) extra['rows'] = Number(el['rows']) || 4
      if (cols !== undefined) extra['cols'] = cols
      if (el['disableGrammarly'] === true) {
        extra['data-gramm']             = 'false'
        extra['data-gramm_editor']      = 'false'
        extra['data-enable-grammarly']  = 'false'
      }
      return (
        <TextLikeInput
          el={el}
          name={name}
          common={common}
          type="text"
          extraProps={extra}
          multiline
        />
      )
    }

    case 'select': {
      const options = (el['options'] as Array<{ value: string; label: string; disabled?: boolean }>) ?? []
      const createOption = el['createOption'] as { formId: string; schema: ElementMeta[]; url?: string } | undefined
      const fieldLabel   = String(el['label'] ?? name)
      return (
        <SelectFieldInput
          name={name}
          defaultValue={defaultStr}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          options={options}
          fieldLabel={fieldLabel}
          {...(createOption ? { createOption } : {})}
        />
      )
    }

    case 'toggle': {
      const initialChecked = defaultValue === true || defaultValue === 'true' || defaultValue === 1 || defaultValue === '1'
      return <ToggleFieldInput name={name} defaultChecked={initialChecked} disabled={disabled} />
    }

    case 'checkbox': {
      const initialChecked = defaultValue === true || defaultValue === 'true' || defaultValue === 1 || defaultValue === '1'
      return <CheckboxInput name={name} defaultChecked={initialChecked} disabled={disabled} />
    }

    case 'radio': {
      const options = (el['options'] as Array<{ value: string; label: string; disabled?: boolean }>) ?? []
      const inline  = Boolean(el['inline'])
      return (
        <RadioInput
          name={name}
          defaultValue={defaultStr}
          disabled={disabled}
          options={options}
          inline={inline}
        />
      )
    }

    case 'toggleButtons': {
      const options = (el['options'] as Array<{ value: string; label: string; disabled?: boolean }>) ?? []
      return (
        <ToggleButtonsInput
          name={name}
          defaultValue={defaultStr}
          disabled={disabled}
          options={options}
        />
      )
    }

    case 'checkboxList': {
      const options = (el['options'] as Array<{ value: string; label: string; disabled?: boolean }>) ?? []
      const columns = Number(el['columns']) || 1
      return (
        <CheckboxListInput
          name={name}
          defaultValue={defaultValue}
          disabled={disabled}
          options={options}
          columns={columns}
        />
      )
    }

    case 'slider': {
      return (
        <SliderInput
          name={name}
          defaultValue={defaultValue}
          disabled={disabled}
          min={Number(el['min'])  ||   0}
          max={Number(el['max'])  || 100}
          step={Number(el['step']) || 1}
          showValue={Boolean(el['showValue'])}
        />
      )
    }

    case 'color': {
      return (
        <ColorInput
          name={name}
          defaultValue={defaultValue}
          disabled={disabled}
        />
      )
    }

    case 'keyValue': {
      return (
        <KeyValueInput
          name={name}
          defaultValue={defaultValue}
          disabled={disabled}
          keyLabel={String(el['keyLabel'] ?? 'Key')}
          valueLabel={String(el['valueLabel'] ?? 'Value')}
          addLabel={String(el['addLabel'] ?? 'Add row')}
          reorderable={Boolean(el['reorderable'])}
        />
      )
    }

    case 'tagsInput': {
      const suggestions = (el['suggestions'] as string[] | undefined) ?? []
      // separator: omitted → ',' (default); explicit null → null (disabled).
      const separator = 'separator' in el
        ? (el['separator'] as string | null)
        : ','
      const splitKeys = (el['splitKeys'] as string[] | undefined) ?? ['Enter']
      const maxTags   = typeof el['maxTags'] === 'number' ? el['maxTags'] as number : null
      const reorderable = Boolean(el['reorderable'])
      return (
        <TagsInput
          name={name}
          defaultValue={defaultValue}
          disabled={disabled}
          placeholder={placeholder}
          suggestions={suggestions}
          separator={separator}
          splitKeys={splitKeys}
          maxTags={maxTags}
          reorderable={reorderable}
        />
      )
    }

    case 'fileUpload': {
      return (
        <FileUploadInput
          name={name}
          defaultValue={defaultValue}
          disabled={disabled}
          accept={el['accept'] as string[] | undefined}
          maxSize={typeof el['maxSize'] === 'number' ? el['maxSize'] : undefined}
          multiple={Boolean(el['multiple'])}
          preview={el['preview'] !== false}
          directory={typeof el['directory'] === 'string' ? el['directory'] : undefined}
          uploadUrl={typeof el['uploadUrl'] === 'string' ? el['uploadUrl'] : undefined}
          downloadable={Boolean(el['downloadable'])}
          openable={Boolean(el['openable'])}
          reorderable={Boolean(el['reorderable'])}
          appendFiles={Boolean(el['appendFiles'])}
          panelLayout={
            el['panelLayout'] === 'grid' ? 'grid'
            : el['panelLayout'] === 'integrated' ? 'integrated'
            : 'list'
          }
          {...(el['automaticallyResize'] && typeof el['automaticallyResize'] === 'object'
            ? { automaticallyResize: el['automaticallyResize'] as { width: number; height: number } }
            : {})}
          imageEditor={Boolean(el['imageEditor'])}
          circleCropper={Boolean(el['circleCropper'])}
          automaticallyCropImagesToAspectRatio={Boolean(el['automaticallyCropImagesToAspectRatio'])}
          {...(Array.isArray(el['imageEditorAspectRatioOptions'])
            ? { imageEditorAspectRatioOptions: el['imageEditorAspectRatioOptions'] as Array<{ ratio: number; label: string }> }
            : {})}
        />
      )
    }

    case 'markdown': {
      const toolbarButtons = (el['toolbarButtons'] as Array<
        'bold' | 'italic' | 'strike' | 'link' | 'heading' | 'bulletList'
        | 'orderedList' | 'blockquote' | 'codeBlock' | 'attachFiles'
      > | undefined) ?? []
      return (
        <MarkdownInput
          name={name}
          defaultValue={defaultValue}
          disabled={disabled}
          placeholder={placeholder}
          toolbarButtons={toolbarButtons}
          minHeight={typeof el['minHeight'] === 'string' ? el['minHeight'] : undefined}
          maxHeight={typeof el['maxHeight'] === 'string' ? el['maxHeight'] : undefined}
          fileAttachmentsDirectory={typeof el['fileAttachmentsDirectory'] === 'string' ? el['fileAttachmentsDirectory'] : undefined}
          fileAttachmentsVisibility={typeof el['fileAttachmentsVisibility'] === 'string' ? el['fileAttachmentsVisibility'] : undefined}
          uploadUrl={typeof el['uploadUrl'] === 'string' ? el['uploadUrl'] : undefined}
        />
      )
    }

    case 'repeater':
      return <RepeaterInput el={el} name={name} disabled={disabled} />

    case 'builder':
      return <BuilderInput el={el} name={name} disabled={disabled} />

    case 'dateTime': {
      // Normalize various input shapes to YYYY-MM-DDTHH:mm.
      let local: string | undefined
      if (defaultValue instanceof Date) {
        local = isNaN(defaultValue.getTime())
          ? undefined
          : defaultValue.toISOString().slice(0, 16)
      } else if (typeof defaultValue === 'string' && defaultValue) {
        const parsed = new Date(defaultValue)
        local = isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 16)
      }
      return (
        <DateTimeInput
          name={name}
          defaultValue={local}
          disabled={disabled}
          placeholder={placeholder}
        />
      )
    }

    case 'number': {
      const numProps: Record<string, unknown> = {}
      if (el['min']  !== undefined) numProps['min']  = Number(el['min'])
      if (el['max']  !== undefined) numProps['max']  = Number(el['max'])
      if (el['step'] !== undefined) numProps['step'] = Number(el['step'])
      return (
        <TextLikeInput
          el={el}
          name={name}
          common={common}
          type="number"
          extraProps={numProps}
          multiline={false}
        />
      )
    }

    case 'email':
      return (
        <TextLikeInput
          el={el}
          name={name}
          common={common}
          type="email"
          extraProps={{}}
          multiline={false}
        />
      )

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
      return (
        <DateFieldInput
          name={name}
          defaultValue={iso}
          disabled={disabled}
          placeholder={placeholder}
        />
      )
    }

    case 'slug':
    case 'text':
    default: {
      const textExtra: Record<string, unknown> = {}
      if (el['maxLength'] !== undefined) textExtra['maxLength'] = Number(el['maxLength'])
      return (
        <TextLikeInput
          el={el}
          name={name}
          common={common}
          type="text"
          extraProps={textExtra}
          multiline={false}
        />
      )
    }
  }
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
export async function dispatchHandlerAction(
  url:      string,
  ids:      string[],
  navigate: Navigate,
  notify:   Notify,
  values:   Record<string, string> = {},
  formSnapshot?: FormData,
): Promise<void> {
  try {
    // When `formSnapshot` is set (Repeater / Builder `extraItemActions`
    // dispatch), the snapshot already carries the form's full state — we
    // just append `ids` / `values` on top so the server sees both the
    // form body (for coerceFormValues + row hydration) and the action's
    // own meta keys.
    const fd = formSnapshot ?? new FormData()
    for (const id of ids) fd.append('ids', id)
    for (const [k, v] of Object.entries(values)) fd.append(k, v)
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Accept': 'application/json' },
      body:    fd,
    })
    // Download branch — handlers that return `{ download }` ask the server
    // to write the body inline with `Content-Disposition: attachment`. Trip
    // a browser download via a synthetic `<a download>` and exit early
    // (no notify drain / no SPA-nav — the file IS the success signal).
    if (res.ok && triggerDownloadIfAttachment(res)) {
      await res.blob().then(triggerBlobDownload(res))
      return
    }
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

/** Returns true when the response carries `Content-Disposition: attachment`,
 *  which is how the route layer signals a download payload. The header
 *  match is case-insensitive (different runtimes normalize differently). */
function triggerDownloadIfAttachment(res: Response): boolean {
  const cd = res.headers.get('Content-Disposition') ?? res.headers.get('content-disposition') ?? ''
  return cd.toLowerCase().includes('attachment')
}

/** Returns a closure that converts the blob into a download by clicking
 *  a synthetic `<a download="…">`. Filename is parsed from
 *  `Content-Disposition`'s `filename="…"` parameter; falls back to
 *  `'download'` when missing. Only mounted when `document` is present
 *  (no-op in SSR). */
function triggerBlobDownload(res: Response): (blob: Blob) => void {
  const cd = res.headers.get('Content-Disposition') ?? res.headers.get('content-disposition') ?? ''
  const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)
  const filename = (match?.[1] ?? 'download').trim()
  return (blob) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objUrl)
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

  const modal       = meta['modal']    as {
    heading?:     string
    description?: string
    submitLabel?: string
    cancelLabel?: string
    icon?:        string
    iconColor?:   'gray'|'primary'|'success'|'warning'|'destructive'|'info'
    width?:       'sm'|'md'|'lg'|'xl'
    alignment?:   'start'|'center'|'end'
    slideOver?:   boolean
    closeByClickingAway?: boolean
    closeByEscaping?:     boolean
    stickyHeader?:        boolean
    stickyFooter?:        boolean
    autofocus?:           boolean
    closeButton?:         boolean
  } | undefined
  const confirm     = meta['confirm']  as { title?: string; message: string } | undefined
  const destructive = Boolean(meta['destructive'])
  const dispatchUrl = meta['dispatchUrl'] as string | undefined
  const fields      = (meta.children ?? []) as ElementMeta[]
  const hasForm     = fields.length > 0
  // Filament v5 — auxiliary Elements stamped by the resolver between
  // the body and the footer (Alert / Text / Heading / Action / …).
  const contentFooter = (meta['modalContentFooter'] ?? []) as ElementMeta[]

  const heading     = modal?.heading ?? confirm?.title ?? (hasForm ? String(meta['label'] ?? 'Submit') : 'Are you sure?')
  const description = modal?.description ?? confirm?.message
  const submitLabel = modal?.submitLabel ?? (destructive ? 'Delete' : (hasForm ? 'Submit' : 'Confirm'))
  const cancelLabel = modal?.cancelLabel ?? 'Cancel'
  const widthClass  = ({ sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' } as const)[modal?.width ?? 'md']

  // Modal chrome extras (Tier-2 audit gap #2). Defaults match the
  // previous renderer behaviour exactly — sparse meta keys round-trip
  // as `undefined` so existing modals are byte-identical.
  const closeByClickingAway = modal?.closeByClickingAway !== false
  const closeByEscaping     = modal?.closeByEscaping     !== false
  const stickyHeader        = modal?.stickyHeader === true
  const stickyFooter        = modal?.stickyFooter === true
  const showCloseButton     = modal?.closeButton  === true
  const alignmentClass      = ({ start: 'text-left', center: 'text-center sm:text-left', end: 'text-right' } as const)[modal?.alignment ?? 'center']
  const iconColorClass      = modal?.iconColor
    ? ({
        gray:        'text-muted-foreground',
        primary:     'text-primary',
        success:     'text-emerald-600 dark:text-emerald-300',
        warning:     'text-amber-600   dark:text-amber-300',
        destructive: 'text-destructive',
        info:        'text-blue-600    dark:text-blue-300',
      } as const)[modal.iconColor]
    : undefined
  // Existing default: only the submit button autofocuses (and only for
  // confirm-only modals). When `modalAutofocus(false)` is set the user
  // wants nothing to autofocus; `modalAutofocus(true)` shifts focus to
  // the first form input via a mount-effect ref.
  const explicitAutofocus = modal?.autofocus
  const submitAutofocus   = explicitAutofocus === false ? false
                          : explicitAutofocus === true  ? !hasForm
                          : !hasForm
  const formRef = useRef<HTMLFormElement | null>(null)
  useEffect(() => {
    if (!open || explicitAutofocus !== true || !hasForm) return
    // Wait for the popup to mount + fields to render. Microtask is enough
    // because Base UI's mount transition is decoupled from our render.
    const id = window.requestAnimationFrame(() => {
      const form = formRef.current
      if (!form) return
      const target = form.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
      )
      if (target) target.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [open, explicitAutofocus, hasForm])

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

  // Resolved icon component for the modal header (Filament-style chrome
  // — leading glyph next to the heading). Passed through `useIconFor`
  // for the same registry lookup used by Resource / Page / Action icons.
  const HeaderIcon = useIconFor(modal?.icon)

  // Build a className for the popup that respects width + sticky-chrome
  // + slideOver. Sticky modes give the popup a max height + overflow so
  // the inner scroll surface exists for sticky to bite onto.
  const stickyMode  = stickyHeader || stickyFooter
  const popupClass  = [
    widthClass,
    stickyMode ? 'max-h-[90vh] overflow-hidden p-0' : '',
  ].filter(Boolean).join(' ')

  // Inner scroll body (only used in sticky mode). When inactive the
  // existing flat layout applies (header / fields / footer flow).
  const headerCls   = `${alignmentClass} ${stickyHeader ? 'sticky top-0 bg-background z-10 px-6 pt-6 pb-3 border-b' : ''}`.trim()
  const footerCls   = stickyFooter   ? 'sticky bottom-0 bg-background z-10 px-6 py-3 border-t' : ''
  const bodyCls     = stickyMode ? 'flex-1 overflow-y-auto px-6 py-3' : ''
  const formCls     = stickyMode ? 'flex flex-col h-full' : ''

  return (
    <>
      {trigger?.(() => { reset(); setOpen(true) })}
      <Dialog
        open={open}
        disablePointerDismissal={!closeByClickingAway}
        onOpenChange={(o, details) => {
          // Cancel Esc-triggered closes when the user has opted out.
          // Base UI's `details.cancel()` aborts the open-state change.
          if (!o && !closeByEscaping && details && (details as { reason?: string }).reason === 'escapeKey') {
            const cancel = (details as { cancel?: () => void }).cancel
            if (typeof cancel === 'function') cancel()
            return
          }
          if (!o) reset()
          setOpen(o)
        }}
      >
        <DialogContent className={popupClass}>
          {showCloseButton && (
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-20 inline-flex items-center justify-center rounded-md h-8 w-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <XIcon className="size-4" />
            </button>
          )}
          <form ref={formRef} onSubmit={onSubmit} className={formCls}>
            <DialogHeader className={headerCls}>
              <DialogTitle className={modal?.icon ? 'flex items-center gap-2' : undefined}>
                {HeaderIcon && (
                  <HeaderIcon
                    aria-hidden
                    className={`size-5 shrink-0 ${iconColorClass ?? ''}`.trim()}
                  />
                )}
                <span>{heading}</span>
              </DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            {(hasForm || contentFooter.length > 0) && (
              <div className={`flex flex-col gap-3 py-2 ${bodyCls}`.trim()}>
                {fields.map((f, i) => renderFormChild(f, i, initialValues, errors))}
                {contentFooter.map((c, i) => renderElement(c, fields.length + i))}
              </div>
            )}
            {!hasForm && contentFooter.length === 0 && stickyMode && <div className={bodyCls} />}
            {serverError && (
              <p className={`py-2 text-sm text-destructive ${stickyMode ? 'px-6' : ''}`.trim()}>{serverError}</p>
            )}
            <DialogFooter className={footerCls}>
              <button type="button" onClick={() => setOpen(false)} className={cancelClass}>
                {cancelLabel}
              </button>
              <button type="submit" disabled={submitting} autoFocus={submitAutofocus} className={confirmClass}>
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
  if (el.type === 'slotComponent') {
    // Plugin-contributed React mount — render through the main element
    // dispatcher, which looks up the registered component and forwards
    // its serialised props bag. Keeps every action-row slot (heading
    // children, alert footer, empty-state footer, table-toolbar bulk
    // strip) usable as a plugin extension point.
    return renderElement(el, index)
  }
  if (el.type === 'actionGroup') {
    return <ActionGroupTrigger key={index} el={el} ids={opts.ids ?? []} />
  }
  return renderAction(el, index, opts)
}

/** Color preset → tailwind class group. `ghost` is bg-less and works
 * with hover:bg-accent. `destructive` uses a soft tonal style (Filament-
 * style) so per-row Delete buttons sit calmly next to primary actions
 * instead of shouting in saturated red — the modal confirm CTA still
 * renders solid red via its own hardcoded class. Others are solid + hover-
 * darken. */
const COLOR_VARIANTS: Record<string, string> = {
  primary:     'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60',
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

/** Render the action's icon (when set). String names resolve through the
 * user-extensible icon registry; missing names render nothing rather
 * than a fallback glyph (action icons are decorative, not load-bearing). */
function renderActionIcon(el: ElementMeta): React.ReactNode {
  const name = typeof el['icon'] === 'string' ? el['icon'] : undefined
  const Icon = resolveIcon(name)
  if (!Icon) return null
  return <Icon className="size-4" aria-hidden="true" />
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
  // Save button driving a form below). When `formField` is set, the
  // button posts a sentinel name/value pair (e.g. `_continueCreate=1`)
  // so the server can branch on which submit was clicked.
  if (submit) {
    const formTarget = el['form'] as string | undefined
    const formField  = el['formField'] as { name: string; value: string } | undefined
    if (confirm) {
      // Confirm-gated submit: render as type="button" so click opens the
      // dialog instead of submitting; on confirm, programmatically submit
      // the targeted form (or the closest enclosing form if no formTarget).
      // `formField` is intentionally not threaded here — programmatic
      // `requestSubmit()` has no submitter, so the name/value pair would
      // be lost anyway. Pair `.confirm()` with a hidden input on the form
      // if you need a sentinel under a confirm flow.
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
        {...(formField ? { name: formField.name, value: formField.value } : {})}
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

// ─── Tabs (stateful — needs useState) ────────────────────────

/**
 * Active-filters bar — pill row above the table summarising every filter
 * with a current value. Each pill shows the filter's `indicator` text
 * (server-formatted via `Filter.indicator()` / per-subclass defaults) and
 * an `×` button that clears that filter's URL key in place. Clicking ×
 * also drops `?page` so users land on the first page of the relaxed set.
 *
 * Renders nothing when no filter has an indicator.
 */
function ActiveFiltersBar({ filters, prefix }: { filters: ElementMeta[]; prefix?: string | undefined }) {
  const navigate = useNavigate()
  const active   = filters.filter(f => typeof f['indicator'] === 'string' && f['indicator'] !== '')
  if (active.length === 0) return null

  const clear = (name: string): void => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.delete(prefixK(prefix, name))
    url.searchParams.delete(prefixK(prefix, 'page'))
    void navigate(url.pathname + url.search)
  }

  const clearAll = (): void => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    for (const f of active) url.searchParams.delete(prefixK(prefix, String(f['name'] ?? '')))
    url.searchParams.delete(prefixK(prefix, 'page'))
    void navigate(url.pathname + url.search)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {active.map((f, i) => {
        const name      = String(f['name']      ?? '')
        const indicator = String(f['indicator'] ?? '')
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 pl-2.5 pr-1 py-0.5"
          >
            <span>{indicator}</span>
            <button
              type="button"
              onClick={() => clear(name)}
              aria-label={`Clear filter ${indicator}`}
              className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              ×
            </button>
          </span>
        )
      })}
      {active.length > 1 && (
        <button
          type="button"
          onClick={clearAll}
          className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

/**
 * Filter icon button + Popover containing every filter control.
 * Opens on click; the inner Selects don't dismiss the outer Popover when
 * an option is chosen (Base UI Popover doesn't auto-close on inner clicks).
 *
 * Each FilterSelect navigates the page on change (window.location), so the
 * filter form is no longer needed — keeps the search input in its own
 * lightweight form for native Enter-to-submit.
 */
function FilterPopover({ filters, prefix }: { filters: ElementMeta[]; prefix?: string | undefined }) {
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
      <PopoverContent align="start" className={
        filters.some(f => f['kind'] === 'queryBuilder')
          ? 'w-[36rem] max-w-[calc(100vw-2rem)] p-3'
          : 'w-72 p-3'
      }>
        <div className="flex flex-col gap-3">
          {filters.map((f, i) => renderFilterControl(f, i, prefix))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Inline strip of filter controls — used by `Table.filtersLayout('above-content'
 * | 'above-content-collapsible' | 'below-content')`. Mirrors `FilterPopover`'s
 * inner body but lays the controls out in a wrapping row instead of a
 * vertical stack inside a popover.
 */
function FilterStrip({ filters, prefix }: { filters: ElementMeta[]; prefix?: string | undefined }) {
  if (filters.length === 0) return null
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:flex-wrap sm:items-end">
      {filters.map((f, i) => (
        <div key={i} className="min-w-[12rem] flex-1 sm:max-w-xs">
          {renderFilterControl(f, i, prefix)}
        </div>
      ))}
    </div>
  )
}

/**
 * Toolbar button paired with `FilterStrip` for `Table.filtersLayout(
 * 'above-content-collapsible')`. Visually matches the modal-mode trigger
 * (filter icon + "Filters" label + active-count badge) but flips a parent-
 * owned `open` state instead of opening a Popover.
 */
function FilterStripToggle({
  filters, open, onToggle,
}: {
  filters: ElementMeta[]
  open:    boolean
  onToggle: () => void
}) {
  const activeCount = filters.filter(f => {
    const v = f['value']
    return typeof v === 'string' && v !== ''
  }).length
  return (
    <button
      type="button"
      aria-label="Filters"
      aria-expanded={open}
      onClick={onToggle}
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
          deps={{ renderElement, actionButtonClass, renderActionIcon, renderActionBadge }}
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

// ─── Form ───────────────────────────────────────────────────

function FormRenderer({ el }: { el: ElementMeta }) {
  const formId = String(el['formId'] ?? '')
  const method = String(el['method'] ?? 'post').toLowerCase()
  const action = el['action'] ? String(el['action']) : undefined
  const stateUrl = el['stateUrl'] ? String(el['stateUrl']) : undefined
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

  // Plan #14 — formRef is threaded into FormStateProvider so live triggers
  // can snapshot the form's full DOM state via FormData (captures
  // uncontrolled inner-Repeater inputs that don't participate in the
  // controlled values map).
  const formRef = useRef<HTMLFormElement | null>(null)

  const formErrors = errors['_form'] ?? []
  const hasFieldErrors = Object.keys(errors).some(k => k !== '_form')

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    if (!action) return                       // no action URL → fall through to native submit
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setClientErrors(null)

    try {
      // Thread `event.submitter` so the clicked submit button's
      // name/value pair lands in the FormData. Without this, secondary
      // submits like "Create & create another" can't signal which
      // button fired through the body. Supported in all evergreen
      // browsers since 2022; cast through `as any` because TS lib.dom
      // hasn't picked up the optional submitter argument on every
      // version.
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null
      const fd = new (FormData as any)(e.currentTarget, submitter ?? undefined) as FormData
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
      // The server may force a navigate even when the redirect equals
      // the current URL — used by "Create & create another" so the
      // form remounts with empty defaults instead of preserving the
      // just-submitted values. Otherwise: skip navigate when the
      // redirect matches the current URL, since re-fetching the same
      // page would force a form remount and reset scroll.
      const force = Boolean((data as { force?: boolean }).force)
      const currentUrl = typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : ''
      if (redirect && (force || redirect !== currentUrl)) {
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
      ref={formRef}
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
      <FormIdContext.Provider value={formId}>
        {stateUrl ? (
          <FormStateProvider initialMeta={el} initialErrors={errors} formRef={formRef}>
            <FormBody fallbackChildren={el.children ?? []} fallbackValues={serverValues} fallbackErrors={errors} />
          </FormStateProvider>
        ) : (
          (el.children ?? []).map((child, i) => renderFormChild(child, i, serverValues, errors))
        )}
      </FormIdContext.Provider>
    </form>
  )
}

/**
 * Renders the controlled-form's children, sourcing them from the
 * `FormStateProvider`'s current `formMeta` (which gets replaced after
 * each live POST). Falls back to the props if (somehow) used outside a
 * provider — the shell only mounts this when `stateUrl` is set so the
 * fallback path is dead code in practice, but keeping it defensive.
 */
function FormBody({
  fallbackChildren, fallbackValues, fallbackErrors,
}: {
  fallbackChildren: ElementMeta[]
  fallbackValues:   Record<string, unknown>
  fallbackErrors:   Record<string, string[]>
}): React.ReactElement {
  const ctx = useFormState()
  if (!ctx) {
    return <>{fallbackChildren.map((child, i) => renderFormChild(child, i, fallbackValues, fallbackErrors))}</>
  }
  const children = (ctx.formMeta.children ?? []) as ElementMeta[]
  return <>{children.map((child, i) => renderFormChild(child, i, ctx.values, ctx.errors))}</>
}

/**
 * Render one child of a form's resolved schema with per-field values + errors.
 *
 * Exported so sibling renderers (e.g. `SelectFieldInput`'s inline-create
 * modal) can render a sub-schema with the same FieldShell + error-stamping
 * conventions as the parent form. Public surface beyond the file boundary
 * stays narrow — callers should pass `child.type === 'field'` elements;
 * non-field elements fall through to `renderElement`.
 */
export function renderFormChild(
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
  // The form-state value (from `withValues` / record-fill) wins when present;
  // otherwise the meta's own `defaultValue` (Plan #6 `Field.default()`) survives.
  const enriched: ElementMeta = value !== undefined
    ? { ...el, defaultValue: value }
    : el
  return renderField(enriched, index)
}

// ─── Table ──────────────────────────────────────────────────

interface TableUrlState {
  search?: string
  sort?:   { column: string; direction: 'asc' | 'desc' }
  page?:   number
  /** Active group column for `?group=`. Empty string means an explicit
   * "no grouping" override (set on the URL when the user picks "None"
   * in the dropdown to override `defaultGroup`); `undefined` omits the
   * key entirely so the configured default takes over. */
  group?:  string
  /** Drilled-in group key for `?groupKey=`. `undefined` omits — the
   * heading is banded (or no group at all); empty string explicitly
   * clears (used by the chip's × so a stale URL value doesn't return
   * via foreign-param round-trip). */
  groupKey?: string
}

// Mirror of `prefixedKey` in `elements/dispatchTable.ts`. Kept inline so
// SchemaRenderer doesn't drag the server-side dispatcher into the client
// bundle.
function prefixK(prefix: string | undefined, key: string): string {
  return prefix === undefined || prefix === '' ? key : `${prefix}_${key}`
}

let cachedSearchString: string | null = null
let cachedSearchParams: URLSearchParams | null = null

function getCurrentSearchParams(): URLSearchParams | null {
  if (typeof window === 'undefined') return null
  const s = window.location.search
  if (s === cachedSearchString && cachedSearchParams) return cachedSearchParams
  cachedSearchString = s
  cachedSearchParams = new URLSearchParams(s)
  return cachedSearchParams
}

function SearchFormHiddenInputs({ prefix }: { prefix: string | undefined }): React.ReactElement {
  const sp = getCurrentSearchParams()
  if (!sp) return <></>
  const searchKey = prefixK(prefix, 'search')
  const pageKey = prefixK(prefix, 'page')
  const inputs: React.ReactElement[] = []
  let i = 0
  for (const [k, v] of sp) {
    if (k === searchKey || k === pageKey) continue
    inputs.push(<input key={i++} type="hidden" name={k} value={v} />)
  }
  return <>{inputs}</>
}

function buildTableQuery(
  state:        TableUrlState,
  override:     TableUrlState,
  pathname:     string,
  filterValues: Record<string, string> = {},
  prefix?:      string,
): string {
  const merged: TableUrlState = { ...state, ...override }
  const params = new URLSearchParams()
  // Foreign URL params (other tables' state, app-level params) round-trip
  // verbatim so this builder only ever rewrites its own slice.
  const currentParams = getCurrentSearchParams()
  if (currentParams) {
    const ours = new Set([
      prefixK(prefix, 'search'),
      prefixK(prefix, 'sort'),
      prefixK(prefix, 'page'),
      prefixK(prefix, 'perPage'),
      prefixK(prefix, 'group'),
      prefixK(prefix, 'groupKey'),
      ...Object.keys(filterValues).map(n => prefixK(prefix, n)),
    ])
    for (const [k, v] of currentParams) {
      if (ours.has(k)) continue
      params.set(k, v)
    }
  }
  // Carry forward active filter values so sort/pagination links don't
  // accidentally clear them. Filter names can't collide with reserved
  // keys (search/sort/page/perPage/group) — that's enforced upstream.
  for (const [name, val] of Object.entries(filterValues)) {
    if (val) params.set(prefixK(prefix, name), val)
  }
  if (merged.search)    params.set(prefixK(prefix, 'search'), merged.search)
  if (merged.sort)      params.set(prefixK(prefix, 'sort'), `${merged.sort.column}:${merged.sort.direction}`)
  if (merged.page && merged.page > 1) params.set(prefixK(prefix, 'page'), String(merged.page))
  if (merged.group !== undefined) params.set(prefixK(prefix, 'group'), merged.group)
  // groupKey is sparse — only writes when the override sets a non-empty
  // value. Drill-out (chip ×) passes `''` to clear; the foreign-param
  // dedupe set above already filtered the stale value out, so an empty
  // override produces a URL without the key.
  if (merged.groupKey) params.set(prefixK(prefix, 'groupKey'), merged.groupKey)
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
  const colName    = String(col['name'] ?? '')
  const formatted  = (row?.['_formatted'] as Record<string, string> | undefined)?.[colName]
  const richtext   = (row?.['_richtextCells'] as Record<string, true> | undefined)?.[colName] === true
  const isBlank    = value === null || value === undefined || value === ''

  if (formatted !== undefined && formatted !== '') {
    return wrapCell(formatted, col, richtext)
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
      const Icon = resolveIcon(opt.icon) ?? CircleIcon
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
    case 'color': {
      const css = String(value)
      const shape = col['colorShape'] as 'rounded' | 'square' | 'circle' | undefined
      const shapeClass =
        shape === 'circle' ? 'rounded-full' :
        shape === 'square' ? 'rounded-none' : 'rounded'
      const hideValue = col['colorHideValue'] === true
      return (
        <span className="inline-flex items-center gap-2">
          <span
            className={`size-4 border border-border ${shapeClass}`}
            style={{ backgroundColor: css }}
            aria-hidden="true"
          />
          {!hideValue && <span className="text-sm">{css}</span>}
        </span>
      )
    }
    default: {
      // Array-valued cells — `bulleted()` wins over `listWithLineBreaks()`
      // when both are set. Falls through to the standard string path for
      // non-array values so the per-cell formatters keep working.
      if (Array.isArray(value)) {
        const items = value.map(v => String(v))
        if (col['bulleted'] === true) {
          return wrapCellList(items, col, 'bulleted')
        }
        if (col['listWithLineBreaks'] === true) {
          return wrapCellList(items, col, 'lines')
        }
        // Bare array — comma-join (matches the existing legacy fallback).
        return wrapCell(items.join(', '), col)
      }
      // Text column — apply built-in format, then wrapper.
      const fmt = col['format'] as { kind: string; [k: string]: unknown } | undefined
      const display = fmt ? applyColumnFormat(value, fmt) : String(value)
      return wrapCell(display, col)
    }
  }
}

/** Apply text-rendering chrome (color, weight, line-clamp, wrap, tooltip)
 * to a stringified cell value. Used by the text and per-row formatter
 * paths so styling stays consistent. When `asHtml` is true the content
 * is server-rendered HTML (e.g. from the registered richtext renderer)
 * and gets injected via `dangerouslySetInnerHTML`. */
function wrapCell(content: string, col: ElementMeta, asHtml = false): React.ReactNode {
  const color    = col['color']    as string | undefined
  const weight   = col['weight']   as string | undefined
  const tooltip  = col['tooltip']  as string | undefined
  const wrapping = Boolean(col['wrap'])
  const clamp    = col['lineClamp'] as number | undefined
  const copyMsg  = col['copyMessage'] as string | undefined

  const colorCls   = color  ? (COLUMN_COLOR_CLASSES[color]  ?? '') : ''
  const weightCls  = weight ? (COLUMN_WEIGHT_CLASSES[weight] ?? '') : ''
  const wrapCls    = wrapping ? 'whitespace-normal' : ''
  const clampStyle = clamp !== undefined
    ? { display: '-webkit-box', WebkitLineClamp: String(clamp), WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
    : undefined

  const valueNode = asHtml
    ? (
        <span
          className={`prose prose-sm max-w-none dark:prose-invert ${colorCls} ${weightCls} ${wrapCls}`.trim()}
          title={tooltip}
          style={clampStyle}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )
    : (
        <span
          className={`${colorCls} ${weightCls} ${wrapCls}`.trim()}
          title={tooltip}
          style={clampStyle}
        >
          {content}
        </span>
      )

  if (copyMsg === undefined) return valueNode

  // Copy-to-clipboard trigger — copies the rendered text. For richtext
  // cells the underlying source isn't separately stamped on the wire
  // (would double the row payload), so the rendered HTML is what gets
  // copied; admins comfortable with HTML still get something usable.
  return (
    <span className="inline-flex items-center gap-1.5">
      {valueNode}
      <CellCopyButton text={content} label={copyMsg} />
    </span>
  )
}

/** Tabular-list rendering used by `Column.bulleted()` /
 * `Column.listWithLineBreaks()`. `mode='bulleted'` mounts a `<ul>` with
 * bullet markers; `mode='lines'` separates entries with `<br>`. Both
 * inherit the same color / weight / wrap / tooltip / clamp chrome as
 * the text path. Empty arrays fall through to the muted dash. */
function wrapCellList(
  items: string[],
  col:   ElementMeta,
  mode:  'bulleted' | 'lines',
): React.ReactNode {
  if (items.length === 0) {
    const fallback = (col['default'] as string | undefined) ?? '—'
    return <span className="text-muted-foreground">{fallback}</span>
  }
  const color    = col['color']   as string | undefined
  const weight   = col['weight']  as string | undefined
  const tooltip  = col['tooltip'] as string | undefined

  const colorCls   = color  ? (COLUMN_COLOR_CLASSES[color]  ?? '') : ''
  const weightCls  = weight ? (COLUMN_WEIGHT_CLASSES[weight] ?? '') : ''

  if (mode === 'bulleted') {
    return (
      <ul
        className={`list-disc pl-4 space-y-0.5 ${colorCls} ${weightCls}`.trim()}
        title={tooltip}
      >
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    )
  }
  return (
    <span
      className={`${colorCls} ${weightCls}`.trim()}
      title={tooltip}
    >
      {items.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {s}
        </React.Fragment>
      ))}
    </span>
  )
}

/** Slim copy-to-clipboard button used by `Column.copyMessage()`. The
 * label doubles as the toast text. Mirrors `EntryCopyButton`'s shape
 * but compact enough to live inline next to a cell value. */
function CellCopyButton({ text, label }: { text: string; label: string }): React.ReactNode {
  const [copied, setCopied] = useState(false)
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }).catch(() => { /* ignore — older browser / permission denied */ })
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={copied ? label : 'Copy'}
      title={copied ? label : 'Copy'}
      data-no-row-nav
      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
    >
      {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
    </button>
  )
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
  name, label, defaultValue, placeholder, options, prefix,
}: {
  name:         string
  label:        string
  defaultValue: string
  placeholder:  string
  options:      Array<{ value: string; label: string }>
  prefix?:      string | undefined
}) {
  const [value, setValue] = useState(defaultValue)
  const navigate           = useNavigate()

  const onChange = (next: unknown) => {
    const v = typeof next === 'string' ? next : ''
    setValue(v)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const k   = prefixK(prefix, name)
    if (v === '') url.searchParams.delete(k)
    else          url.searchParams.set(k, v)
    // Filter changes reset pagination — first page of the new result set.
    url.searchParams.delete(prefixK(prefix, 'page'))
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

/**
 * Heading-row text for a group band. Shows `<label>: <value-or-title>`
 * with an optional description below. Reused for both collapsible and
 * static heading rows.
 */
function GroupHeaderText({
  label, value, title, description,
}: {
  label?:       string | undefined
  value?:       string | undefined
  title?:       string | undefined
  description?: string | undefined
}) {
  const display = title ?? value ?? ''
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        {label && <span className="text-muted-foreground/70">{label}: </span>}
        <span className="text-foreground">{display || 'Ungrouped'}</span>
      </span>
      {description && (
        <span className="text-[10px] font-normal normal-case text-muted-foreground/80">
          {description}
        </span>
      )}
    </span>
  )
}

/**
 * "Group by" dropdown rendered above the table when 2+ TableGroups
 * are registered (or 1 group with rich metadata). Selecting "None"
 * sets `?group=` (empty) which explicitly overrides `defaultGroup`.
 *
 * URL-driven — `onChange` builds the next href via `buildTableQuery`
 * and SPA-navigates; the page re-renders with the new active group.
 */
function TableGroupPicker({
  options, active, onChange,
}: {
  options: Array<{ column: string; label: string }>
  active:  string | undefined
  onChange: (column: string) => void
}) {
  const value = active ?? ''
  return (
    <Select value={value} onValueChange={(v) => onChange(typeof v === 'string' ? v : '')}>
      <SelectTrigger size="sm" className="h-9 w-44">
        <SelectValue placeholder="Group by…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">No grouping</SelectItem>
        {options.map(o => (
          <SelectItem key={o.column} value={o.column}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Pair-of-date-inputs filter for `kind === 'dateRange'`. Each side
 * navigates the URL on change, encoding the pair as `from..to` keyed
 * off the filter name. Empty pair drops the URL key.
 */
function FilterDateRange({
  name, label, defaultValue, placeholder, includesTime, minDate, maxDate, prefix,
}: {
  name:         string
  label:        string
  defaultValue: string
  placeholder:  string
  includesTime: boolean
  minDate?:     string
  maxDate?:     string
  prefix?:      string | undefined
}) {
  const initial = parseDateRangeValue(defaultValue)
  const [from, setFrom] = useState(initial.from ?? '')
  const [to,   setTo]   = useState(initial.to   ?? '')
  const navigate         = useNavigate()

  const inputType = includesTime ? 'datetime-local' : 'date'

  const navigateTo = (nextFrom: string, nextTo: string): void => {
    if (typeof window === 'undefined') return
    const url     = new URL(window.location.href)
    const encoded = encodeDateRangeValue({ from: nextFrom, to: nextTo })
    const k       = prefixK(prefix, name)
    if (encoded === '') url.searchParams.delete(k)
    else                url.searchParams.set(k, encoded)
    url.searchParams.delete(prefixK(prefix, 'page'))
    void navigate(url.pathname + url.search)
  }

  const onFromChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const v = e.target.value
    setFrom(v)
    navigateTo(v, to)
  }
  const onToChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const v = e.target.value
    setTo(v)
    navigateTo(from, v)
  }
  const onClear = (): void => {
    setFrom('')
    setTo('')
    navigateTo('', '')
  }

  const hasValue = from !== '' || to !== ''

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Input
          type={inputType}
          value={from}
          onChange={onFromChange}
          placeholder={placeholder}
          aria-label={`${label} from`}
          {...(minDate !== undefined ? { min: minDate } : {})}
          {...(maxDate !== undefined ? { max: maxDate } : {})}
          className="h-8 text-xs"
        />
        <span className="text-muted-foreground">→</span>
        <Input
          type={inputType}
          value={to}
          onChange={onToChange}
          placeholder={placeholder}
          aria-label={`${label} to`}
          {...(minDate !== undefined ? { min: minDate } : {})}
          {...(maxDate !== undefined ? { max: maxDate } : {})}
          className="h-8 text-xs"
        />
        {hasValue && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label}`}
            className="text-muted-foreground hover:text-foreground px-1"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Multi-value filter for `kind === 'multiSelect'`. Renders a checkbox
 * stack inside the popover; toggling a box patches the comma-separated
 * URL value for the filter's name. Empty selection drops the URL key.
 */
function FilterMultiSelect({
  name, label, defaultValue, options, prefix,
}: {
  name:         string
  label:        string
  defaultValue: string
  options:      Array<{ value: string; label: string }>
  prefix?:      string | undefined
}) {
  const [selected, setSelected] = useState<string[]>(() => parseMultiSelectValue(defaultValue))
  const navigate                = useNavigate()

  const apply = (next: string[]): void => {
    setSelected(next)
    if (typeof window === 'undefined') return
    const url     = new URL(window.location.href)
    const encoded = encodeMultiSelectValue(next)
    const k       = prefixK(prefix, name)
    if (encoded === '') url.searchParams.delete(k)
    else                url.searchParams.set(k, encoded)
    url.searchParams.delete(prefixK(prefix, 'page'))
    void navigate(url.pathname + url.search)
  }

  const toggle = (value: string, checked: boolean): void => {
    const next = checked
      ? [...selected.filter(v => v !== value), value]
      : selected.filter(v => v !== value)
    apply(next)
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-1.5">
        {options.map(o => {
          const checked = selected.includes(o.value)
          return (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(c: boolean | 'indeterminate') => toggle(o.value, c === true)}
              />
              <span>{o.label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Multi-field filter for `kind === 'form'`. The popover renders an inner
 * sub-form with the user-declared schema; submitting bundles all named
 * inputs into a `Record<string, unknown>`, JSON-encodes the non-empty
 * subset under the filter's URL key, and SPA-navigates. Empty submit
 * drops the URL key entirely.
 *
 * The fields' `defaultValue` were pre-hydrated server-side from the
 * active URL value (see `FormFilter.toMeta`), so an existing filter
 * round-trips into the form on render. Inputs are uncontrolled — we
 * read state via `new FormData(form)` on submit, matching how the
 * outer page-level Form works on full submit.
 */
function FilterForm({
  name, label, defaultValue, formSchema, prefix,
}: {
  name:         string
  label:        string
  defaultValue: string
  formSchema:   ElementMeta[]
  prefix?:      string | undefined
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const navigate = useNavigate()
  const hasValue = defaultValue !== '' && defaultValue !== '{}'

  const onApply = (e?: React.FormEvent | React.MouseEvent): void => {
    e?.preventDefault()
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    const values: Record<string, unknown> = {}
    for (const [key, val] of fd.entries()) {
      const existing = values[key]
      if (existing === undefined) {
        values[key] = val
      } else if (Array.isArray(existing)) {
        (existing as unknown[]).push(val)
      } else {
        values[key] = [existing, val]
      }
    }
    if (typeof window === 'undefined') return
    const url     = new URL(window.location.href)
    const encoded = encodeFormFilterValue(values)
    const k       = prefixK(prefix, name)
    if (encoded === '') url.searchParams.delete(k)
    else                url.searchParams.set(k, encoded)
    url.searchParams.delete(prefixK(prefix, 'page'))
    void navigate(url.pathname + url.search)
  }

  const onClear = (): void => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.delete(prefixK(prefix, name))
    url.searchParams.delete(prefixK(prefix, 'page'))
    void navigate(url.pathname + url.search)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <form ref={formRef} onSubmit={onApply} className="flex flex-col gap-2">
        {formSchema.map((child, i) => renderFormChild(child, i, {}, {}))}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply
          </button>
          {hasValue && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

/**
 * Composable advanced filter for `kind === 'queryBuilder'`. v2 emits a
 * full tree — root AND/OR connector + nested groups arbitrarily deep —
 * JSON-encoded into a single URL key on Apply (see
 * `encodeQueryBuilderValue`).
 *
 * State is local — typing into a value input doesn't navigate. Only the
 * Apply button writes the URL. This mirrors `FilterForm`'s behavior and
 * keeps the popover quiet under the cursor.
 */
function FilterQueryBuilder({
  name, label, defaultValue, constraints, prefix,
}: {
  name:         string
  label:        string
  defaultValue: string
  constraints:  ConstraintMeta[]
  prefix?:      string | undefined
}) {
  const navigate = useNavigate()
  const initialTree = parseQueryBuilderValue(defaultValue)
  const [tree, setTree] = useState<QueryBuilderTree>(initialTree)
  const hasValue = defaultValue !== '' && initialTree.rules.length > 0

  const onApply = (e?: React.FormEvent | React.MouseEvent): void => {
    e?.preventDefault()
    if (typeof window === 'undefined') return
    const encoded = encodeQueryBuilderValue(tree)
    const url = new URL(window.location.href)
    const k = prefixK(prefix, name)
    if (encoded === '') url.searchParams.delete(k)
    else                url.searchParams.set(k, encoded)
    url.searchParams.delete(prefixK(prefix, 'page'))
    void navigate(url.pathname + url.search)
  }

  const onClear = (): void => {
    setTree({ operator: 'and', rules: [] })
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.delete(prefixK(prefix, name))
    url.searchParams.delete(prefixK(prefix, 'page'))
    void navigate(url.pathname + url.search)
  }

  if (constraints.length === 0) {
    return (
      <div className="text-muted-foreground text-xs">
        {label}: no constraints declared.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 min-w-[24rem]">
      <span className="text-muted-foreground text-xs">{label}</span>
      <form onSubmit={onApply} className="flex flex-col gap-2">
        <QueryBuilderGroup
          tree={tree}
          constraints={constraints}
          isRoot={true}
          onChange={setTree}
        />
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1" />
          <button
            type="submit"
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply
          </button>
          {(hasValue || tree.rules.length > 0) && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

/**
 * Recursive group renderer — emits a connector picker (AND / OR) at the
 * top, a vertical stack of children (rules and sub-groups), and footer
 * buttons for "+ Add condition" and "+ Add group". Calls `onChange` with
 * the updated sub-tree so parents can splice it back into their own
 * `rules` array. Root groups skip the outer border so the popover doesn't
 * carry a redundant frame; nested groups draw a faint left rule + soft
 * background so the nesting is visible without blowing up the width.
 */
function QueryBuilderGroup({
  tree, constraints, isRoot, onChange, onRemove,
}: {
  tree:        QueryBuilderTree
  constraints: ConstraintMeta[]
  isRoot:      boolean
  onChange:    (next: QueryBuilderTree) => void
  onRemove?:   () => void
}) {
  const constraintMap = new Map<string, ConstraintMeta>()
  for (const c of constraints) constraintMap.set(c.name, c)

  const setOperator = (op: 'and' | 'or'): void => {
    onChange({ ...tree, operator: op })
  }

  const updateChildAt = (index: number, next: QueryBuilderTreeChild): void => {
    onChange({ ...tree, rules: tree.rules.map((r, i) => i === index ? next : r) })
  }

  const removeChildAt = (index: number): void => {
    onChange({ ...tree, rules: tree.rules.filter((_, i) => i !== index) })
  }

  const addRule = (): void => {
    const first = constraints[0]
    if (!first) return
    onChange({
      ...tree,
      rules: [...tree.rules, {
        constraint: first.name,
        operator:   first.defaultOperator ?? first.operators[0]?.name ?? 'equals',
        value:      undefined,
      }],
    })
  }

  const addGroup = (): void => {
    onChange({
      ...tree,
      rules: [...tree.rules, { operator: 'and', rules: [] }],
    })
  }

  const wrapper = isRoot
    ? 'flex flex-col gap-2'
    : 'flex flex-col gap-2 rounded-md border-l-2 border-primary/40 bg-muted/30 pl-2 py-2 pr-2'

  return (
    <div className={wrapper}>
      <div className="flex items-center gap-2">
        <ConnectorToggle value={tree.operator} onChange={setOperator} />
        <span className="text-muted-foreground text-[11px]">
          {tree.operator === 'and' ? 'Match all of the following' : 'Match any of the following'}
        </span>
        {!isRoot && onRemove && (
          <>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove group"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              ×
            </button>
          </>
        )}
      </div>

      {tree.rules.length === 0 && (
        <div className="text-muted-foreground text-xs italic">No conditions yet.</div>
      )}

      {tree.rules.map((child, i) => {
        if (isQueryBuilderTree(child)) {
          return (
            <QueryBuilderGroup
              key={i}
              tree={child}
              constraints={constraints}
              isRoot={false}
              onChange={(next) => updateChildAt(i, next)}
              onRemove={() => removeChildAt(i)}
            />
          )
        }
        return (
          <QueryBuilderRow
            key={i}
            rule={child}
            constraints={constraints}
            constraintMeta={constraintMap.get(child.constraint)}
            onConstraintChange={(v) => {
              const c = constraintMap.get(v)
              if (!c) return
              updateChildAt(i, {
                constraint: v,
                operator:   c.defaultOperator ?? c.operators[0]?.name ?? 'equals',
                value:      undefined,
              })
            }}
            onOperatorChange={(v) => {
              updateChildAt(i, {
                ...child,
                operator: v as ConstraintOperatorName,
                value:    undefined,
              })
            }}
            onValueChange={(v) => updateChildAt(i, { ...child, value: v })}
            onRemove={() => removeChildAt(i)}
          />
        )
      })}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addRule}
          className="inline-flex h-8 items-center justify-center rounded-md border border-dashed border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
        >
          + Add condition
        </button>
        <button
          type="button"
          onClick={addGroup}
          className="inline-flex h-8 items-center justify-center rounded-md border border-dashed border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
        >
          + Add group
        </button>
      </div>
    </div>
  )
}

/**
 * Compact AND/OR segmented control used at the head of every group. Pure
 * presentation — the parent owns the value.
 */
function ConnectorToggle({
  value, onChange,
}: {
  value:    'and' | 'or'
  onChange: (next: 'and' | 'or') => void
}) {
  const base = 'inline-flex h-7 items-center px-2 text-[11px] font-medium uppercase tracking-wide transition'
  const on   = 'bg-primary text-primary-foreground'
  const off  = 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-input">
      <button
        type="button"
        onClick={() => onChange('and')}
        className={`${base} ${value === 'and' ? on : off}`}
        aria-pressed={value === 'and'}
      >
        AND
      </button>
      <button
        type="button"
        onClick={() => onChange('or')}
        className={`${base} ${value === 'or' ? on : off}`}
        aria-pressed={value === 'or'}
      >
        OR
      </button>
    </div>
  )
}

/**
 * One condition row inside `FilterQueryBuilder`. Three controls
 * left-to-right: constraint picker, operator picker, value input. The
 * value input dispatches off the operator's `valueKind` — `none` hides
 * it entirely, `numberRange` / `dateRange` mount a pair, otherwise a
 * single typed input.
 */
function QueryBuilderRow({
  rule, constraints, constraintMeta,
  onConstraintChange, onOperatorChange, onValueChange, onRemove,
}: {
  rule:               QueryBuilderRule
  constraints:        ConstraintMeta[]
  constraintMeta:     ConstraintMeta | undefined
  onConstraintChange: (name: string) => void
  onOperatorChange:   (name: string) => void
  onValueChange:      (value: unknown) => void
  onRemove:           () => void
}) {
  const operators: ConstraintOperator[] = constraintMeta?.operators ?? []
  const activeOp = operators.find(o => o.name === rule.operator)
  const valueKind: ConstraintValueKind = activeOp?.valueKind ?? 'text'

  return (
    <div className="flex items-start gap-1.5 rounded-md border border-input bg-background p-2">
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        <Select value={rule.constraint} onValueChange={(v) => onConstraintChange(typeof v === 'string' ? v : '')}>
          <SelectTrigger size="sm" className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {constraints.map(c => (
              <SelectItem key={c.name} value={c.name}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={rule.operator} onValueChange={(v) => onOperatorChange(typeof v === 'string' ? v : '')}>
          <SelectTrigger size="sm" className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map(o => (
              <SelectItem key={o.name} value={o.name}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <QueryBuilderValueInput
          kind={valueKind}
          value={rule.value}
          options={constraintMeta?.options}
          onChange={onValueChange}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove condition"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        ×
      </button>
    </div>
  )
}

/**
 * Operator-aware value control. Switches over the constraint operator's
 * `valueKind` and mounts the matching input. Value shapes:
 * - `text / number / date / dateTime / select`  → scalar
 * - `multiSelect`                                → string[]
 * - `numberRange / dateRange`                    → [string, string]
 * - `boolean / none`                              → null / undefined
 */
function QueryBuilderValueInput({
  kind, value, options, onChange,
}: {
  kind:     ConstraintValueKind
  value:    unknown
  options:  Array<{ value: string; label: string }> | undefined
  onChange: (next: unknown) => void
}) {
  if (kind === 'none' || kind === 'boolean') return null

  if (kind === 'select') {
    const opts = options ?? []
    const v = value === undefined || value === null ? '' : String(value)
    return (
      <Select value={v} onValueChange={(next) => onChange(typeof next === 'string' ? next : '')}>
        <SelectTrigger size="sm" className="h-8 min-w-32 text-xs">
          <SelectValue placeholder="Pick…" />
        </SelectTrigger>
        <SelectContent>
          {opts.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (kind === 'multiSelect') {
    const opts = options ?? []
    const list = Array.isArray(value) ? value.map(v => String(v)) : []
    const toggle = (val: string): void => {
      if (list.includes(val)) onChange(list.filter(v => v !== val))
      else                    onChange([...list, val])
    }
    return (
      <div className="flex flex-wrap items-center gap-1">
        {opts.map(o => {
          const active = list.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={
                'inline-flex h-7 items-center rounded-md border px-2 text-xs ' +
                (active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background hover:bg-accent')
              }
            >
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (kind === 'numberRange') {
    const [min, max] = Array.isArray(value) ? [value[0], value[1]] : [undefined, undefined]
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          className="h-8 w-24 text-xs"
          value={min === undefined || min === null ? '' : String(min)}
          onChange={(e) => onChange([e.target.value, max ?? ''])}
          placeholder="Min"
        />
        <span className="text-muted-foreground text-xs">–</span>
        <Input
          type="number"
          className="h-8 w-24 text-xs"
          value={max === undefined || max === null ? '' : String(max)}
          onChange={(e) => onChange([min ?? '', e.target.value])}
          placeholder="Max"
        />
      </div>
    )
  }

  if (kind === 'dateRange') {
    const [from, to] = Array.isArray(value) ? [value[0], value[1]] : [undefined, undefined]
    return (
      <div className="flex items-center gap-1">
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={from === undefined || from === null ? '' : String(from)}
          onChange={(e) => onChange([e.target.value, to ?? ''])}
        />
        <span className="text-muted-foreground text-xs">→</span>
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={to === undefined || to === null ? '' : String(to)}
          onChange={(e) => onChange([from ?? '', e.target.value])}
        />
      </div>
    )
  }

  if (kind === 'date' || kind === 'dateTime') {
    const v = value === undefined || value === null ? '' : String(value)
    return (
      <Input
        type={kind === 'dateTime' ? 'datetime-local' : 'date'}
        className="h-8 w-44 text-xs"
        value={v}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (kind === 'number') {
    const v = value === undefined || value === null ? '' : String(value)
    return (
      <Input
        type="number"
        className="h-8 w-32 text-xs"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Value"
      />
    )
  }

  // Default: text
  const v = value === undefined || value === null ? '' : String(value)
  return (
    <Input
      type="text"
      className="h-8 min-w-32 flex-1 text-xs"
      value={v}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
    />
  )
}

function renderFilterControl(el: ElementMeta, index: number, prefix?: string | undefined): React.ReactNode {
  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const kind        = String(el['kind'] ?? 'select')
  const value       = el['value'] ? String(el['value']) : ''
  const placeholder = el['placeholder'] ? String(el['placeholder']) : 'All'

  if (kind === 'queryBuilder') {
    const constraints = (el['constraints'] as ConstraintMeta[] | undefined) ?? []
    return (
      <FilterQueryBuilder
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        constraints={constraints}
        prefix={prefix}
      />
    )
  }

  if (kind === 'form') {
    const formSchema = (el['formSchema'] as ElementMeta[] | undefined) ?? []
    return (
      <FilterForm
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        formSchema={formSchema}
        prefix={prefix}
      />
    )
  }

  if (kind === 'boolean') {
    return (
      <FilterSelect
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        placeholder={placeholder}
        options={[{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }]}
        prefix={prefix}
      />
    )
  }

  if (kind === 'multiSelect') {
    const options = (el['options'] as Array<{ value: string; label: string }> | undefined) ?? []
    return (
      <FilterMultiSelect
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        options={options}
        prefix={prefix}
      />
    )
  }

  if (kind === 'dateRange') {
    const includesTime = Boolean(el['includesTime'])
    const minDate      = el['minDate'] ? String(el['minDate']) : undefined
    const maxDate      = el['maxDate'] ? String(el['maxDate']) : undefined
    return (
      <FilterDateRange
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        placeholder={placeholder}
        includesTime={includesTime}
        prefix={prefix}
        {...(minDate !== undefined ? { minDate } : {})}
        {...(maxDate !== undefined ? { maxDate } : {})}
      />
    )
  }

  // 'ternary' and 'select' both render as a single-select dropdown,
  // differing only in their server-supplied option set.
  const options = (el['options'] as Array<{ value: string; label: string }> | undefined) ?? []
  return (
    <FilterSelect
      key={index}
      name={name}
      label={label}
      defaultValue={value}
      placeholder={placeholder}
      options={options}
      prefix={prefix}
    />
  )
}

/**
 * Resolve the record URL for a single data cell. Column-level override
 * (`Column.recordUrl(fn)` → `_columnRecordUrls[name]`) wins over the
 * table-level `Table.recordUrl(fn)` (`_recordUrl`). Explicit per-column
 * opt-out (`Column.recordUrl(false)` → `meta.recordUrl === false`)
 * suppresses the link entirely. Returns `undefined` when the cell is
 * not linkable, in which case the renderer leaves it unwrapped.
 */
function resolveColumnUrl(
  col:      ElementMeta,
  tableUrl: string | undefined,
  colUrls:  Record<string, string>,
): string | undefined {
  if (col['recordUrl'] === false) return undefined
  const own = colUrls[String(col['name'] ?? '')]
  if (own !== undefined) return own
  return tableUrl
}

/**
 * Cell-level link wrapper. Renders a real `<a href>` so right-click /
 * cmd-click / middle-click "open in new tab" works, but intercepts plain
 * left-clicks for SPA navigation via `useNavigate()`. Modified clicks
 * (cmd / ctrl / shift / alt / non-primary buttons) fall through to the
 * browser's default link behavior.
 */
function RecordCellLink({
  href, navigate, children,
}: {
  href:     string
  navigate: NavigateFn
  children: React.ReactNode
}) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void navigate(href)
  }
  return (
    <a
      href={href}
      onClick={onClick}
      className="block px-2 py-2 text-inherit no-underline hover:text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      {children}
    </a>
  )
}

/**
 * "Drilled into <Label>: <Value>" chip above the table when a group
 * heading has been clicked. The × clears `?<prefix>groupKey=`, returning
 * the table to its banded view. Real `<a href>` with `useNavigate()`
 * intercept on plain left-click so cmd-click / middle-click open a
 * fresh tab (rare but valid for sharing the banded view URL).
 */
function ActiveGroupKeyChip({
  label, value, displayValue, clearHref, navigate,
}: {
  label:        string
  value:        string
  displayValue: string
  clearHref:    string
  navigate:     NavigateFn
}) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void navigate(clearHref)
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">Drilled into</span>
      <span className="font-medium text-foreground">
        {label ? `${label}: ` : ''}{displayValue || value}
      </span>
      <a
        href={clearHref}
        onClick={onClick}
        aria-label="Clear drill-in"
        className="ms-auto text-muted-foreground hover:text-foreground"
      >
        ×
      </a>
    </div>
  )
}

/**
 * Group-heading text wrapped in a real `<a href>` that SPA-navs into the
 * drilled-in URL. Plain left-click intercepts for `useNavigate()`;
 * cmd/ctrl/shift-click + middle-click fall through to the browser so
 * "open in new tab" semantics work. Visually inherits the heading
 * styling — the link adds underline-on-hover affordance without
 * disturbing the surrounding text-transform / size.
 */
function GroupHeadingLink({
  href, navigate, children,
}: {
  href:     string
  navigate: NavigateFn
  children: React.ReactNode
}) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void navigate(href)
  }
  return (
    <a
      href={href}
      onClick={onClick}
      className="inline-flex items-center gap-1 text-inherit no-underline hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      {children}
    </a>
  )
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
  const navigate = useNavigate()
  const items = (el['items'] as BreadcrumbItemShape[] | undefined) ?? []
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
  return <Icon className="size-4" aria-hidden="true" />
}

/**
 * Sort-by dropdown for `contentLayout: 'cards'`. Since the column-header
 * row (which usually doubles as the sort affordance) is hidden in cards
 * mode, this picker appears in the top bar instead. Each `Column` flagged
 * `.sortable()` contributes two options — ascending and descending —
 * yielding "Title (A→Z) / Title (Z→A) / Date (oldest first) / Date (newest
 * first)" style entries. Selecting an option resets `?page=1`.
 */
function SortByPicker({
  columns, active, onChange,
}: {
  columns: ElementMeta[]
  active:  { column: string; direction: 'asc' | 'desc' } | undefined
  onChange: (column: string, direction: 'asc' | 'desc') => void
}) {
  const sortable = columns.filter(c => Boolean(c['sortable']))
  if (sortable.length === 0) return null
  const value = active ? `${active.column}:${active.direction}` : ''
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (typeof v !== 'string' || v === '') return
        const idx = v.indexOf(':')
        if (idx < 0) return
        const col = v.slice(0, idx)
        const dir = v.slice(idx + 1) === 'desc' ? 'desc' : 'asc'
        onChange(col, dir as 'asc' | 'desc')
      }}
    >
      <SelectTrigger size="sm" className="h-9 w-44">
        <SelectValue placeholder="Sort by…" />
      </SelectTrigger>
      <SelectContent>
        {sortable.map(col => {
          const name  = String(col['name'] ?? '')
          const label = String(col['label'] ?? name)
          return (
            <React.Fragment key={name}>
              <SelectItem value={`${name}:asc`}>{label} (A→Z)</SelectItem>
              <SelectItem value={`${name}:desc`}>{label} (Z→A)</SelectItem>
            </React.Fragment>
          )
        })}
      </SelectContent>
    </Select>
  )
}

/**
 * Toolbar dropdown for `Column.toggleable()` columns. Lists every
 * toggleable column with a checkbox; toggling writes through to a
 * caller-supplied `onToggle` (the `TableRendererBody` owns the state
 * + the localStorage round-trip). Mounted only when at least one
 * column is toggleable.
 */
function ColumnsToggleDropdown({
  columns, hidden, onToggle,
}: {
  columns: ElementMeta[]
  hidden:  Set<string>
  onToggle: (name: string, nextHidden: boolean) => void
}) {
  if (columns.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-accent"
            aria-label="Show or hide columns"
          >
            <Columns3Icon className="h-4 w-4" aria-hidden="true" />
            <span>Columns</span>
          </button>
        )}
      />
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {columns.map((col, i) => {
          const name  = String(col['name']  ?? '')
          const label = String(col['label'] ?? name)
          const isHidden = hidden.has(name)
          return (
            <DropdownMenuItem
              key={i}
              // Suppress menu-close so users can toggle multiple columns
              // without re-opening the dropdown.
              closeOnClick={false}
              onClick={() => onToggle(name, !isHidden)}
            >
              <span className="inline-flex w-4 items-center justify-center">
                {!isHidden && <CheckIcon className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span>{label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Lookup tables for responsive grid column-counts in `contentLayout:
 * 'cards'`. Tailwind's JIT scanner needs **literal** class strings; we
 * can't construct them at runtime via template literals (`grid-cols-${n}`
 * would never be matched). Limit to 1–6 columns + 12 — covers every
 * reasonable card grid; bigger values are silently capped at 6 for
 * non-base breakpoints in `cardsPerRowClasses`.
 */
const CARDS_GRID_COLS_BASE: Record<number, string> = {
  1:  'grid-cols-1',
  2:  'grid-cols-2',
  3:  'grid-cols-3',
  4:  'grid-cols-4',
  5:  'grid-cols-5',
  6:  'grid-cols-6',
  12: 'grid-cols-12',
}
const CARDS_GRID_COLS_SM: Record<number, string> = {
  1: 'sm:grid-cols-1',  2: 'sm:grid-cols-2',  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',  5: 'sm:grid-cols-5',  6: 'sm:grid-cols-6',
  12: 'sm:grid-cols-12',
}
const CARDS_GRID_COLS_MD: Record<number, string> = {
  1: 'md:grid-cols-1',  2: 'md:grid-cols-2',  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',  5: 'md:grid-cols-5',  6: 'md:grid-cols-6',
  12: 'md:grid-cols-12',
}
const CARDS_GRID_COLS_LG: Record<number, string> = {
  1: 'lg:grid-cols-1',  2: 'lg:grid-cols-2',  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',  5: 'lg:grid-cols-5',  6: 'lg:grid-cols-6',
  12: 'lg:grid-cols-12',
}
const CARDS_GRID_COLS_XL: Record<number, string> = {
  1: 'xl:grid-cols-1',  2: 'xl:grid-cols-2',  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',  5: 'xl:grid-cols-5',  6: 'xl:grid-cols-6',
  12: 'xl:grid-cols-12',
}
const CARDS_GRID_COLS_2XL: Record<number, string> = {
  1: '2xl:grid-cols-1',  2: '2xl:grid-cols-2',  3: '2xl:grid-cols-3',
  4: '2xl:grid-cols-4',  5: '2xl:grid-cols-5',  6: '2xl:grid-cols-6',
  12: '2xl:grid-cols-12',
}

function pickCardCols(table: Record<number, string>, raw: number | undefined): string | undefined {
  if (raw === undefined) return undefined
  if (table[raw]) return table[raw]
  // Snap unsupported values to nearest available — values outside [1,6]∪{12}
  // round down. Already-clamped to [1,12] server-side.
  if (raw >= 12) return table[12]
  if (raw >= 6) return table[6]
  if (raw >= 5) return table[5]
  if (raw >= 4) return table[4]
  if (raw >= 3) return table[3]
  if (raw >= 2) return table[2]
  return table[1]
}

/** Build a Tailwind grid-cols class string from a per-row config. Default
 * `{ default: 1, sm: 2, lg: 3 }` mirrors Filament's typical card grid. */
function cardsPerRowClasses(opts: Record<string, number> | undefined): string {
  const cfg = opts ?? {}
  const baseN = cfg['default'] ?? 1
  const out: string[] = [pickCardCols(CARDS_GRID_COLS_BASE, baseN)!]
  if (cfg['sm']  !== undefined) { const c = pickCardCols(CARDS_GRID_COLS_SM,  cfg['sm']);  if (c) out.push(c) }
  if (cfg['md']  !== undefined) { const c = pickCardCols(CARDS_GRID_COLS_MD,  cfg['md']);  if (c) out.push(c) }
  if (cfg['lg']  !== undefined) { const c = pickCardCols(CARDS_GRID_COLS_LG,  cfg['lg']);  if (c) out.push(c) }
  if (cfg['xl']  !== undefined) { const c = pickCardCols(CARDS_GRID_COLS_XL,  cfg['xl']);  if (c) out.push(c) }
  if (cfg['2xl'] !== undefined) { const c = pickCardCols(CARDS_GRID_COLS_2XL, cfg['2xl']); if (c) out.push(c) }
  // Unset fallback covers Filament's typical default — 1 column on mobile,
  // 2 on small screens, 3 on large.
  if (Object.keys(cfg).length === 0) {
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  }
  return out.join(' ')
}

/**
 * Tier-3 deferred-load shell. When `Resource.deferLoading = true`, the
 * SSR pass marks each Table on the page as `deferred` + stamps a
 * `tableUrl`. This wrapper paints a skeleton on first frame and fetches
 * the actual rows from the JSON endpoint after mount; the inner
 * `TableRendererBody` renders identically against either the SSR meta
 * (non-deferred case) or the fetched meta (deferred case).
 *
 * SPA nav with a query change re-runs SSR, which re-stamps `deferred`
 * — so the URL-change effect fires another fetch. The skeleton frame
 * still shows current sort / search / page / filter chrome because the
 * SSR pass mirrors URL state on the deferred Table.
 */
function TableRenderer({ el }: { el: ElementMeta }) {
  const isDeferred = el['deferred'] === true && typeof el['tableUrl'] === 'string'
  const tableUrl   = isDeferred ? (el['tableUrl'] as string) : ''

  // Track the URL search string so a navigation that changes filters /
  // sort / page re-fires the fetch. Initialized lazy on first client
  // render; on the SSR pass we just fall through to skeleton.
  const [search, setSearch] = useState<string>(() =>
    typeof window === 'undefined' ? '' : window.location.search,
  )
  useEffect(() => {
    if (!isDeferred) return
    if (typeof window === 'undefined') return
    setSearch(window.location.search)
  }, [isDeferred, el])

  const [deferredMeta, setDeferredMeta] = useState<ElementMeta | null>(null)
  const [deferredError, setDeferredError] = useState<string | null>(null)

  useEffect(() => {
    if (!isDeferred || !tableUrl) return
    if (typeof window === 'undefined') return
    let cancelled = false
    setDeferredMeta(null)
    setDeferredError(null)
    fetch(tableUrl + search, {
      headers:     { 'Accept': 'application/json' },
      credentials: 'same-origin',
    })
      .then(async r => {
        const data = (await r.json()) as {
          ok?:     boolean
          tables?: Record<string, unknown>[]
          error?:  string
        }
        if (cancelled) return
        if (data.ok && Array.isArray(data.tables) && data.tables.length > 0) {
          setDeferredMeta(data.tables[0] as ElementMeta)
        } else {
          setDeferredError(data.error ?? 'Failed to load table')
        }
      })
      .catch(err => {
        if (cancelled) return
        setDeferredError(err instanceof Error ? err.message : 'Failed to load table')
      })
    return () => { cancelled = true }
  }, [isDeferred, tableUrl, search])

  if (isDeferred && deferredError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Failed to load table: {deferredError}
      </div>
    )
  }
  if (isDeferred && !deferredMeta) {
    return <TableSkeleton el={el} />
  }

  return <TableRendererBody el={isDeferred ? deferredMeta! : el} />
}

/**
 * Skeleton placeholder painted while a deferred-loaded table fetches
 * its rows. Mirrors the table's heading + description chrome (already
 * present on `el`) so the frame doesn't pop layout when the real rows
 * arrive. Renders a small column header strip + 5 placeholder rows.
 */
function TableSkeleton({ el }: { el: ElementMeta }) {
  const heading     = typeof el['heading']     === 'string' ? (el['heading']     as string) : undefined
  const description = typeof el['description'] === 'string' ? (el['description'] as string) : undefined
  const children    = el.children ?? []
  const colCount    = Math.max(1, children.filter(c => c.type === 'column').length)
  return (
    <div className="space-y-3">
      {(heading || description) ? (
        <div className="space-y-1">
          {heading     ? <div className="text-lg font-semibold">{heading}</div>            : null}
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        </div>
      ) : null}
      <div className="rounded-md border">
        <div className="grid border-b bg-muted/50 px-4 py-2"
             style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
          {Array.from({ length: colCount }).map((_, i) => (
            <div key={i} className="h-4 w-20 rounded bg-muted-foreground/20" />
          ))}
        </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, rowIdx) => (
            <div key={rowIdx} className="grid items-center px-4 py-3"
                 style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
              {Array.from({ length: colCount }).map((_, colIdx) => (
                <div key={colIdx} className="h-4 w-2/3 rounded bg-muted-foreground/10 animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TableRendererBody({ el }: { el: ElementMeta }) {
  const navigate = useNavigate()
  const children = el.children ?? []
  const columns  = children.filter(c => c.type === 'column')
  // `Column.toggleable()` columns — sourced from the resolved meta. The
  // user's per-table visibility map is owned + persisted below; the full
  // `columns` list stays available for the toolbar dropdown so hidden
  // columns can be re-shown without a roundtrip.
  const toggleableColumns = columns.filter(c => c['toggleable'] !== undefined)
  // Actions and ActionGroups share placement — both show up in the
  // header/bulk/row toolbars depending on their `placement` field.
  const actionLike = children.filter(c => c.type === 'action' || c.type === 'actionGroup' || c.type === 'slotComponent')
  const filters    = children.filter(c => c.type === 'filter')
  const hasRecordUrl     = Boolean(el['recordUrl'])
  const hasRecordClasses = Boolean(el['recordClasses'])
  const pollInterval     = typeof el['pollInterval'] === 'number' ? el['pollInterval'] as number : undefined
  const defaultGroup     = typeof el['defaultGroup'] === 'string' ? el['defaultGroup'] as string : undefined
  const activeGroupKey   = typeof el['activeGroupKey'] === 'string' ? el['activeGroupKey'] as string : undefined
  const summaries        = el['summaries'] as Record<string, Array<{ kind: string; value: string; label?: string }>> | undefined
  const groupSummaries   = el['groupSummaries'] as
    Record<string, Record<string, Array<{ kind: string; value: string; label?: string }>>> | undefined
  const groupOptions     = (el['groups'] as Array<{
    column:       string
    label:        string
    collapsible?: true
    collapsed?:   true
    date?:        true
    scopable?:    true
  }> | undefined) ?? []
  // Active group's registered metadata (if any). Falls back to a synth
  // for the bare-column form so the heading row still has a label.
  const activeGroupMeta  = defaultGroup
    ? (groupOptions.find(g => g.column === defaultGroup) ?? {
        column:       defaultGroup,
        label:        (() => {
          const col = columns.find(c => c['name'] === defaultGroup)
          return col ? String(col['label'] ?? defaultGroup) : defaultGroup
        })(),
      })
    : undefined
  const groupColumnLabel = activeGroupMeta?.label
  // Heading text becomes a real `<a href>` when the active group opts in
  // via `.scopable()`. Synthesized bare-column groups can't be scopable
  // (no builder call ran).
  const groupHeadingScopable = activeGroupMeta !== undefined
    && (activeGroupMeta as { scopable?: true }).scopable === true

  // Auto-refresh: re-visit current URL on a timer so sort/filter/pagination
  // state survives. Pause while the document is hidden — background tabs
  // shouldn't keep hammering the server.
  useEffect(() => {
    if (!pollInterval || pollInterval <= 0) return
    if (typeof document === 'undefined') return
    let timerId: ReturnType<typeof setInterval> | undefined
    const tick = () => navigate(window.location.pathname + window.location.search)
    const start = () => {
      if (timerId === undefined) timerId = setInterval(tick, pollInterval * 1000)
    }
    const stop = () => {
      if (timerId !== undefined) {
        clearInterval(timerId)
        timerId = undefined
      }
    }
    if (document.visibilityState === 'visible') start()
    const onVis = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      stop()
    }
  }, [pollInterval, navigate])

  // Group actions by placement. `inline` defaults to header so it shows up
  // somewhere visible — explicit placements always win.
  const placementOf = (a: ElementMeta): string => String(a['placement'] ?? 'inline')
  const headerActions = actionLike.filter(a => { const p = placementOf(a); return p === 'header' || p === 'inline' })
  const bulkActions   = actionLike.filter(a => placementOf(a) === 'bulk')
  const rowActions    = actionLike.filter(a => placementOf(a) === 'row')

  const rawRows     = (el['rows'] as unknown[] | undefined) ?? []
  const total       = (el['total'] as number | undefined) ?? rawRows.length
  const search      = el['search'] as string | undefined
  const currentSort = el['currentSort'] as { column: string; direction: 'asc' | 'desc' } | undefined
  const currentPage = (el['currentPage'] as number | undefined) ?? 1
  const perPage     = el['perPage'] as number | undefined
  const searchable  = Boolean(el['searchable'])
  const currentPath = (el['currentPath'] as string | undefined) ?? ''

  // `Column.toggleable()` user-visibility map. Persisted per-table at
  // `pilotiq.table.<currentPath>.columns.<name>` ('1' = hidden,
  // '0' = visible). On first paint, fall back to `meta.toggleable.initiallyHidden`.
  // SSR returns the meta default — the localStorage hydrate happens
  // inside the effect so server + first client render match.
  const columnsVisibilityKey = (name: string): string =>
    `pilotiq.table.${currentPath}.columns.${name}`
  const initialHidden = (): Set<string> => {
    const out = new Set<string>()
    for (const col of toggleableColumns) {
      const cfg = col['toggleable'] as { initiallyHidden?: boolean } | undefined
      if (cfg?.initiallyHidden) out.add(String(col['name']))
    }
    return out
  }
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(initialHidden)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (toggleableColumns.length === 0) return
    const next = new Set<string>()
    for (const col of toggleableColumns) {
      const name = String(col['name'])
      const cfg  = col['toggleable'] as { initiallyHidden?: boolean } | undefined
      try {
        const stored = window.localStorage.getItem(columnsVisibilityKey(name))
        if (stored === '1') next.add(name)
        else if (stored === '0') { /* visible */ }
        else if (cfg?.initiallyHidden) next.add(name)
      } catch {
        if (cfg?.initiallyHidden) next.add(name)
      }
    }
    setHiddenColumns(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, toggleableColumns.length])
  const toggleColumnHidden = (name: string, nextHidden: boolean): void => {
    setHiddenColumns(prev => {
      const next = new Set(prev)
      if (nextHidden) next.add(name)
      else            next.delete(name)
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(columnsVisibilityKey(name), nextHidden ? '1' : '0') }
        catch { /* private mode / quota — silent */ }
      }
      return next
    })
  }
  // Filtered column list used by every render path (header, body cells,
  // group + footer summaries, empty-state colSpan). Non-toggleable
  // columns always survive.
  const visibleColumns = columns.filter(c => !hiddenColumns.has(String(c['name'])))

  // Tier-3 — when the table opts into `Table.queryStringIdentifier(...)`,
  // every URL key (search / sort / page / perPage / group / filter names)
  // gets prefixed with `${id}_` so multiple tables on one page don't
  // collide on `?search=` etc. Bare keys still apply when unset.
  const queryPrefix = typeof el['queryStringIdentifier'] === 'string'
    ? el['queryStringIdentifier'] as string
    : undefined

  // Reorderable rows — grip column + HTML5 DnD wiring. Rows live in
  // local state during a drag so the optimistic reorder happens
  // immediately; on POST failure we roll back to the server's order.
  const reorderableColumn = typeof el['reorderableColumn'] === 'string' ? el['reorderableColumn'] as string : undefined
  const reorderUrl        = typeof el['reorderUrl']        === 'string' ? el['reorderUrl']        as string : undefined
  const [reorderRowsLocal, setReorderRowsLocal] = useState<unknown[] | null>(null)
  const rows = reorderRowsLocal ?? rawRows
  const { notify } = useToast()

  // Read the explicit `?group=` value out of the URL so sort/pagination
  // links preserve "None" overrides (`?group=`). Server render: no URL,
  // so we fall back to `defaultGroup` from the meta — which is already
  // the reconciled active column.
  const urlGroup: string | undefined = typeof window === 'undefined'
    ? undefined
    : (() => {
        const sp = new URLSearchParams(window.location.search)
        const k = prefixK(queryPrefix, 'group')
        return sp.has(k) ? sp.get(k)! : undefined
      })()

  // Collapsible groups — per-group fold state. Keyed by `_groupValue`
  // (the raw column value, NOT the resolved title) so rows that share a
  // group key fold together. Persisted in localStorage at
  // `pilotiq.table.<currentPath>.groups.<column>.<value>`. Default-
  // collapsed groups derive their initial state from `meta.collapsed`.
  const groupCollapsible = activeGroupMeta?.collapsible === true
  const groupDefaultCollapsed = activeGroupMeta?.collapsed === true
  const groupStorageKey = (groupValue: string): string =>
    `pilotiq.table.${currentPath}.groups.${defaultGroup ?? ''}.${groupValue}`
  // Lazy-init from localStorage on mount; SSR returns the meta default.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!groupCollapsible || !defaultGroup) return
    if (typeof window === 'undefined') return
    // Walk the rendered rows once on mount, picking up persisted state.
    const next: Record<string, boolean> = {}
    const seen = new Set<string>()
    for (const row of rows) {
      const v = String((row as Record<string, unknown>)['_groupValue'] ?? '')
      if (seen.has(v)) continue
      seen.add(v)
      try {
        const stored = window.localStorage.getItem(groupStorageKey(v))
        next[v] = stored === null ? groupDefaultCollapsed : stored === '1'
      } catch {
        next[v] = groupDefaultCollapsed
      }
    }
    setCollapsedGroups(next)
    // Re-run if the active group changes — different values, different
    // localStorage namespace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultGroup, groupCollapsible, groupDefaultCollapsed, currentPath])
  const toggleGroupCollapsed = (groupValue: string): void => {
    setCollapsedGroups(prev => {
      const nextOpen = !prev[groupValue]
      const next = { ...prev, [groupValue]: nextOpen }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(groupStorageKey(groupValue), nextOpen ? '1' : '0')
        } catch { /* private mode / quota — silent */ }
      }
      return next
    })
  }
  const state: TableUrlState = {
    ...(search       !== undefined ? { search }      : {}),
    ...(currentSort  !== undefined ? { sort: currentSort } : {}),
    page: currentPage,
    ...(urlGroup     !== undefined ? { group: urlGroup }
        : defaultGroup !== undefined ? { group: defaultGroup }
        : {}),
    ...(activeGroupKey !== undefined ? { groupKey: activeGroupKey } : {}),
  }

  // Snapshot active filter values for sort/pagination href construction.
  // Filter form submits already carry these (selects are inside the
  // form); `<a href>` links don't, so we re-emit them here.
  const activeFilters: Record<string, string> = {}
  for (const f of filters) {
    const v = f['value']
    if (typeof v === 'string' && v !== '') activeFilters[String(f['name'])] = v
  }

  // Drill-in / drill-out URL builders for the group heading link and the
  // active-key chip's clear button. Drill-in sets `?<prefix>groupKey=v`
  // and resets `page`; drill-out clears it. Both round-trip foreign
  // params (other tables' state) through `buildTableQuery`.
  const buildGroupKeyHref = (value: string): string => buildTableQuery(
    state, { groupKey: value, page: 1 }, currentPath, activeFilters, queryPrefix,
  )
  const drillOutHref = (): string => buildTableQuery(
    state, { groupKey: '', page: 1 }, currentPath, activeFilters, queryPrefix,
  )

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

  // ── Reorder DnD state + handlers ──────────────────────
  // dragId — the row currently being dragged (string id), or null.
  // dropAt — the boundary the cursor is hovering (0..rows.length), or null.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const onRowDragStart = (id: string) => (e: React.DragEvent<HTMLTableRowElement>): void => {
    if (!reorderEnabled) return
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch { /* IE quirk */ }
  }
  const onRowDragOver = (idx: number) => (e: React.DragEvent<HTMLTableRowElement>): void => {
    if (!reorderEnabled || dragId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect      = e.currentTarget.getBoundingClientRect()
    const aboveHalf = e.clientY < rect.top + rect.height / 2
    setDropAt(aboveHalf ? idx : idx + 1)
  }
  const onRowDrop = async (e: React.DragEvent<HTMLTableRowElement>): Promise<void> => {
    if (!reorderEnabled || dragId === null || dropAt === null || !reorderUrl) {
      setDragId(null); setDropAt(null); return
    }
    e.preventDefault()
    const fromIdx = visibleIds.findIndex(id => id === dragId)
    setDragId(null); setDropAt(null)
    if (fromIdx < 0) return
    const target = dropAt > fromIdx ? dropAt - 1 : dropAt
    if (target === fromIdx) return
    const reordered = rows.slice()
    const moved = reordered.splice(fromIdx, 1)[0]
    reordered.splice(target, 0, moved)
    const newIds = reordered.map((row, i) => rowId(row, i))
    const previousLocal = reorderRowsLocal
    setReorderRowsLocal(reordered)
    try {
      const res = await fetch(reorderUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({ ids: newIds }),
      })
      if (!res.ok) throw new Error(`Reorder failed (${res.status})`)
    } catch (err) {
      // Roll back to server order. The toast surfaces the failure;
      // next page render fetches the persisted column.
      setReorderRowsLocal(previousLocal)
      notify({
        type:  'error',
        title: 'Could not save new order',
        body:  err instanceof Error ? err.message : 'Reorder failed',
      })
    }
  }
  const onRowDragEnd = (): void => {
    setDragId(null); setDropAt(null)
  }

  if (columns.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No columns configured for this table.
      </div>
    )
  }

  const isCardsLayout = el['contentLayout'] === 'cards'
  const cardsPerRow   = el['cardsPerRow'] as Record<string, number> | undefined

  const totalPages = perPage && perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1
  const showPagination = totalPages > 1
  const hasFilters     = filters.length > 0
  // Filter layout positions (Filament v5). `'modal'` (default) keeps the
  // toolbar Filters button + popover. The three inline modes lay every
  // filter widget out as a wrapping strip in the matching slot. The
  // collapsible variant adds a toolbar toggle + per-table-path persisted
  // open state.
  const filtersLayout = (el['filtersLayout'] as
    | 'above-content' | 'above-content-collapsible' | 'below-content'
    | undefined) ?? 'modal'
  const filtersInModal = filtersLayout === 'modal'
  const filtersAbove   = filtersLayout === 'above-content'
                       || filtersLayout === 'above-content-collapsible'
  const filtersBelow   = filtersLayout === 'below-content'
  const filtersCollapsible = filtersLayout === 'above-content-collapsible'
  const filtersStripStorageKey = `pilotiq.table.${currentPath}.filters.open`
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    if (!filtersCollapsible) return true
    if (typeof window === 'undefined') return false
    try {
      const stored = window.localStorage.getItem(filtersStripStorageKey)
      // Default to OPEN when filters are active (URL carried filter values
      // in) so the user can see what's filtering — same UX cue as the
      // active-filters pill row.
      if (stored === null) return Object.keys(activeFilters).length > 0
      return stored === '1'
    } catch { return false }
  })
  const toggleFiltersOpen = (): void => {
    setFiltersOpen(prev => {
      const next = !prev
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(filtersStripStorageKey, next ? '1' : '0') }
        catch { /* private mode / quota — silent */ }
      }
      return next
    })
  }
  // Show the "Group by" dropdown when 2+ groups are registered, or 1
  // group with rich metadata (label/collapsible/etc.). A single bare
  // `defaultGroup('col')` with no `groups([...])` registration shouldn't
  // render the picker — there's nothing to pick.
  const hasGroupPicker = groupOptions.length >= 2
    || (groupOptions.length === 1 && Boolean(
      groupOptions[0]!.collapsible
      || groupOptions[0]!.collapsed
      || groupOptions[0]!.date,
    ))
  const sortableColumns  = isCardsLayout ? columns.filter(c => Boolean(c['sortable'])) : []
  const hasSortPicker    = isCardsLayout && sortableColumns.length > 0
  // Only modal + collapsible mount a toolbar widget; the always-visible
  // strip modes don't add anything to the header bar.
  const showFiltersInToolbar = hasFilters && (filtersInModal || filtersCollapsible)
  const hasColumnsToggle = toggleableColumns.length > 0
  const showHeaderBar    = searchable || headerActions.length > 0 || showFiltersInToolbar || hasGroupPicker || hasSortPicker || hasColumnsToggle
  const hasBulkActions = bulkActions.length > 0
  const hasRowActions  = rowActions.length > 0

  // Drag-to-reorder is enabled only when the visible rows ARE the
  // canonical sort. Filters / search / non-default sort / pagination
  // beyond page 1 all break that invariant; we render the grip column
  // greyed-out instead of letting the user reorder a slice that won't
  // round-trip cleanly. `reorderableColumn` is set server-side when
  // `Table.reorderable()` opts in.
  const sortMatchesReorder =
    currentSort?.column === reorderableColumn &&
    currentSort?.direction === 'asc'
  const filtersActive = Object.keys(activeFilters).length > 0
  const searchActive  = typeof search === 'string' && search !== ''
  const reorderEnabled =
    reorderableColumn !== undefined &&
    reorderUrl        !== undefined &&
    sortMatchesReorder              &&
    !filtersActive                  &&
    !searchActive                   &&
    currentPage === 1
  const reorderColumnVisible = reorderableColumn !== undefined
  const totalCols = visibleColumns.length
                  + (hasBulkActions      ? 1 : 0)
                  + (hasRowActions       ? 1 : 0)
                  + (reorderColumnVisible ? 1 : 0)

  // Top-bar chrome (heading / description / striped / emptyState).
  const tableHeading     = el['heading']     as string | undefined
  const tableDescription = el['description'] as string | undefined
  const striped          = Boolean(el['striped'])
  const emptyState       = el['emptyState']  as { heading?: string; description?: string; icon?: string } | undefined
  const filteredEmptyState = el['filteredEmptyState'] as { heading?: string; description?: string; icon?: string } | undefined
  const hasFilterOrSearch = (search !== undefined && search !== '') ||
    Object.keys(activeFilters).length > 0
  // Distinct copy when a query / filter is active. Falls back to
  // `emptyState` when `filteredEmptyState` is not set, preserving the
  // pre-2026-05-04 behavior for tables that haven't opted in.
  const activeEmpty = (hasFilterOrSearch && filteredEmptyState) ? filteredEmptyState : emptyState
  const EmptyIcon = activeEmpty?.icon ? (resolveIcon(activeEmpty.icon) ?? InboxIcon) : InboxIcon

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
          {(searchable || showFiltersInToolbar || hasGroupPicker || hasSortPicker || hasColumnsToggle) ? (
            <div className="flex items-center gap-2">
              {searchable && (
                <form method="get" action={currentPath || undefined} className="flex items-end gap-2">
                  {/* Carry the table's own non-search slice forward via hidden
                      inputs so a native form submit (Enter) preserves sort /
                      page / filters. Other tables' params on the URL also
                      survive via the same loop. */}
                  <SearchFormHiddenInputs prefix={queryPrefix} />
                  <Input
                    type="search"
                    name={prefixK(queryPrefix, 'search')}
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
              {hasFilters && filtersInModal && (
                <FilterPopover filters={filters} prefix={queryPrefix} />
              )}
              {hasFilters && filtersCollapsible && (
                <FilterStripToggle
                  filters={filters}
                  open={filtersOpen}
                  onToggle={toggleFiltersOpen}
                />
              )}
              {hasGroupPicker && (
                <TableGroupPicker
                  options={groupOptions}
                  active={defaultGroup}
                  onChange={(value) => {
                    // value === '' → explicit "None" (clears defaultGroup);
                    // value !== '' → switch to that column.
                    const href = buildTableQuery(
                      state,
                      { page: 1, group: value },
                      currentPath,
                      activeFilters,
                      queryPrefix,
                    )
                    navigate(href)
                  }}
                />
              )}
              {hasSortPicker && (
                <SortByPicker
                  columns={sortableColumns}
                  active={currentSort}
                  onChange={(column, direction) => {
                    const href = buildTableQuery(
                      state,
                      { sort: { column, direction }, page: 1 },
                      currentPath,
                      activeFilters,
                      queryPrefix,
                    )
                    navigate(href)
                  }}
                />
              )}
              {toggleableColumns.length > 0 && (
                <ColumnsToggleDropdown
                  columns={toggleableColumns}
                  hidden={hiddenColumns}
                  onToggle={toggleColumnHidden}
                />
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
      {hasFilters && filtersInModal && <ActiveFiltersBar filters={filters} prefix={queryPrefix} />}
      {hasFilters && filtersAbove && filtersOpen && (
        <FilterStrip filters={filters} prefix={queryPrefix} />
      )}
      {activeGroupKey !== undefined && (
        <ActiveGroupKeyChip
          label={groupColumnLabel ?? defaultGroup ?? ''}
          value={activeGroupKey}
          displayValue={(() => {
            // Prefer a row-resolved `_groupTitle` (server stamped via
            // `getTitleFromRecordUsing`) so the chip reads the same as
            // a banded heading. Falls back to the raw bucket key when
            // no row matched — empty drilled-in pages still show what
            // they're drilled into.
            for (const r of rows) {
              const obj = r as Record<string, unknown>
              if (String(obj['_groupValue'] ?? '') !== activeGroupKey) continue
              const t = obj['_groupTitle']
              if (typeof t === 'string' && t !== '') return t
              break
            }
            return activeGroupKey
          })()}
          clearHref={drillOutHref()}
          navigate={navigate}
        />
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
      {isCardsLayout ? (
        <CardsLayoutBody
          el={el}
          columns={columns}
          rows={rows}
          visibleIds={visibleIds}
          selected={selected}
          toggleRow={toggleRow}
          hasBulkActions={hasBulkActions}
          hasRowActions={hasRowActions}
          rowActions={rowActions}
          hasRecordUrl={hasRecordUrl}
          hasRecordClasses={hasRecordClasses}
          striped={striped}
          activeEmpty={activeEmpty}
          EmptyIcon={EmptyIcon}
          hasFilterOrSearch={hasFilterOrSearch}
          defaultGroup={defaultGroup}
          groupColumnLabel={groupColumnLabel}
          groupCollapsible={groupCollapsible}
          collapsedGroups={collapsedGroups}
          toggleGroupCollapsed={toggleGroupCollapsed}
          cardsPerRow={cardsPerRow}
          navigate={navigate}
          groupHeadingScopable={groupHeadingScopable}
          buildGroupKeyHref={buildGroupKeyHref}
        />
      ) : (
      <div className="rounded-xl border bg-card overflow-hidden">
        <DataTable>
          <TableHeader className="bg-muted">
            <TableRow>
              {reorderColumnVisible && (
                <TableHead className="w-9 px-2" aria-label="Reorder" />
              )}
              {hasBulkActions && (
                <TableHead className="w-9 px-3">
                  <Checkbox
                    aria-label="Select all rows"
                    checked={allChecked}
                    onCheckedChange={() => toggleAll()}
                  />
                </TableHead>
              )}
              {visibleColumns.map((col, i) => {
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
                const href = buildTableQuery(state, { sort: next, page: 1 }, currentPath, activeFilters, queryPrefix)
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
                      {activeEmpty?.heading
                        ?? (hasFilterOrSearch ? 'No matching records' : 'No records yet')}
                    </p>
                    {(activeEmpty?.description ||
                      (hasFilterOrSearch && !activeEmpty?.description)) && (
                      <p className="text-sm">
                        {activeEmpty?.description
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
              // Group banding — emit a heading row whenever `_groupValue`
              // differs from the previous row. The first row in any group
              // gets the heading; rows within keep their normal chrome.
              const groupValue = defaultGroup
                ? String(recordObj['_groupValue'] ?? '')
                : undefined
              const groupTitle = defaultGroup
                ? (recordObj['_groupTitle'] as string | undefined)
                : undefined
              const groupDescription = defaultGroup
                ? (recordObj['_groupDescription'] as string | undefined)
                : undefined
              const prevGroupValue = defaultGroup && ri > 0
                ? String(((rows[ri - 1] as Record<string, unknown>)['_groupValue'] ?? ''))
                : undefined
              const showGroupHeader =
                defaultGroup !== undefined && groupValue !== prevGroupValue
              // Hide data rows whose group is collapsed. The heading row
              // for that group still renders (so the user can re-expand).
              const isInCollapsedGroup =
                groupCollapsible && groupValue !== undefined && collapsedGroups[groupValue] === true
              // Filament-style per-cell linking. Each data cell wraps
              // its content in a real `<a href>` when the column resolves
              // to a record URL — column override (`Column.recordUrl(fn)`)
              // beats inheritance from the table (`Table.recordUrl(fn)`),
              // and `Column.recordUrl(false)` opts out. Action and bulk
              // cells are never wrapped, so clicks there fire only their
              // own handlers — no event-bubbling gymnastics.
              const tableUrl = hasRecordUrl ? (recordObj['_recordUrl'] as string | undefined) : undefined
              const colUrls = (recordObj['_columnRecordUrls'] as Record<string, string> | undefined) ?? {}
              const rowHasAnyLink = tableUrl !== undefined || Object.keys(colUrls).length > 0
              const customRowClasses = hasRecordClasses
                ? (recordObj['_recordClasses'] as string | undefined) ?? ''
                : ''
              const rowClassName = [stripedClass, rowHasAnyLink ? 'cursor-pointer' : '', customRowClasses]
                .filter(Boolean)
                .join(' ')
                .trim()
              return (
                <React.Fragment key={id}>
                {showGroupHeader && (
                  <TableRow key={`group-${id}`} className="bg-muted/40 hover:bg-muted/40">
                    <TableCell
                      colSpan={totalCols}
                      className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {(() => {
                        const drillable = groupHeadingScopable
                          && groupValue !== undefined
                          && groupValue !== ''
                        const headingText = (
                          <GroupHeaderText
                            label={groupColumnLabel}
                            value={groupValue}
                            title={groupTitle}
                            description={groupDescription}
                          />
                        )
                        const headingNode = drillable
                          ? <GroupHeadingLink href={buildGroupKeyHref(groupValue!)} navigate={navigate}>{headingText}</GroupHeadingLink>
                          : headingText
                        if (groupCollapsible) {
                          return (
                            <div className="flex w-full items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center"
                                onClick={() => toggleGroupCollapsed(groupValue!)}
                                aria-expanded={!isInCollapsedGroup}
                                aria-label={isInCollapsedGroup ? 'Expand group' : 'Collapse group'}
                              >
                                <ChevronDownIcon
                                  className={[
                                    'size-4 transition-transform',
                                    isInCollapsedGroup ? '-rotate-90' : '',
                                  ].filter(Boolean).join(' ')}
                                />
                              </button>
                              {headingNode}
                            </div>
                          )
                        }
                        return headingNode
                      })()}
                    </TableCell>
                  </TableRow>
                )}
                {isInCollapsedGroup ? null : (
                <TableRow
                  data-state={isSelected ? 'selected' : undefined}
                  className={[
                    rowClassName,
                    dragId === id ? 'opacity-50' : '',
                    dropAt === ri && dragId !== null ? 'border-t-2 border-t-primary' : '',
                  ].filter(Boolean).join(' ') || undefined}
                  draggable={reorderEnabled || undefined}
                  onDragStart={reorderEnabled ? onRowDragStart(id) : undefined}
                  onDragOver={reorderEnabled  ? onRowDragOver(ri)  : undefined}
                  onDrop={reorderEnabled      ? onRowDrop          : undefined}
                  onDragEnd={reorderEnabled   ? onRowDragEnd       : undefined}
                >
                  {reorderColumnVisible && (
                    <TableCell className="w-9 px-2">
                      <span
                        aria-label={reorderEnabled ? 'Drag to reorder' : 'Reorder paused — clear filters and sort to enable'}
                        className={
                          reorderEnabled
                            ? 'inline-flex cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing'
                            : 'inline-flex cursor-not-allowed text-muted-foreground/40'
                        }
                      >
                        <GripVerticalIcon className="size-4" />
                      </span>
                    </TableCell>
                  )}
                  {hasBulkActions && (
                    <TableCell className="w-9 px-3">
                      <Checkbox
                        aria-label={`Select row ${id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(id)}
                      />
                    </TableCell>
                  )}
                  {visibleColumns.map((col, ci) => {
                    const name = String(col['name'] ?? '')
                    const value = recordObj[name]
                    const align = col['alignment'] === 'center' ? 'text-center'
                                : col['alignment'] === 'end'    ? 'text-right'
                                : 'text-left'
                    const widthStyle = col['width']
                      ? { width: String(col['width']) }
                      : undefined

                    // Inline-edit cells take priority over read-only chrome.
                    // `_cellEditable[name]` is set per row by `loadTableRecords`
                    // only when `R.canEdit(user, row)` passed; the URL was
                    // stamped by `tagCellEditUrls` immediately after.
                    const editableMap = recordObj['_cellEditable'] as Record<string, true> | undefined
                    const editUrlMap  = recordObj['_cellEditUrls'] as Record<string, string> | undefined
                    const cellDisabledMap = recordObj['_cellDisabled'] as Record<string, true> | undefined
                    const editUrl = editableMap?.[name] ? editUrlMap?.[name] : undefined
                    const EditableComp = editUrl !== undefined
                      ? pickEditableCell(String(col['columnType'] ?? 'text'))
                      : null
                    if (EditableComp && editUrl !== undefined) {
                      const cellDisabled = col['disabled'] === true || cellDisabledMap?.[name] === true
                      const cellSelectOptionsMap = recordObj['_cellSelectOptions'] as
                        Record<string, Array<{ value: string; label: string }>> | undefined
                      const rowOptions = cellSelectOptionsMap?.[name]
                      return (
                        <TableCell key={ci} className={`text-sm text-foreground ${align} p-0`} style={widthStyle}>
                          <EditableComp
                            url={editUrl}
                            col={col}
                            value={value}
                            disabled={cellDisabled}
                            {...(rowOptions ? { rowOptions } : {})}
                          />
                        </TableCell>
                      )
                    }

                    const cellContent = formatCell(value, col, recordObj)
                    const colUrl = resolveColumnUrl(col, tableUrl, colUrls)
                    return (
                      <TableCell key={ci} className={`text-sm text-foreground ${align} p-0`} style={widthStyle}>
                        {colUrl !== undefined
                          ? <RecordCellLink href={colUrl} navigate={navigate}>{cellContent}</RecordCellLink>
                          : <div className="px-2 py-2">{cellContent}</div>}
                      </TableCell>
                    )
                  })}
                  {hasRowActions && (
                    <TableCell className="w-px text-right">
                      {renderRowActions(id, recordObj, rowActions)}
                    </TableCell>
                  )}
                </TableRow>
                )}
                {/* Per-group summary row — emitted at the end of each
                    group band (last row in group OR last row overall),
                    aligned to the same columns as the global tfoot.
                    Suppressed when the group is collapsed since the data
                    rows themselves are hidden. */}
                {(() => {
                  if (!groupSummaries) return null
                  if (groupValue === undefined) return null
                  if (isInCollapsedGroup) return null
                  const isLastInGroup = ri === rows.length - 1
                    || String(((rows[ri + 1] as Record<string, unknown>)['_groupValue'] ?? '')) !== groupValue
                  if (!isLastInGroup) return null
                  const perCol = groupSummaries[groupValue]
                  if (!perCol || Object.keys(perCol).length === 0) return null
                  return (
                    <TableRow key={`group-summary-${id}`} className="bg-muted/20 hover:bg-muted/20">
                      {reorderColumnVisible && <TableCell />}
                      {hasBulkActions      && <TableCell />}
                      {visibleColumns.map((col, ci) => {
                        const name  = String(col['name'] ?? '')
                        const align = col['alignment'] === 'center' ? 'text-center'
                                    : col['alignment'] === 'end'    ? 'text-right'
                                    : 'text-left'
                        const items = perCol[name]
                        return (
                          <TableCell key={ci} className={`text-xs font-medium ${align} px-2 py-1.5`}>
                            {items?.map((s, i) => (
                              <div key={i} className="leading-tight">
                                {s.label && <span className="text-muted-foreground">{s.label}: </span>}
                                <span>{s.value}</span>
                              </div>
                            ))}
                          </TableCell>
                        )
                      })}
                      {hasRowActions && <TableCell />}
                    </TableRow>
                  )
                })()}
                </React.Fragment>
              )
            })}
          </TableBody>
          {summaries && Object.keys(summaries).length > 0 && (
            <TableFooter>
              <TableRow>
                {reorderColumnVisible && <TableCell />}
                {hasBulkActions && <TableCell />}
                {visibleColumns.map((col, ci) => {
                  const name  = String(col['name'] ?? '')
                  const align = col['alignment'] === 'center' ? 'text-center'
                              : col['alignment'] === 'end'    ? 'text-right'
                              : 'text-left'
                  const items = summaries[name]
                  return (
                    <TableCell key={ci} className={`text-sm font-medium ${align}`}>
                      {items?.map((s, i) => (
                        <div key={i} className="leading-tight">
                          {s.label && <span className="text-muted-foreground">{s.label}: </span>}
                          <span>{s.value}</span>
                        </div>
                      ))}
                    </TableCell>
                  )
                })}
                {hasRowActions && <TableCell />}
              </TableRow>
            </TableFooter>
          )}
        </DataTable>
      </div>
      )}
      {showPagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {currentPage} of {totalPages}{total > 0 ? ` · ${total} record${total === 1 ? '' : 's'}` : ''}
          </span>
          <div className="flex items-center gap-2">
            {currentPage > 1 && (
              <a
                href={buildTableQuery(state, { page: currentPage - 1 }, currentPath, activeFilters, queryPrefix)}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                ← Previous
              </a>
            )}
            {currentPage < totalPages && (
              <a
                href={buildTableQuery(state, { page: currentPage + 1 }, currentPath, activeFilters, queryPrefix)}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
      {hasFilters && filtersBelow && (
        <FilterStrip filters={filters} prefix={queryPrefix} />
      )}
    </div>
  )
}

/**
 * Card-grid body for `Table.contentLayout('cards')`. Renders the rows
 * area only — the surrounding chrome (heading / search / filters /
 * pagination / bulk-action toolbar / "Sort by" picker) lives in the
 * parent `TableRendererBody` so both layouts share it.
 *
 * Each card renders its `_cardChildren` schema via the standard
 * `renderElement` walker, so any display-Element (Heading, Text, Image,
 * Icon, Badge entries, layout primitives, etc.) drops in without a new
 * renderer. Per-row chrome attaches via the same `_recordUrl` /
 * `_recordClasses` / `_visibleActions` / `_disabledActions` keys the
 * table-mode renderer reads from — `loadTableRecords` is unchanged.
 *
 * Group banding splits the rows into contiguous sections by
 * `_groupValue`, emitting a heading row above each section. The user's
 * configured per-card grid (`cardsPerRow`) re-applies inside every
 * section so the column count stays consistent.
 */
function CardsLayoutBody({
  el, columns, rows, visibleIds, selected, toggleRow,
  hasBulkActions, hasRowActions, rowActions, hasRecordUrl, hasRecordClasses,
  striped, activeEmpty, EmptyIcon, hasFilterOrSearch,
  defaultGroup, groupColumnLabel, groupCollapsible, collapsedGroups, toggleGroupCollapsed,
  cardsPerRow, navigate,
  groupHeadingScopable, buildGroupKeyHref,
}: {
  el:                ElementMeta
  columns:           ElementMeta[]
  rows:              unknown[]
  visibleIds:        string[]
  selected:          Set<string>
  toggleRow:         (id: string) => void
  hasBulkActions:    boolean
  hasRowActions:     boolean
  rowActions:        ElementMeta[]
  hasRecordUrl:      boolean
  hasRecordClasses:  boolean
  striped:           boolean
  activeEmpty:       { heading?: string; description?: string; icon?: string } | undefined
  EmptyIcon:         React.ComponentType<{ className?: string }>
  hasFilterOrSearch: boolean
  defaultGroup:      string | undefined
  groupColumnLabel:  string | undefined
  groupCollapsible:  boolean
  collapsedGroups:   Record<string, boolean>
  toggleGroupCollapsed: (groupValue: string) => void
  cardsPerRow:       Record<string, number> | undefined
  navigate:          NavigateFn
  // Drill-in affordances. Sparse: when `groupHeadingScopable` is false,
  // the heading renders as before; `buildGroupKeyHref` is unused.
  groupHeadingScopable?: boolean
  buildGroupKeyHref?:    (value: string) => string
}) {
  void el // keep prop for future telemetry; silences unused-prop lint
  void columns
  void striped // visual stripes don't apply to cards (each card has its own surface)

  const gridClass = `grid gap-4 ${cardsPerRowClasses(cardsPerRow)}`

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card py-12 text-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <EmptyIcon className="size-8 opacity-60" />
          <p className="text-base font-medium text-foreground">
            {activeEmpty?.heading
              ?? (hasFilterOrSearch ? 'No matching records' : 'No records yet')}
          </p>
          {(activeEmpty?.description ||
            (hasFilterOrSearch && !activeEmpty?.description)) && (
            <p className="text-sm">
              {activeEmpty?.description
                ?? 'Try clearing filters or adjusting your search.'}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Split rows into contiguous group-banded sections so each section
  // can render its own heading + grid. Without an active group this is
  // one section with no heading.
  type Section = {
    groupValue?:  string
    title?:       string
    description?: string
    indices:      number[]
  }
  const sections: Section[] = []
  if (defaultGroup === undefined) {
    sections.push({ indices: rows.map((_, i) => i) })
  } else {
    let current: Section | undefined
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as Record<string, unknown>
      const v = String(r['_groupValue'] ?? '')
      if (current === undefined || current.groupValue !== v) {
        const title       = r['_groupTitle']       as string | undefined
        const description = r['_groupDescription'] as string | undefined
        current = { groupValue: v, indices: [], ...(title ? { title } : {}), ...(description ? { description } : {}) }
        sections.push(current)
      }
      current.indices.push(i)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, si) => {
        const collapsed = groupCollapsible
          && section.groupValue !== undefined
          && collapsedGroups[section.groupValue] === true
        return (
          <div key={si} className="flex flex-col gap-3">
            {section.groupValue !== undefined && (() => {
              const drillable = groupHeadingScopable === true
                && buildGroupKeyHref !== undefined
                && section.groupValue !== ''
              const headingText = (
                <GroupHeaderText
                  label={groupColumnLabel}
                  value={section.groupValue}
                  title={section.title}
                  description={section.description}
                />
              )
              const headingNode = drillable
                ? <GroupHeadingLink href={buildGroupKeyHref!(section.groupValue!)} navigate={navigate}>{headingText}</GroupHeadingLink>
                : headingText
              if (groupCollapsible) {
                return (
                  <div className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <button
                      type="button"
                      className="inline-flex items-center"
                      onClick={() => toggleGroupCollapsed(section.groupValue!)}
                      aria-expanded={!collapsed}
                      aria-label={collapsed ? 'Expand group' : 'Collapse group'}
                    >
                      <ChevronDownIcon
                        className={[
                          'size-4 transition-transform',
                          collapsed ? '-rotate-90' : '',
                        ].filter(Boolean).join(' ')}
                      />
                    </button>
                    {headingNode}
                  </div>
                )
              }
              return (
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {headingNode}
                </div>
              )
            })()}
            {!collapsed && (
              <div className={gridClass}>
                {section.indices.map((ri) => {
                  const id = visibleIds[ri]!
                  const recordObj = rows[ri] as Record<string, unknown>
                  const isSelected = selected.has(id)
                  const recordUrl = hasRecordUrl ? (recordObj['_recordUrl'] as string | undefined) : undefined
                  const customRowClasses = hasRecordClasses
                    ? (recordObj['_recordClasses'] as string | undefined) ?? ''
                    : ''
                  const cardChildren = (recordObj['_cardChildren'] as ElementMeta[] | undefined) ?? []
                  const cardClassName = [
                    'group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors',
                    recordUrl ? 'hover:border-primary/40 hover:bg-accent/30' : '',
                    isSelected ? 'border-primary ring-2 ring-primary/20' : '',
                    customRowClasses,
                  ].filter(Boolean).join(' ')

                  const onLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
                    if (e.button !== 0) return
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                    e.preventDefault()
                    if (recordUrl) void navigate(recordUrl)
                  }

                  return (
                    <div key={id} className={cardClassName}>
                      {recordUrl !== undefined && (
                        <a
                          href={recordUrl}
                          onClick={onLinkClick}
                          aria-label="Open record"
                          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="sr-only">Open record</span>
                        </a>
                      )}
                      {hasBulkActions && (
                        <div className="absolute top-3 right-3 z-10">
                          <Checkbox
                            aria-label={`Select row ${id}`}
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(id)}
                            data-no-row-nav
                          />
                        </div>
                      )}
                      <div className="relative z-[1] flex flex-col gap-3">
                        {cardChildren.length === 0 ? (
                          <div className="text-xs italic text-muted-foreground">
                            No card content configured.
                          </div>
                        ) : cardChildren.map((c, i) => renderElement(c, i))}
                      </div>
                      {hasRowActions && (
                        <div className="relative z-10 mt-auto flex items-center justify-end pt-2 border-t border-border/60">
                          {renderRowActions(id, recordObj, rowActions)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export interface SchemaRendererProps {
  elements: ElementMeta[]
  /**
   * Plan #15 — per-widget initial payload map keyed by element id.
   * Auto-gen page stubs pass `vp._widgetData` here so widget renderers
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
