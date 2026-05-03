import React from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { useWidgetData } from '../WidgetDataContext.js'
import { getWidgetComponent } from '../../widgets/registry.js'

/**
 * Plan #15 — `ViewRenderer`. Mounts the user-supplied React component
 * registered under `meta.component` via `registerWidgetComponents()`,
 * passing `data` resolved from `View.getData(ctx)` (or fetched lazily
 * via the polling endpoint).
 *
 * Failure modes paint inline error panels rather than throwing — a
 * misnamed `View.component('Foo')` in production should surface a clear
 * pointer at the registration step, not a blank widget slot.
 */
export interface ViewRendererProps {
  meta: ElementMeta
}

export function ViewRenderer({ meta }: ViewRendererProps) {
  const componentName = String(meta['component'] ?? '')
  const { data, error, isLoading } = useWidgetData(meta as Parameters<typeof useWidgetData>[0])

  if (!componentName) {
    return (
      <ViewError>
        View widget is missing its <code className="font-mono">component</code> name —
        set <code className="font-mono">static componentName = '...'</code> on the
        subclass or call <code className="font-mono">.component('...')</code> in the
        fluent form.
      </ViewError>
    )
  }

  const Component = getWidgetComponent(componentName)
  if (!Component) {
    return (
      <ViewError>
        No component registered under name <code className="font-mono">{componentName}</code>.
        Register it at app boot:
        <pre className="mt-2 overflow-x-auto rounded bg-amber-100/60 p-2 text-xs dark:bg-amber-900/30">{`import { registerWidgetComponents } from '@pilotiq/pilotiq/widgets'\nregisterWidgetComponents({ ${componentName}: ${componentName} })`}</pre>
      </ViewError>
    )
  }

  if (isLoading) return <ViewSkeleton />
  if (error)     return <ViewError>{error}</ViewError>

  return <Component data={data} />
}

function ViewSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="h-32 animate-pulse rounded-md border border-border bg-muted/40"
    />
  )
}

function ViewError({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
    >
      {children}
    </div>
  )
}
