import React from 'react'
import type { ElementMeta } from '../schema/Element.js'
import type { RenderHookMap, RenderHookName } from '../RenderHook.js'

/**
 * Mount point for the four `panels::head.*` render-hook slots inside the
 * generated `+Head.tsx`. Walks the resolved `ElementMeta[]` per slot and
 * emits real React elements (`<meta>` / `<link>` / `<script>` / `<style>`)
 * directly into the head fragment.
 *
 * Body-level Element types in a head slot are silently skipped with a
 * warning — `<div>` / `<p>` etc. would terminate `<head>` parsing in the
 * browser and break the whole page.
 *
 * Slot ordering matches Filament's documented layout:
 *   1. `panels::head.start` — first head children
 *   2. (built-in chrome — fonts, FOUC script — emitted by `+Head.tsx`)
 *   3. `panels::head.end` — after built-in chrome
 *   4. `panels::scripts`   — late-load `<script>` block
 *   5. `panels::styles`    — late-load `<style>` block
 *
 * Renders nothing when no hooks were registered for any of the four
 * slots. Cheap when unused.
 */
export function HeadHooks({
  hooks,
  position,
}: {
  hooks:    RenderHookMap | undefined
  position: 'start' | 'end'
}) {
  if (!hooks) return null

  const slots: readonly RenderHookName[] = position === 'start'
    ? ['panels::head.start']
    : ['panels::head.end', 'panels::scripts', 'panels::styles']

  const out: React.ReactNode[] = []
  let key = 0
  for (const slot of slots) {
    const metas = hooks[slot]
    if (!metas || metas.length === 0) continue
    for (const meta of metas) {
      const node = renderHeadElement(meta, slot, key++)
      if (node !== null) out.push(node)
    }
  }
  if (out.length === 0) return null
  return <>{out}</>
}

function renderHeadElement(
  meta:  ElementMeta,
  slot:  string,
  key:   number,
): React.ReactNode {
  // Cast through `unknown` — wire shapes carry whatever the head-tag's
  // `toMeta()` emitted; the `type` discriminator already disambiguates.
  const m = meta as unknown as Record<string, unknown> & { type: string }
  switch (m.type) {
    case 'meta': {
      const props: Record<string, unknown> = { key }
      if (m['name']      !== undefined) props['name']      = m['name']
      if (m['property']  !== undefined) props['property']  = m['property']
      if (m['httpEquiv'] !== undefined) props['httpEquiv'] = m['httpEquiv']
      if (m['charset']   !== undefined) props['charSet']   = m['charset']
      if (m['content']   !== undefined) props['content']   = m['content']
      if (props['name'] === undefined && props['property'] === undefined &&
          props['httpEquiv'] === undefined && props['charSet'] === undefined) {
        if (typeof console !== 'undefined') {
          console.warn(`[pilotiq] MetaTag in ${slot} skipped — needs name / property / httpEquiv / charset`)
        }
        return null
      }
      return React.createElement('meta', props)
    }
    case 'link': {
      const props: Record<string, unknown> = { key, rel: m['rel'] }
      if (m['href']           !== undefined) props['href']           = m['href']
      if (m['mimeType']       !== undefined) props['type']           = m['mimeType']
      if (m['media']          !== undefined) props['media']          = m['media']
      if (m['sizes']          !== undefined) props['sizes']          = m['sizes']
      if (m['as']             !== undefined) props['as']             = m['as']
      if (m['integrity']      !== undefined) props['integrity']      = m['integrity']
      if (m['crossOrigin']    !== undefined) props['crossOrigin']    = m['crossOrigin']
      if (m['referrerPolicy'] !== undefined) props['referrerPolicy'] = m['referrerPolicy']
      if (m['hrefLang']       !== undefined) props['hrefLang']       = m['hrefLang']
      return React.createElement('link', props)
    }
    case 'script': {
      const props: Record<string, unknown> = { key }
      if (m['src']            !== undefined) props['src']            = m['src']
      if (m['mimeType']       !== undefined) props['type']           = m['mimeType']
      if (m['async'])                        props['async']          = true
      if (m['defer'])                        props['defer']          = true
      if (m['noModule'])                     props['noModule']       = true
      if (m['integrity']      !== undefined) props['integrity']      = m['integrity']
      if (m['crossOrigin']    !== undefined) props['crossOrigin']    = m['crossOrigin']
      if (m['referrerPolicy'] !== undefined) props['referrerPolicy'] = m['referrerPolicy']
      if (m['nonce']          !== undefined) props['nonce']          = m['nonce']
      const dataAttrs = m['dataAttributes'] as Record<string, string> | undefined
      if (dataAttrs) {
        for (const [k, v] of Object.entries(dataAttrs)) props[`data-${k}`] = v
      }
      // src-mode and inline-mode are mutually exclusive — src wins per HTML spec.
      if (m['src'] === undefined && typeof m['body'] === 'string') {
        props['dangerouslySetInnerHTML'] = { __html: m['body'] as string }
      }
      return React.createElement('script', props)
    }
    case 'style': {
      const props: Record<string, unknown> = {
        key,
        dangerouslySetInnerHTML: { __html: (m['css'] as string) ?? '' },
      }
      if (m['nonce'] !== undefined) props['nonce'] = m['nonce']
      return React.createElement('style', props)
    }
    default: {
      if (typeof console !== 'undefined') {
        console.warn(`[pilotiq] non-head element type "${m.type}" in ${slot} skipped`)
      }
      return null
    }
  }
}
