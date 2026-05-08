import React from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { useFieldState } from '../FormStateContext.js'
import { Input } from '../ui/input.js'
import { Textarea } from '../ui/textarea.js'

/**
 * Bridge between controlled (FormStateProvider) and uncontrolled
 * (defaultValue) modes for text-style inputs. When inside a form with
 * `live()` fields, the input is bound to the context's values map and
 * fires the live trigger on change/blur according to the field's `live`
 * config. Outside a controlled form, falls back to plain `defaultValue`.
 */
export function TextLikeInput({
  el, name, common, type, extraProps, multiline, applyMask,
}: {
  el:         ElementMeta
  name:       string
  common:     Record<string, unknown>
  type:       string
  extraProps: Record<string, unknown>
  multiline:  boolean
  /** Optional keystroke formatter — `TextField.mask(pattern)`. When
   *  set, every change runs the value through this fn before it lands
   *  in state / the DOM. Defaults to identity. */
  applyMask?: (value: string) => string
}): React.ReactElement {
  const fs = useFieldState(name)
  const liveCfg = el['live']
  const liveOpts = (typeof liveCfg === 'object' && liveCfg !== null
    ? liveCfg as { onBlur?: boolean; debounce?: number }
    : {})
  const onBlurMode = liveOpts.onBlur === true
  const mask = applyMask ?? identity

  if (fs.controlled) {
    const ctxValue = fs.value !== undefined && fs.value !== null ? String(fs.value) : ''
    const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      const formatted = mask(e.target.value)
      fs.setValue(formatted)
      if (!onBlurMode) fs.triggerLive()
    }
    const onBlur = (): void => {
      if (onBlurMode) fs.triggerLive()
    }
    const props = {
      ...common,
      ...extraProps,
      defaultValue: undefined,
      value:        ctxValue,
      onChange,
      onBlur,
    }
    if (multiline) return <Textarea {...(props as React.ComponentProps<typeof Textarea>)} />
    return <Input {...(props as React.ComponentProps<typeof Input>)} type={type} />
  }

  // Uncontrolled path with mask: wire onInput so the user sees the
  // formatted value as they type. Without `applyMask`, fall through to
  // the legacy bare-defaultValue render so the DOM stays unchanged.
  if (applyMask) {
    const onInput = (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      const target = e.currentTarget
      target.value = mask(target.value)
    }
    if (multiline) return <Textarea {...(common as React.ComponentProps<typeof Textarea>)} {...extraProps} onInput={onInput} />
    return <Input {...(common as React.ComponentProps<typeof Input>)} type={type} {...extraProps} onInput={onInput} />
  }

  if (multiline) return <Textarea {...(common as React.ComponentProps<typeof Textarea>)} {...extraProps} />
  return <Input {...(common as React.ComponentProps<typeof Input>)} type={type} {...extraProps} />
}

function identity(v: string): string { return v }
