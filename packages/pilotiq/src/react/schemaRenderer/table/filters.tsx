import React, { useRef, useState } from 'react'
import { CheckIcon, Columns3Icon, FilterIcon } from 'lucide-react'
import type { ElementMeta } from '../../../schema/Element.js'
import { Checkbox } from '../../ui/checkbox.js'
import { Input } from '../../ui/input.js'
import { buttonVariants } from '../../ui/button.js'
import { cn } from '../../utils.js'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select.js'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../../ui/dropdown-menu.js'
import { useNavigate } from '../../navigate.js'
import {
  parseDateRangeValue, encodeDateRangeValue,
} from '../../../filters/DateRangeFilter.js'
import {
  parseMultiSelectValue, encodeMultiSelectValue,
} from '../../../filters/MultiSelectFilter.js'
import { encodeFormFilterValue } from '../../../filters/FormFilter.js'
import {
  parseQueryBuilderValue, encodeQueryBuilderValue, isQueryBuilderTree,
  type QueryBuilderRule, type QueryBuilderTree, type QueryBuilderTreeChild,
} from '../../../filters/QueryBuilderFilter.js'
import type {
  ConstraintMeta, ConstraintOperator, ConstraintOperatorName, ConstraintValueKind,
} from '../../../filters/queryBuilder/Constraint.js'
import {
  COLUMN_COLOR_CLASSES,
} from '../constants.js'
import { resolveIcon } from '../helpers.js'
import { patchFilterUrl } from './url.js'

// ─── Filter chrome + table-toolbar dropdowns ────────────────
//
// Every filter UI piece — from the per-filter widget (Select / MultiSelect
// / DateRange / Form / QueryBuilder) to the wrapping Popover / inline
// strip / collapsible toggle — plus toolbar siblings (SortByPicker,
// ColumnsToggleDropdown, TableGroupPicker) and the renderFilterControl
// switch that picks the right widget per filter kind.


/**
 * Active-filters bar — pill row above the table summarising every filter
 * with a current value. Each pill shows the filter's `indicator` text
 * (server-formatted via `Filter.indicator()` / per-subclass defaults) and
 * an `×` button that clears that filter's URL key in place. Clicking ×
 * also drops `?page` so users land on the first page of the relaxed set.
 *
 * Renders nothing when no filter has an indicator.
 */
