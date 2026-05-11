import React from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs.js'
import { renderChildren } from './helpers.js'

/**
 * Top-level `Tabs` element. Variants:
 * - `'pills'` (default) — uses the shadcn Tabs primitive's stock chrome.
 * - `'underline'` — flat tab strip with a bottom border and per-tab
 *    underline on selection.
 *
 * `renderElement` is injected for the body content of each tab so the
 * renderer can recurse without re-importing the main switch.
 */
export function TabsRenderer({
  el,
  index,
  renderElement,
}: {
  el:            ElementMeta
  index:         number
  renderElement: (el: ElementMeta, index: number) => React.ReactNode
}) {
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
          {renderChildren(tab['children'] as ElementMeta[] | undefined, 'gap-4', renderElement)}
        </TabsContent>
      ))}
    </Tabs>
  )
}
