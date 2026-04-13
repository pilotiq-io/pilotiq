import React from 'react'
import { Separator } from '../ui/separator.js'
import type { AppShellProps } from '../AppShell.js'

export function TopbarLayout({ panel, basePath, children }: AppShellProps) {
  const title = panel.branding?.title ?? panel.name

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <header className="h-14 shrink-0 border-b bg-card flex items-center gap-4 px-6">
        <div className="flex items-center gap-2 me-2">
          {panel.branding?.logo
            ? <>
                <img src={panel.branding.logo} alt={title} className="h-6 w-6" />
                <span className="text-sm font-semibold">{title}</span>
              </>
            : <span className="text-sm font-semibold">{title}</span>
          }
        </div>
        <Separator orientation="vertical" className="h-4" />
        <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
          <a href={basePath}
             className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
            Dashboard
          </a>
          {panel.resources?.map(r => (
            <a key={r.slug} href={`${basePath}/${r.slug}`}
               className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              {r.label}
            </a>
          ))}
          {panel.pages?.map(p => (
            <a key={p.slug} href={`${basePath}/${p.slug}`}
               className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              {p.label}
            </a>
          ))}
        </nav>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
