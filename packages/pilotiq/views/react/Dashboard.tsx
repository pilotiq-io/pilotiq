import React from 'react'
import { AdminShell } from '../../src/react/AdminShell.js'

interface PanelInfo {
  name: string
  branding: { title?: string; logo?: string }
  resources: Array<{ label: string; slug: string; icon: string }>
}

export default function PilotiqDashboard({ panel, basePath }: { panel: PanelInfo; basePath: string }) {
  return (
    <AdminShell panel={panel} basePath={basePath}>
      <h1 className="text-2xl font-bold mb-6">
        {panel.branding.title ?? panel.name} Dashboard
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {panel.resources.map(r => (
          <a key={r.slug} href={`${basePath}/${r.slug}`}
             className="block p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{r.label}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage {r.label.toLowerCase()}</p>
          </a>
        ))}
      </div>
    </AdminShell>
  )
}
