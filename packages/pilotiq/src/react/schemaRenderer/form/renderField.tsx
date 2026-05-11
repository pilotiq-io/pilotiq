import React from 'react'
import type { ElementMeta } from '../../../schema/Element.js'
import { FieldShell } from '../../fields/FieldShell.js'
import { TextLikeInput } from '../../fields/TextLikeInput.js'
import { useTextInputControls } from '../../fields/textInputControls.js'
import { SelectFieldInput } from '../../fields/SelectFieldInput.js'
import { ToggleFieldInput } from '../../fields/ToggleFieldInput.js'
import { DateFieldInput } from '../../fields/DateFieldInput.js'
import { HiddenInput } from '../../fields/HiddenInput.js'
import { CheckboxInput } from '../../fields/CheckboxInput.js'
import { RadioInput } from '../../fields/RadioInput.js'
import { ToggleButtonsInput } from '../../fields/ToggleButtonsInput.js'
import { CheckboxListInput } from '../../fields/CheckboxListInput.js'
import { SliderInput } from '../../fields/SliderInput.js'
import { ColorInput } from '../../fields/ColorInput.js'
import { DateTimeInput } from '../../fields/DateTimeInput.js'
import { KeyValueInput } from '../../fields/KeyValueInput.js'
import { TagsInput } from '../../fields/TagsInput.js'
import { FileUploadInput } from '../../fields/FileUploadInput.js'
import { MarkdownInput } from '../../fields/MarkdownInput.js'
import { RepeaterInput } from '../../fields/RepeaterInput.js'
import { BuilderInput } from '../../fields/BuilderInput.js'
import { getFieldRenderer } from '../../registry.js'
import { getFieldLabelSlot } from '../../FieldLabelSlotRegistry.js'

// ─── Field rendering ────────────────────────────────────────
//
// Each input lives in its own file under `react/fields/`. This file
// stays a thin dispatcher: parse meta → pick component → wrap in
// `<FieldShell>`. The only renderElement coupling is inside
// `TextFieldShell` (suffix-action Element rendering) — injected to
// avoid the SchemaRenderer ↔ form cycle.

type RenderElement = (el: ElementMeta, index: number) => React.ReactNode

export function renderField(
  el:            ElementMeta,
  index:         number,
  renderElement: RenderElement,
): React.ReactNode {
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
        renderElement={renderElement}
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
  el, name, label, required, common, labelSlot, renderElement,
}: {
  el:          ElementMeta
  name:        string
  label:       string
  required:    boolean
  common:      Record<string, unknown>
  labelSlot?:  React.ReactNode
  renderElement: RenderElement
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