export function ActiveFiltersBar({ filters, prefix }: { filters: ElementMeta[]; prefix?: string | undefined }) {
  const navigate = useNavigate()
  const active   = filters.filter(f => typeof f['indicator'] === 'string' && f['indicator'] !== '')
  if (active.length === 0) return null

  const clear = (name: string): void => {
    patchFilterUrl(navigate, prefix, { [name]: null })
  }

  const clearAll = (): void => {
    const patches: Record<string, string | null> = {}
    for (const f of active) patches[String(f['name'] ?? '')] = null
    patchFilterUrl(navigate, prefix, patches)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {active.map((f, i) => {
        const name      = String(f['name']      ?? '')
        const indicator = String(f['indicator'] ?? '')
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 pl-2.5 pr-1 py-0.5"
          >
            <span>{indicator}</span>
            <button
              type="button"
              onClick={() => clear(name)}
              aria-label={`Clear filter ${indicator}`}
              className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              ×
            </button>
          </span>
        )
      })}
      {active.length > 1 && (
        <button
          type="button"
          onClick={clearAll}
          className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

/**
 * Filter icon button + Popover containing every filter control.
 * Opens on click; the inner Selects don't dismiss the outer Popover when
 * an option is chosen (Base UI Popover doesn't auto-close on inner clicks).
 *
 * Each FilterSelect navigates the page on change (window.location), so the
 * filter form is no longer needed — keeps the search input in its own
 * lightweight form for native Enter-to-submit.
 */
export function FilterPopover({ filters, prefix, renderFormChild }: {
  filters:        ElementMeta[]
  prefix?:        string | undefined
  renderFormChild: (child: ElementMeta, index: number, values: Record<string, unknown>, errors: Record<string, string[]>) => React.ReactNode
}) {
  const activeCount = filters.filter(f => {
    const v = f['value']
    return typeof v === 'string' && v !== ''
  }).length

  return (
    <Popover>
      <PopoverTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            aria-label="Filters"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            <FilterIcon className="size-4" />
            <span>Filters</span>
            {activeCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {activeCount}
              </span>
            )}
          </button>
        )}
      />
      <PopoverContent align="start" className={
        filters.some(f => f['kind'] === 'queryBuilder')
          ? 'w-[36rem] max-w-[calc(100vw-2rem)] p-3'
          : 'w-72 p-3'
      }>
        <div className="flex flex-col gap-3">
          {filters.map((f, i) => renderFilterControl(f, i, prefix, renderFormChild))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Inline strip of filter controls — used by `Table.filtersLayout('above-content'
 * | 'above-content-collapsible' | 'below-content')`. Mirrors `FilterPopover`'s
 * inner body but lays the controls out in a wrapping row instead of a
 * vertical stack inside a popover.
 */
export function FilterStrip({ filters, prefix, renderFormChild }: {
  filters:        ElementMeta[]
  prefix?:        string | undefined
  renderFormChild: (child: ElementMeta, index: number, values: Record<string, unknown>, errors: Record<string, string[]>) => React.ReactNode
}) {
  if (filters.length === 0) return null
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:flex-wrap sm:items-end">
      {filters.map((f, i) => (
        <div key={i} className="min-w-[12rem] flex-1 sm:max-w-xs">
          {renderFilterControl(f, i, prefix, renderFormChild)}
        </div>
      ))}
    </div>
  )
}

/**
 * Toolbar button paired with `FilterStrip` for `Table.filtersLayout(
 * 'above-content-collapsible')`. Visually matches the modal-mode trigger
 * (filter icon + "Filters" label + active-count badge) but flips a parent-
 * owned `open` state instead of opening a Popover.
 */
export function FilterStripToggle({
  filters, open, onToggle,
}: {
  filters: ElementMeta[]
  open:    boolean
  onToggle: () => void
}) {
  const activeCount = filters.filter(f => {
    const v = f['value']
    return typeof v === 'string' && v !== ''
  }).length
  return (
    <button
      type="button"
      aria-label="Filters"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(buttonVariants({ variant: 'outline' }))}
    >
      <FilterIcon className="size-4" />
      <span>Filters</span>
      {activeCount > 0 && (
        <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
          {activeCount}
        </span>
      )}
    </button>
  )
}

/**
 * Filter dropdown that updates the URL directly on change. We don't rely
 * on a wrapping `<form>` because filters now live inside a portaled
 * Popover (the search input keeps its own form for Enter-to-submit).
 *
 * Empty value (`''`) is the "All" sentinel — the param is removed from
 * the URL rather than serialized as `&name=`.
 */
export function FilterSelect({
  name, label, defaultValue, placeholder, options, prefix,
}: {
  name:         string
  label:        string
  defaultValue: string
  placeholder:  string
  options:      Array<{ value: string; label: string }>
  prefix?:      string | undefined
}) {
  const [value, setValue] = useState(defaultValue)
  const navigate           = useNavigate()

  const onChange = (next: unknown) => {
    const v = typeof next === 'string' ? next : ''
    setValue(v)
    patchFilterUrl(navigate, prefix, { [name]: v })
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{placeholder}</SelectItem>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Heading-row text for a group band. Shows `<label>: <value-or-title>`
 * with an optional description below. Reused for both collapsible and
 * static heading rows.
 */
export function GroupHeaderText({
  label, value, title, description,
}: {
  label?:       string | undefined
  value?:       string | undefined
  title?:       string | undefined
  description?: string | undefined
}) {
  const display = title ?? value ?? ''
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        {label && <span className="text-muted-foreground/70">{label}: </span>}
        <span className="text-foreground">{display || 'Ungrouped'}</span>
      </span>
      {description && (
        <span className="text-[10px] font-normal normal-case text-muted-foreground/80">
          {description}
        </span>
      )}
    </span>
  )
}

/**
 * "Group by" dropdown rendered above the table when 2+ TableGroups
 * are registered (or 1 group with rich metadata). Selecting "None"
 * sets `?group=` (empty) which explicitly overrides `defaultGroup`.
 *
 * URL-driven — `onChange` builds the next href via `buildTableQuery`
 * and SPA-navigates; the page re-renders with the new active group.
 */
export function TableGroupPicker({
  options, active, onChange,
}: {
  options: Array<{ column: string; label: string }>
  active:  string | undefined
  onChange: (column: string) => void
}) {
  const value = active ?? ''
  return (
    <Select value={value} onValueChange={(v) => onChange(typeof v === 'string' ? v : '')}>
      <SelectTrigger className="w-44">
        <SelectValue placeholder="Group by…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">No grouping</SelectItem>
        {options.map(o => (
          <SelectItem key={o.column} value={o.column}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Pair-of-date-inputs filter for `kind === 'dateRange'`. Each side
 * navigates the URL on change, encoding the pair as `from..to` keyed
 * off the filter name. Empty pair drops the URL key.
 */
export function FilterDateRange({
  name, label, defaultValue, placeholder, includesTime, minDate, maxDate, prefix,
}: {
  name:         string
  label:        string
  defaultValue: string
  placeholder:  string
  includesTime: boolean
  minDate?:     string
  maxDate?:     string
  prefix?:      string | undefined
}) {
  const initial = parseDateRangeValue(defaultValue)
  const [from, setFrom] = useState(initial.from ?? '')
  const [to,   setTo]   = useState(initial.to   ?? '')
  const navigate         = useNavigate()

  const inputType = includesTime ? 'datetime-local' : 'date'

  const navigateTo = (nextFrom: string, nextTo: string): void => {
    patchFilterUrl(navigate, prefix, {
      [name]: encodeDateRangeValue({ from: nextFrom, to: nextTo }),
    })
  }

  const onFromChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const v = e.target.value
    setFrom(v)
    navigateTo(v, to)
  }
  const onToChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const v = e.target.value
    setTo(v)
    navigateTo(from, v)
  }
  const onClear = (): void => {
    setFrom('')
    setTo('')
    navigateTo('', '')
  }

  const hasValue = from !== '' || to !== ''

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Input
          type={inputType}
          value={from}
          onChange={onFromChange}
          placeholder={placeholder}
          aria-label={`${label} from`}
          {...(minDate !== undefined ? { min: minDate } : {})}
          {...(maxDate !== undefined ? { max: maxDate } : {})}
          className="h-8 text-xs"
        />
        <span className="text-muted-foreground">→</span>
        <Input
          type={inputType}
          value={to}
          onChange={onToChange}
          placeholder={placeholder}
          aria-label={`${label} to`}
          {...(minDate !== undefined ? { min: minDate } : {})}
          {...(maxDate !== undefined ? { max: maxDate } : {})}
          className="h-8 text-xs"
        />
        {hasValue && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label}`}
            className="text-muted-foreground hover:text-foreground px-1"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Multi-value filter for `kind === 'multiSelect'`. Renders a checkbox
 * stack inside the popover; toggling a box patches the comma-separated
 * URL value for the filter's name. Empty selection drops the URL key.
 */
export function FilterMultiSelect({
  name, label, defaultValue, options, prefix,
}: {
  name:         string
  label:        string
  defaultValue: string
  options:      Array<{ value: string; label: string }>
  prefix?:      string | undefined
}) {
  const [selected, setSelected] = useState<string[]>(() => parseMultiSelectValue(defaultValue))
  const navigate                = useNavigate()

  const apply = (next: string[]): void => {
    setSelected(next)
    patchFilterUrl(navigate, prefix, { [name]: encodeMultiSelectValue(next) })
  }

  const toggle = (value: string, checked: boolean): void => {
    const next = checked
      ? [...selected.filter(v => v !== value), value]
      : selected.filter(v => v !== value)
    apply(next)
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-1.5">
        {options.map(o => {
          const checked = selected.includes(o.value)
          return (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(c: boolean | 'indeterminate') => toggle(o.value, c === true)}
              />
              <span>{o.label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Multi-field filter for `kind === 'form'`. The popover renders an inner
 * sub-form with the user-declared schema; submitting bundles all named
 * inputs into a `Record<string, unknown>`, JSON-encodes the non-empty
 * subset under the filter's URL key, and SPA-navigates. Empty submit
 * drops the URL key entirely.
 *
 * The fields' `defaultValue` were pre-hydrated server-side from the
 * active URL value (see `FormFilter.toMeta`), so an existing filter
 * round-trips into the form on render. Inputs are uncontrolled — we
 * read state via `new FormData(form)` on submit, matching how the
 * outer page-level Form works on full submit.
 */
export function FilterForm({
  name, label, defaultValue, formSchema, prefix, renderFormChild,
}: {
  name:         string
  label:        string
  defaultValue: string
  formSchema:   ElementMeta[]
  prefix?:      string | undefined
  // Injected from the top-level dispatch — `renderFormChild` lives in
  // the form layer (Phase 4) and can't be imported directly without
  // a cycle through `SchemaRenderer.tsx`.
  renderFormChild: (child: ElementMeta, index: number, values: Record<string, unknown>, errors: Record<string, string[]>) => React.ReactNode
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const navigate = useNavigate()
  const hasValue = defaultValue !== '' && defaultValue !== '{}'

  const onApply = (e?: React.FormEvent | React.MouseEvent): void => {
    e?.preventDefault()
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    const values: Record<string, unknown> = {}
    for (const [key, val] of fd.entries()) {
      const existing = values[key]
      if (existing === undefined) {
        values[key] = val
      } else if (Array.isArray(existing)) {
        (existing as unknown[]).push(val)
      } else {
        values[key] = [existing, val]
      }
    }
    patchFilterUrl(navigate, prefix, { [name]: encodeFormFilterValue(values) })
  }

  const onClear = (): void => {
    patchFilterUrl(navigate, prefix, { [name]: null })
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <form ref={formRef} onSubmit={onApply} className="flex flex-col gap-2">
        {formSchema.map((child, i) => renderFormChild(child, i, {}, {}))}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply
          </button>
          {hasValue && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

/**
 * Composable advanced filter for `kind === 'queryBuilder'`. v2 emits a
 * full tree — root AND/OR connector + nested groups arbitrarily deep —
 * JSON-encoded into a single URL key on Apply (see
 * `encodeQueryBuilderValue`).
 *
 * State is local — typing into a value input doesn't navigate. Only the
 * Apply button writes the URL. This mirrors `FilterForm`'s behavior and
 * keeps the popover quiet under the cursor.
 */
export function FilterQueryBuilder({
  name, label, defaultValue, constraints, prefix,
}: {
  name:         string
  label:        string
  defaultValue: string
  constraints:  ConstraintMeta[]
  prefix?:      string | undefined
}) {
  const navigate = useNavigate()
  const initialTree = parseQueryBuilderValue(defaultValue)
  const [tree, setTree] = useState<QueryBuilderTree>(initialTree)
  const hasValue = defaultValue !== '' && initialTree.rules.length > 0

  const onApply = (e?: React.FormEvent | React.MouseEvent): void => {
    e?.preventDefault()
    patchFilterUrl(navigate, prefix, { [name]: encodeQueryBuilderValue(tree) })
  }

  const onClear = (): void => {
    setTree({ operator: 'and', rules: [] })
    patchFilterUrl(navigate, prefix, { [name]: null })
  }

  if (constraints.length === 0) {
    return (
      <div className="text-muted-foreground text-xs">
        {label}: no constraints declared.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 min-w-[24rem]">
      <span className="text-muted-foreground text-xs">{label}</span>
      <form onSubmit={onApply} className="flex flex-col gap-2">
        <QueryBuilderGroup
          tree={tree}
          constraints={constraints}
          isRoot={true}
          onChange={setTree}
        />
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1" />
          <button
            type="submit"
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply
          </button>
          {(hasValue || tree.rules.length > 0) && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

/**
 * Recursive group renderer — emits a connector picker (AND / OR) at the
 * top, a vertical stack of children (rules and sub-groups), and footer
 * buttons for "+ Add condition" and "+ Add group". Calls `onChange` with
 * the updated sub-tree so parents can splice it back into their own
 * `rules` array. Root groups skip the outer border so the popover doesn't
 * carry a redundant frame; nested groups draw a faint left rule + soft
 * background so the nesting is visible without blowing up the width.
 */
export function QueryBuilderGroup({
  tree, constraints, isRoot, onChange, onRemove,
}: {
  tree:        QueryBuilderTree
  constraints: ConstraintMeta[]
  isRoot:      boolean
  onChange:    (next: QueryBuilderTree) => void
  onRemove?:   () => void
}) {
  const constraintMap = new Map<string, ConstraintMeta>()
  for (const c of constraints) constraintMap.set(c.name, c)

  const setOperator = (op: 'and' | 'or'): void => {
    onChange({ ...tree, operator: op })
  }

  const updateChildAt = (index: number, next: QueryBuilderTreeChild): void => {
    onChange({ ...tree, rules: tree.rules.map((r, i) => i === index ? next : r) })
  }

  const removeChildAt = (index: number): void => {
    onChange({ ...tree, rules: tree.rules.filter((_, i) => i !== index) })
  }

  const addRule = (): void => {
    const first = constraints[0]
    if (!first) return
    onChange({
      ...tree,
      rules: [...tree.rules, {
        constraint: first.name,
        operator:   first.defaultOperator ?? first.operators[0]?.name ?? 'equals',
        value:      undefined,
      }],
    })
  }

  const addGroup = (): void => {
    onChange({
      ...tree,
      rules: [...tree.rules, { operator: 'and', rules: [] }],
    })
  }

  const wrapper = isRoot
    ? 'flex flex-col gap-2'
    : 'flex flex-col gap-2 rounded-md border-l-2 border-primary/40 bg-muted/30 pl-2 py-2 pr-2'

  return (
    <div className={wrapper}>
      <div className="flex items-center gap-2">
        <ConnectorToggle value={tree.operator} onChange={setOperator} />
        <span className="text-muted-foreground text-[11px]">
          {tree.operator === 'and' ? 'Match all of the following' : 'Match any of the following'}
        </span>
        {!isRoot && onRemove && (
          <>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove group"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              ×
            </button>
          </>
        )}
      </div>

      {tree.rules.length === 0 && (
        <div className="text-muted-foreground text-xs italic">No conditions yet.</div>
      )}

      {tree.rules.map((child, i) => {
        if (isQueryBuilderTree(child)) {
          return (
            <QueryBuilderGroup
              key={i}
              tree={child}
              constraints={constraints}
              isRoot={false}
              onChange={(next) => updateChildAt(i, next)}
              onRemove={() => removeChildAt(i)}
            />
          )
        }
        return (
          <QueryBuilderRow
            key={i}
            rule={child}
            constraints={constraints}
            constraintMeta={constraintMap.get(child.constraint)}
            onConstraintChange={(v) => {
              const c = constraintMap.get(v)
              if (!c) return
              updateChildAt(i, {
                constraint: v,
                operator:   c.defaultOperator ?? c.operators[0]?.name ?? 'equals',
                value:      undefined,
              })
            }}
            onOperatorChange={(v) => {
              updateChildAt(i, {
                ...child,
                operator: v as ConstraintOperatorName,
                value:    undefined,
              })
            }}
            onValueChange={(v) => updateChildAt(i, { ...child, value: v })}
            onRemove={() => removeChildAt(i)}
          />
        )
      })}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addRule}
          className="inline-flex h-8 items-center justify-center rounded-md border border-dashed border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
        >
          + Add condition
        </button>
        <button
          type="button"
          onClick={addGroup}
          className="inline-flex h-8 items-center justify-center rounded-md border border-dashed border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
        >
          + Add group
        </button>
      </div>
    </div>
  )
}

/**
 * Compact AND/OR segmented control used at the head of every group. Pure
 * presentation — the parent owns the value.
 */
export function ConnectorToggle({
  value, onChange,
}: {
  value:    'and' | 'or'
  onChange: (next: 'and' | 'or') => void
}) {
  const base = 'inline-flex h-7 items-center px-2 text-[11px] font-medium uppercase tracking-wide transition'
  const on   = 'bg-primary text-primary-foreground'
  const off  = 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-input">
      <button
        type="button"
        onClick={() => onChange('and')}
        className={`${base} ${value === 'and' ? on : off}`}
        aria-pressed={value === 'and'}
      >
        AND
      </button>
      <button
        type="button"
        onClick={() => onChange('or')}
        className={`${base} ${value === 'or' ? on : off}`}
        aria-pressed={value === 'or'}
      >
        OR
      </button>
    </div>
  )
}

/**
 * One condition row inside `FilterQueryBuilder`. Three controls
 * left-to-right: constraint picker, operator picker, value input. The
 * value input dispatches off the operator's `valueKind` — `none` hides
 * it entirely, `numberRange` / `dateRange` mount a pair, otherwise a
 * single typed input.
 */
export function QueryBuilderRow({
  rule, constraints, constraintMeta,
  onConstraintChange, onOperatorChange, onValueChange, onRemove,
}: {
  rule:               QueryBuilderRule
  constraints:        ConstraintMeta[]
  constraintMeta:     ConstraintMeta | undefined
  onConstraintChange: (name: string) => void
  onOperatorChange:   (name: string) => void
  onValueChange:      (value: unknown) => void
  onRemove:           () => void
}) {
  const operators: ConstraintOperator[] = constraintMeta?.operators ?? []
  const activeOp = operators.find(o => o.name === rule.operator)
  const valueKind: ConstraintValueKind = activeOp?.valueKind ?? 'text'

  return (
    <div className="flex items-start gap-1.5 rounded-md border border-input bg-background p-2">
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        <Select value={rule.constraint} onValueChange={(v) => onConstraintChange(typeof v === 'string' ? v : '')}>
          <SelectTrigger size="sm" className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {constraints.map(c => (
              <SelectItem key={c.name} value={c.name}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={rule.operator} onValueChange={(v) => onOperatorChange(typeof v === 'string' ? v : '')}>
          <SelectTrigger size="sm" className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map(o => (
              <SelectItem key={o.name} value={o.name}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <QueryBuilderValueInput
          kind={valueKind}
          value={rule.value}
          options={constraintMeta?.options}
          onChange={onValueChange}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove condition"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        ×
      </button>
    </div>
  )
}

/**
 * Operator-aware value control. Switches over the constraint operator's
 * `valueKind` and mounts the matching input. Value shapes:
 * - `text / number / date / dateTime / select`  → scalar
 * - `multiSelect`                                → string[]
 * - `numberRange / dateRange`                    → [string, string]
 * - `boolean / none`                              → null / undefined
 */
export function QueryBuilderValueInput({
  kind, value, options, onChange,
}: {
  kind:     ConstraintValueKind
  value:    unknown
  options:  Array<{ value: string; label: string }> | undefined
  onChange: (next: unknown) => void
}) {
  if (kind === 'none' || kind === 'boolean') return null

  if (kind === 'select') {
    const opts = options ?? []
    const v = value === undefined || value === null ? '' : String(value)
    return (
      <Select value={v} onValueChange={(next) => onChange(typeof next === 'string' ? next : '')}>
        <SelectTrigger size="sm" className="h-8 min-w-32 text-xs">
          <SelectValue placeholder="Pick…" />
        </SelectTrigger>
        <SelectContent>
          {opts.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (kind === 'multiSelect') {
    const opts = options ?? []
    const list = Array.isArray(value) ? value.map(v => String(v)) : []
    const toggle = (val: string): void => {
      if (list.includes(val)) onChange(list.filter(v => v !== val))
      else                    onChange([...list, val])
    }
    return (
      <div className="flex flex-wrap items-center gap-1">
        {opts.map(o => {
          const active = list.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={
                'inline-flex h-7 items-center rounded-md border px-2 text-xs ' +
                (active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background hover:bg-accent')
              }
            >
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (kind === 'numberRange') {
    const [min, max] = Array.isArray(value) ? [value[0], value[1]] : [undefined, undefined]
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          className="h-8 w-24 text-xs"
          value={min === undefined || min === null ? '' : String(min)}
          onChange={(e) => onChange([e.target.value, max ?? ''])}
          placeholder="Min"
        />
        <span className="text-muted-foreground text-xs">–</span>
        <Input
          type="number"
          className="h-8 w-24 text-xs"
          value={max === undefined || max === null ? '' : String(max)}
          onChange={(e) => onChange([min ?? '', e.target.value])}
          placeholder="Max"
        />
      </div>
    )
  }

  if (kind === 'dateRange') {
    const [from, to] = Array.isArray(value) ? [value[0], value[1]] : [undefined, undefined]
    return (
      <div className="flex items-center gap-1">
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={from === undefined || from === null ? '' : String(from)}
          onChange={(e) => onChange([e.target.value, to ?? ''])}
        />
        <span className="text-muted-foreground text-xs">→</span>
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={to === undefined || to === null ? '' : String(to)}
          onChange={(e) => onChange([from ?? '', e.target.value])}
        />
      </div>
    )
  }

  if (kind === 'date' || kind === 'dateTime') {
    const v = value === undefined || value === null ? '' : String(value)
    return (
      <Input
        type={kind === 'dateTime' ? 'datetime-local' : 'date'}
        className="h-8 w-44 text-xs"
        value={v}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (kind === 'number') {
    const v = value === undefined || value === null ? '' : String(value)
    return (
      <Input
        type="number"
        className="h-8 w-32 text-xs"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Value"
      />
    )
  }

  // Default: text
  const v = value === undefined || value === null ? '' : String(value)
  return (
    <Input
      type="text"
      className="h-8 min-w-32 flex-1 text-xs"
      value={v}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
    />
  )
}

export function renderFilterControl(
  el: ElementMeta,
  index: number,
  prefix: string | undefined,
  renderFormChild: (child: ElementMeta, index: number, values: Record<string, unknown>, errors: Record<string, string[]>) => React.ReactNode,
): React.ReactNode {
  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const kind        = String(el['kind'] ?? 'select')
  const value       = el['value'] ? String(el['value']) : ''
  const placeholder = el['placeholder'] ? String(el['placeholder']) : 'All'

  if (kind === 'queryBuilder') {
    const constraints = (el['constraints'] as ConstraintMeta[] | undefined) ?? []
    return (
      <FilterQueryBuilder
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        constraints={constraints}
        prefix={prefix}
      />
    )
  }

  if (kind === 'form') {
    const formSchema = (el['formSchema'] as ElementMeta[] | undefined) ?? []
    return (
      <FilterForm
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        formSchema={formSchema}
        prefix={prefix}
        renderFormChild={renderFormChild}
      />
    )
  }

  if (kind === 'boolean') {
    return (
      <FilterSelect
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        placeholder={placeholder}
        options={[{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }]}
        prefix={prefix}
      />
    )
  }

  if (kind === 'multiSelect') {
    const options = (el['options'] as Array<{ value: string; label: string }> | undefined) ?? []
    return (
      <FilterMultiSelect
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        options={options}
        prefix={prefix}
      />
    )
  }

  if (kind === 'dateRange') {
    const includesTime = Boolean(el['includesTime'])
    const minDate      = el['minDate'] ? String(el['minDate']) : undefined
    const maxDate      = el['maxDate'] ? String(el['maxDate']) : undefined
    return (
      <FilterDateRange
        key={index}
        name={name}
        label={label}
        defaultValue={value}
        placeholder={placeholder}
        includesTime={includesTime}
        prefix={prefix}
        {...(minDate !== undefined ? { minDate } : {})}
        {...(maxDate !== undefined ? { maxDate } : {})}
      />
    )
  }

  // 'ternary' and 'select' both render as a single-select dropdown,
  // differing only in their server-supplied option set.
  const options = (el['options'] as Array<{ value: string; label: string }> | undefined) ?? []
  return (
    <FilterSelect
      key={index}
      name={name}
      label={label}
      defaultValue={value}
      placeholder={placeholder}
      options={options}
      prefix={prefix}
    />
  )
}

/**
 * Resolve the record URL for a single data cell. Column-level override
 * (`Column.recordUrl(fn)` → `_columnRecordUrls[name]`) wins over the
 * table-level `Table.recordUrl(fn)` (`_recordUrl`). Explicit per-column
 * opt-out (`Column.recordUrl(false)` → `meta.recordUrl === false`)
 * suppresses the link entirely. Returns `undefined` when the cell is
 * not linkable, in which case the renderer leaves it unwrapped.
 */
export function resolveColumnUrl(
  col:      ElementMeta,
  tableUrl: string | undefined,
  colUrls:  Record<string, string>,
): string | undefined {
  if (col['recordUrl'] === false) return undefined
  const own = colUrls[String(col['name'] ?? '')]
  if (own !== undefined) return own
  return tableUrl
}

/**
 * Toolbar "Sort by" picker — surfaces in cards layout where there's no
 * column-header click affordance to flip sort order. In standard table
 * mode, this picker appears in the top bar instead. Each `Column` flagged
 * `.sortable()` contributes two options — ascending and descending —
 * yielding "Title (A→Z) / Title (Z→A) / Date (oldest first) / Date (newest
 * first)" style entries. Selecting an option resets `?page=1`.
 */
export function SortByPicker({
  columns, active, onChange,
}: {
  columns: ElementMeta[]
  active:  { column: string; direction: 'asc' | 'desc' } | undefined
  onChange: (column: string, direction: 'asc' | 'desc') => void
}) {
  const sortable = columns.filter(c => Boolean(c['sortable']))
  if (sortable.length === 0) return null
  const value = active ? `${active.column}:${active.direction}` : ''
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (typeof v !== 'string' || v === '') return
        const idx = v.indexOf(':')
        if (idx < 0) return
        const col = v.slice(0, idx)
        const dir = v.slice(idx + 1) === 'desc' ? 'desc' : 'asc'
        onChange(col, dir as 'asc' | 'desc')
      }}
    >
      <SelectTrigger className="w-44">
        <SelectValue placeholder="Sort by…" />
      </SelectTrigger>
      <SelectContent>
        {sortable.map(col => {
          const name  = String(col['name'] ?? '')
          const label = String(col['label'] ?? name)
          return (
            <React.Fragment key={name}>
              <SelectItem value={`${name}:asc`}>{label} (A→Z)</SelectItem>
              <SelectItem value={`${name}:desc`}>{label} (Z→A)</SelectItem>
            </React.Fragment>
          )
        })}
      </SelectContent>
    </Select>
  )
}

/**
 * Toolbar dropdown for `Column.toggleable()` columns. Lists every
 * toggleable column with a checkbox; toggling writes through to a
 * caller-supplied `onToggle` (the `TableRendererBody` owns the state
 * + the localStorage round-trip). Mounted only when at least one
 * column is toggleable.
 */
export function ColumnsToggleDropdown({
  columns, hidden, onToggle,
}: {
  columns: ElementMeta[]
  hidden:  Set<string>
  onToggle: (name: string, nextHidden: boolean) => void
}) {
  if (columns.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            className={cn(buttonVariants({ variant: 'outline' }))}
            aria-label="Show or hide columns"
          >
            <Columns3Icon className="h-4 w-4" aria-hidden="true" />
            <span>Columns</span>
          </button>
        )}
      />
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {columns.map((col, i) => {
          const name  = String(col['name']  ?? '')
          const label = String(col['label'] ?? name)
          const isHidden = hidden.has(name)
          return (
            <DropdownMenuItem
              key={i}
              // Suppress menu-close so users can toggle multiple columns
              // without re-opening the dropdown.
              closeOnClick={false}
              onClick={() => onToggle(name, !isHidden)}
            >
              <span className="inline-flex w-4 items-center justify-center">
                {!isHidden && <CheckIcon className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span>{label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

