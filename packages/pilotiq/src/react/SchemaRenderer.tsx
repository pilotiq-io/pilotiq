import React from 'react'
import type { SchemaElementMeta } from '../schema/SchemaElement.js'

const alertStyles: Record<string, string> = {
  info:    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  danger:  'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
}

function renderElement(el: SchemaElementMeta, index: number): React.ReactNode {
  switch (el.type) {
    case 'text':
      return (
        <p key={index} className="text-sm text-muted-foreground">
          {String(el.content ?? '')}
        </p>
      )

    case 'heading': {
      const level = (el.level as number) ?? 1
      const content = String(el.content ?? '')
      const description = el.description ? String(el.description) : undefined
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
      const alertType = String(el.alertType ?? 'info')
      const styles = alertStyles[alertType] ?? alertStyles['info']
      const title = el.title ? String(el.title) : undefined
      return (
        <div key={index} className={`rounded-lg border p-4 ${styles}`}>
          {title && <p className="font-medium mb-1">{title}</p>}
          <p className="text-sm">{String(el.content ?? '')}</p>
        </div>
      )
    }

    case 'divider': {
      const label = el.label ? String(el.label) : undefined
      return label
        ? <div key={index} className="relative py-2">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center"><span className="bg-background px-2 text-xs text-muted-foreground">{label}</span></div>
          </div>
        : <hr key={index} className="border-border" />
    }

    case 'card': {
      const elements = (el.elements ?? []) as SchemaElementMeta[]
      const title = el.title ? String(el.title) : undefined
      const description = el.description ? String(el.description) : undefined
      return (
        <div key={index} className="rounded-xl border bg-card p-6 shadow-sm">
          {title && <h3 className="font-semibold mb-1">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
          {elements.length > 0 && (
            <div className="flex flex-col gap-4">
              {elements.map((child, i) => renderElement(child, i))}
            </div>
          )}
        </div>
      )
    }

    default:
      return null
  }
}

export interface SchemaRendererProps {
  elements: SchemaElementMeta[]
}

export function SchemaRenderer({ elements }: SchemaRendererProps) {
  if (!elements || elements.length === 0) return null
  return (
    <div className="flex flex-col gap-6">
      {elements.map((el, i) => renderElement(el, i))}
    </div>
  )
}
