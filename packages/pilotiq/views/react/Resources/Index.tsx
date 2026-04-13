import React from 'react'
import { AdminShell } from '../../../src/react/AdminShell.js'
import type { Column } from '../../../src/Column.js'

interface PanelInfo {
  name: string
  branding: { title?: string; logo?: string }
  resources: Array<{ label: string; slug: string; icon: string }>
}

export default function ResourceIndex({ panel, resource, columns, basePath }: {
  panel:    PanelInfo
  resource: { label: string; labelSingular: string; slug: string; icon: string }
  columns:  Column[]
  basePath: string
}) {
  return (
    <AdminShell panel={panel} basePath={basePath}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{resource.label}</h1>
        <a href={`${basePath}/${resource.slug}/create`}
           className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition">
          Create {resource.labelSingular}
        </a>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800">
            <tr>
              {columns.map(col => (
                <th key={col.name} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {col.getLabel()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
                No records yet. Data loading will be added in a future phase.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminShell>
  )
}
