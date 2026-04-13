import React from 'react'
import { AdminShell } from '../../../src/react/AdminShell.js'
import type { Field } from '../../../src/fields/Field.js'

interface PanelInfo {
  name: string
  branding: { title?: string; logo?: string }
  resources: Array<{ label: string; slug: string; icon: string }>
}

export default function ResourceForm({ panel, resource, fields, mode, recordId, basePath }: {
  panel:     PanelInfo
  resource:  { label: string; slug: string; icon: string }
  fields:    Field[]
  mode:      'create' | 'edit'
  recordId?: string
  basePath:  string
}) {
  const title = mode === 'create' ? `Create ${resource.label}` : `Edit ${resource.label}`

  return (
    <AdminShell panel={panel} basePath={basePath}>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">{title}</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <form className="space-y-6">
          {fields.map(field => (
            <FieldRenderer key={field.name} field={field} />
          ))}

          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
            <button type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition">
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
            <a href={`${basePath}/${resource.slug}`}
               className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </AdminShell>
  )
}

function FieldWrapper({ field, children }: { field: Field; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {field.getLabel()}
        {field.isRequired() && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}

function FieldRenderer({ field }: { field: Field }) {
  const baseClasses = "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"

  if (field.fieldType === 'textarea') {
    return (
      <FieldWrapper field={field}>
        <textarea name={field.name} placeholder={field.getPlaceholder()} rows={4} className={baseClasses} />
      </FieldWrapper>
    )
  }

  if (field.fieldType === 'select') {
    const opts = (field as unknown as { getOptions(): Array<{ value: string; label: string }> }).getOptions()
    return (
      <FieldWrapper field={field}>
        <select name={field.name} className={baseClasses}>
          <option value="">Select...</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </FieldWrapper>
    )
  }

  if (field.fieldType === 'toggle') {
    return (
      <FieldWrapper field={field}>
        <input type="checkbox" name={field.name} className="rounded border-gray-300" />
      </FieldWrapper>
    )
  }

  // Default: text, email, number, date, slug
  const inputType = field.fieldType === 'email' ? 'email'
    : field.fieldType === 'number' ? 'number'
    : field.fieldType === 'date' ? 'date'
    : 'text'

  return (
    <FieldWrapper field={field}>
      <input name={field.name} type={inputType} placeholder={field.getPlaceholder()}
             readOnly={field.isReadonly()} required={field.isRequired()} className={baseClasses} />
    </FieldWrapper>
  )
}
