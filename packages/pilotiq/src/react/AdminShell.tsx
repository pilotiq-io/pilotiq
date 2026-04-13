import React from 'react'

export interface AdminShellProps {
  panel: {
    name: string
    branding: { title?: string; logo?: string }
    resources?: Array<{ label: string; slug: string; icon: string }>
  }
  basePath: string
  children: React.ReactNode
}

export function AdminShell({ panel, basePath, children }: AdminShellProps) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <aside className="w-56 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-800">
          <a href={basePath} className="font-semibold text-sm">
            {panel.branding.title ?? panel.name}
          </a>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <a href={basePath}
             className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            Dashboard
          </a>
          {panel.resources?.map(r => (
            <a key={r.slug} href={`${basePath}/${r.slug}`}
               className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              {r.label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
