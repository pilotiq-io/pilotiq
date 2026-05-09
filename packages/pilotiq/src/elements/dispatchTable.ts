import { Element, type ElementMeta } from '../schema/Element.js'
import { Table, type TableContext, type SortDirection } from './Table.js'
import { TableGroup, bucketDateValue, formatDateBucketTitle } from './TableGroup.js'
import type { Filter } from '../filters/Filter.js'
import { Action } from '../actions/Action.js'
import { Column } from '../Column.js'
import { ListTab } from '../Tab.js'
import { isRepeaterField } from '../fields/RepeaterField.js'
import { isBuilderField } from '../fields/BuilderField.js'
import { tryRenderRichText, getRichTextRenderer } from '../richtext/registry.js'
import { resolveSchema, type RenderContext } from '../schema/resolveSchema.js'
import { sanitizeHtml } from '../schema/sanitize.js'
import { marked } from 'marked'
import type { SummaryResult } from '../summarizers/Summarizer.js'

export interface QueryParams {
  search?: string
  sort?:   string  // "col:dir" or "col"
  page?:   string | number
  perPage?: string | number
  /** Filter values keyed by filter name. Any URL query key not in the
   * reserved set above is treated as a candidate filter value. */
  [key: string]: unknown
}

const RESERVED_QUERY_KEYS = new Set(['search', 'sort', 'page', 'perPage', 'group'])

export function prefixedKey(prefix: string | undefined, key: string): string {
  return prefix === undefined || prefix === '' ? key : `${prefix}_${key}`
}

function prefixedReservedKeys(prefix: string | undefined): Set<string> {
  if (prefix === undefined || prefix === '') return RESERVED_QUERY_KEYS
  return new Set([...RESERVED_QUERY_KEYS].map(k => `${prefix}_${k}`))
}

/**
 * Optional hooks passed by the caller (`pageData.resourceIndexData`)
 * to plug Resource-level concerns into the table dispatcher without
 * giving it a hard dependency on `Resource`.
 *
 * `canEdit` is consulted once per row when the table has at least one
 * editable column (`TextInputColumn / ToggleColumn / SelectColumn`) —
 * the result gates per-cell edit affordances. Custom-page tables and
 * relation-manager tables (v1) pass `undefined` and skip per-cell edit.
 */
export interface LoadTableHooks {
  canEdit?: (
    user:   unknown,
    record: Record<string, unknown>,
  ) => boolean | Promise<boolean>
}

export function parseFilterValues(
  query:   QueryParams,
  filters: ReadonlyArray<Filter>,
  prefix?: string,
): Record<string, string> {
  if (filters.length === 0) return {}
  const filterNames = new Set(filters.map(f => f.name))
  const reserved    = prefixedReservedKeys(prefix)
  const stripPrefix = prefix !== undefined && prefix !== ''
    ? `${prefix}_`
    : ''
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(query)) {
    if (reserved.has(key)) continue
    // Strip the table's prefix when present; un-prefixed keys belong to
    // some other namespace on the page so they can't match this table's
    // filters.
    let logicalKey = key
    if (stripPrefix !== '') {
      if (!key.startsWith(stripPrefix)) continue
      logicalKey = key.slice(stripPrefix.length)
    }
    if (!filterNames.has(logicalKey)) continue
    if (typeof val === 'string' && val !== '') out[logicalKey] = val
  }
  return out
}

export function parseTableQuery(q: QueryParams = {}, prefix?: string): {
  search:  string | undefined
  sort:    { column: string; direction: SortDirection } | undefined
  page:    number | undefined
  perPage: number | undefined
} {
  const k = (key: string): string => prefixedKey(prefix, key)
  const searchRaw = q[k('search')]
  const search = typeof searchRaw === 'string' && searchRaw.trim() !== ''
    ? searchRaw.trim()
    : undefined

  let sort: { column: string; direction: SortDirection } | undefined
  const sortRaw = q[k('sort')]
  if (typeof sortRaw === 'string' && sortRaw.trim() !== '') {
    const [colRaw, dirRaw] = sortRaw.split(':')
    const column = colRaw?.trim()
    if (column) {
      const direction: SortDirection = dirRaw?.trim() === 'desc' ? 'desc' : 'asc'
      sort = { column, direction }
    }
  }

  const pageRaw = q[k('page')]
  const page = pageRaw !== undefined
    ? Math.max(1, Math.floor(Number(pageRaw)) || 1)
    : undefined

  const perPageRaw = q[k('perPage')]
  const perPage = perPageRaw !== undefined && Number(perPageRaw) > 0
    ? Math.floor(Number(perPageRaw))
    : undefined

  return { search, sort, page, perPage }
}

/**
 * Reconcile the URL `?group=` key against a table's configured
 * `defaultGroup` + `groups([...])` registration. Returns the column
 * the table should band rows by for this request, or `undefined` for
 * "no grouping".
 *
 * Selection rules:
 *
 *   `?group=col`        → that column, IF it's registered or matches
 *                          the bare `defaultGroup` (otherwise no grouping).
 *   `?group=` (empty)   → no grouping (overrides defaultGroup).
 *   absent              → fall back to `defaultGroup`.
 */
export function parseActiveGroup(
  query:  QueryParams,
  table:  Table,
  prefix?: string,
): string | undefined {
  const raw = query[prefixedKey(prefix, 'group')]
  if (typeof raw === 'string') {
    if (raw === '') return undefined  // explicit clear
    const registered = table.getGroups().map(g => g.getColumn())
    const fallback   = table.getDefaultGroup()
    // Trust either an explicit registration OR the bare-column form.
    // Unknown columns → treat as no grouping (silent — stale bookmark).
    if (registered.includes(raw)) return raw
    if (fallback === raw)         return raw
    return undefined
  }
  return table.getDefaultGroup()
}

/** Walk an Element tree and return every `Table` instance in document order. */
export function findTables(elements: ReadonlyArray<Element>): Table[] {
  const tables: Table[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (el instanceof Table) tables.push(el)
      // Plan #14 — Tables inside Repeater / Builder rows aren't
      // supported in v1. Stop at the array-row boundary so the parent
      // table dispatcher doesn't pick them up.
      if (isRepeaterField(el)) continue
      if (isBuilderField(el))  continue
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return tables
}

/**
 * For every `Table` on the page that has a `records()` handler, run it
 * with the parsed `TableContext` and seed the table's render-time state
 * (rows, total, sort, search, page).
 *
 * Tables without a `records()` handler are left untouched — `toMeta()`
 * will emit them with no rows, which the renderer falls back to as
 * "No records yet."
 *
 * `pathname` is the absolute route the page lives at (e.g.
 * `/admin/articles`). Sort, search, and pagination links in the rendered
 * table prefix with it so SPA navigation has a real pathname to route
 * against — Vike's client-side router doesn't resolve `?qs`-only
 * relative hrefs against the current URL.
 */
export async function loadTableRecords(
  elements: ReadonlyArray<Element>,
  query:    QueryParams = {},
  pathname?: string,
  user?:    unknown,
  hooks?:   LoadTableHooks,
): Promise<void> {
  const tables = findTables(elements)
  if (tables.length === 0) return

  await Promise.all(tables.map(async (table) => {
    const prefix = table.getQueryStringIdentifier()
    const { search, sort, page, perPage } = parseTableQuery(query, prefix)

    // Carry per-table defaults forward when the URL didn't override them.
    // Reorderable tables fall back to `(reorderableColumn, asc)` when no
    // explicit `defaultSort` is set, so the visible order matches the
    // persisted column even before the user clicks a header.
    const reorderFallback = table.isReorderable() && !table.getDefaultSort()
      ? { column: table.getReorderableColumn()!, direction: 'asc' as const }
      : undefined
    const effectiveSort    = sort    ?? table.getDefaultSort() ?? reorderFallback
    const effectivePerPage = perPage ?? table.getPerPage()
    const effectivePage    = page    ?? 1

    // Parse filter values from the URL query. Mirror them back onto the
    // Filter elements so the renderer can show the active selection, and
    // pass them through TableContext for the records handler to consume.
    const tableFilters = table.getFilters()
    const filterValues = parseFilterValues(query, tableFilters, prefix)
    for (const filter of tableFilters) {
      const v = filterValues[filter.name]
      if (v !== undefined) filter.withValue(v)
    }

    // Thread the active list-page tab + its query modifier through to the
    // records handler. The active tab was marked by `pageData.resolveActiveTab`
    // (`tab.withActive(true)`) before `loadTableRecords` was called, so we
    // just walk the schema for it. User-defined `Table.records(fn)`
    // handlers can branch on `ctx.tab`; the model adapter consults
    // `ctx.tabQuery` to splice the predicate into its ORM query chain.
    const activeTab = findActiveTab(elements)

    const ctx: TableContext = {
      ...(search !== undefined           ? { search }                       : {}),
      ...(effectiveSort !== undefined    ? { sort: effectiveSort }          : {}),
      ...(effectivePerPage !== undefined ? { perPage: effectivePerPage }    : {}),
      ...(Object.keys(filterValues).length > 0 ? { filters: filterValues } : {}),
      ...(activeTab            ? { tab: activeTab.name }                    : {}),
      ...(activeTab?.getQuery() ? { tabQuery: activeTab.getQuery()! }       : {}),
      ...(user != null         ? { user }                                  : {}),
      page: effectivePage,
    }

    // Apply the tab's TableContext customizer last (escape hatch — wins
    // over filters/tab/etc. that we just set above).
    const ctxFn = activeTab?.getContextFn()
    const finalCtx = ctxFn ? ctxFn(ctx) : ctx

    // Skip records + per-row work when the table is deferred (the client
    // refetches via `tableUrl`); URL state still mirrors below so the
    // skeleton frame keeps current sort / search / page accurate.
    const handler = table.getRecords()
    if (handler && !table.isDeferred()) {
      const result = await handler(finalCtx)
      const rawRows = Array.isArray(result) ? result : result.rows
      const total   = Array.isArray(result) ? rawRows.length : (result.total ?? rawRows.length)

      // Per-row visibility evaluation for row-placement actions with rules.
      // Static row actions (no rules) are always visible/enabled, so we
      // skip stamping on rows when none of the table's row actions opt in.
      const rowActionsWithRules = (table.getChildren() ?? [])
        .filter((c): c is Action =>
          c instanceof Action
          && c.getPlacement() === 'row'
          && c.hasVisibilityRules(),
        )

      // Per-row server-side `formatStateUsing` eval. Columns with a
      // formatter (the function isn't serializable) get their result
      // stashed under `row._formatted[columnName]` so the renderer can
      // pick it up without re-running the function client-side.
      const columnsWithFormatter = (table.getChildren() ?? [])
        .filter((c): c is Column => c instanceof Column && c.hasFormatter())

      // Plain-text columns that may carry Tiptap rich-text content.
      // Auto-rendered by the registered richtext renderer (Phase D —
      // wired by `registerTiptap()`). Conservative: only default-text
      // columns without an explicit `formatStateUsing` / `format` /
      // editable-input override. Without a registered renderer the
      // per-row pass is skipped entirely so non-tiptap apps pay nothing.
      const richTextColumns = getRichTextRenderer() !== undefined
        ? (table.getChildren() ?? [])
            .filter((c): c is Column =>
              c instanceof Column
              && c.getColumnType() === 'text'
              && !c.hasFormatter()
              && !c.hasFormat()
              && !c.isEditable()
              && !c.isRichText(),
            )
        : []

      // Markdown / HTML columns — opt-in via `Column.markdown() /
      // Column.html()`. Each row's value gets server-rendered and the
      // resulting HTML stamps `_formatted[col.name]` +
      // `_richtextCells[col.name] = true` so the renderer mounts the
      // existing prose-sm `dangerouslySetInnerHTML` path.
      const explicitRichTextColumns = (table.getChildren() ?? [])
        .filter((c): c is Column => c instanceof Column && c.isRichText())

      // Columns with their own per-row recordUrl handler — overrides
      // the table-level `Table.recordUrl` for clicks on that column.
      const columnsWithRecordUrl = (table.getChildren() ?? [])
        .filter((c): c is Column => c instanceof Column && c.hasRecordUrlHandler())

      // Inline-edit columns (`TextInputColumn / ToggleColumn / SelectColumn`).
      // Per-row stamping is gated on a `canEdit` hook — without it the
      // dispatcher has no way to authorize the cell, so we skip stamping
      // entirely and the renderer falls back to the read-only formatter.
      const editableColumns = (table.getChildren() ?? [])
        .filter((c): c is Column => c instanceof Column && c.isEditable())
      const canEditEditableColumns = editableColumns.length > 0 && hooks?.canEdit !== undefined

      const recordUrlFn     = table.getRecordUrl()
      const recordClassesFn = table.getRecordClasses()
      const cardSchemaFn    = table.isCardsLayout() ? table.getCardSchema() : undefined
      // Reconcile `?group=` against the configured groups + defaultGroup.
      // Stamp the resolved column back onto the table so `toMeta()`
      // emits it as the meta's `defaultGroup` (the renderer reads from
      // there). Empty-string "explicit clear" is distinct from `undefined`
      // ("never reconciled") so we can tell tests-skipping-loadTableRecords
      // apart from URL-cleared.
      const activeGroupCol  = parseActiveGroup(query, table, prefix)
      table.withActiveGroup(activeGroupCol ?? '')
      // Resolve to a TableGroup instance — synth a no-metadata instance
      // for bare-column / unregistered columns so per-row stamping has
      // a uniform shape.
      const activeGroup     = activeGroupCol === undefined
        ? undefined
        : (table.getGroups().find(g => g.getColumn() === activeGroupCol)
            ?? TableGroup.make(activeGroupCol))
      const groupColumn     = activeGroup?.getColumn()

      const needsRowMutation =
        rowActionsWithRules.length > 0 ||
        columnsWithFormatter.length > 0 ||
        columnsWithRecordUrl.length > 0 ||
        recordUrlFn !== undefined ||
        recordClassesFn !== undefined ||
        groupColumn !== undefined ||
        canEditEditableColumns ||
        richTextColumns.length > 0 ||
        explicitRichTextColumns.length > 0 ||
        cardSchemaFn !== undefined

      const rows = !needsRowMutation
        ? rawRows
        : await Promise.all(rawRows.map(async row => {
            const recordObj = row as Record<string, unknown>
            const out: Record<string, unknown> = { ...recordObj }

            if (rowActionsWithRules.length > 0) {
              const visibleActions: string[] = []
              const disabledActions: string[] = []
              const evals = await Promise.all(
                rowActionsWithRules.map(a =>
                  a.evaluate(user !== undefined ? { record: row, user } : { record: row }),
                ),
              )
              rowActionsWithRules.forEach((a, i) => {
                const { visible, disabled } = evals[i]!
                if (visible)  visibleActions.push(a.name)
                if (disabled) disabledActions.push(a.name)
              })
              out['_visibleActions']  = visibleActions
              out['_disabledActions'] = disabledActions
            }

            if (columnsWithFormatter.length > 0) {
              const formatted: Record<string, string> = {}
              for (const col of columnsWithFormatter) {
                const fn = col.getFormatStateHandler()
                if (!fn) continue
                try {
                  formatted[col.name] = fn(recordObj[col.name], recordObj)
                } catch {
                  // Swallow per-row formatter errors; the renderer falls
                  // back to the raw value.
                }
              }
              out['_formatted'] = formatted
            }

            if (richTextColumns.length > 0) {
              const formatted = (out['_formatted'] as Record<string, string> | undefined) ?? {}
              const rich:      Record<string, true> = {}
              for (const col of richTextColumns) {
                // `formatStateUsing` already won — skip when the column
                // had a result stamped in the prior loop (formatStateUsing
                // and richTextColumns are mutually exclusive at filter
                // time, so this is defensive).
                if (formatted[col.name] !== undefined) continue
                const html = tryRenderRichText(recordObj[col.name])
                if (html === null) continue
                formatted[col.name] = html
                rich[col.name]      = true
              }
              if (Object.keys(rich).length > 0) {
                out['_formatted']     = formatted
                out['_richtextCells'] = rich
              }
            }

            if (explicitRichTextColumns.length > 0) {
              const formatted = (out['_formatted'] as Record<string, string> | undefined) ?? {}
              const rich      = (out['_richtextCells'] as Record<string, true> | undefined) ?? {}
              for (const col of explicitRichTextColumns) {
                // formatStateUsing wins (declared first by the user — we
                // assume they meant it). markdown()/html() yield only when
                // the explicit per-row formatter already stamped a value.
                if (formatted[col.name] !== undefined) continue
                const raw = recordObj[col.name]
                if (raw === null || raw === undefined || raw === '') continue
                const kind = col.getRichTextKind()
                let html: string
                try {
                  html = kind === 'markdown'
                    ? (marked.parse(String(raw), { gfm: true, breaks: false, async: false }) as string)
                    : String(raw)
                } catch {
                  // marked errors fall through to a string-cast so a
                  // malformed cell still ships *something* to the user.
                  html = String(raw)
                }
                const sanitizeOpt = col.getSanitize()
                const finalHtml = sanitizeOpt === false
                  ? html
                  : await sanitizeHtml(html, sanitizeOpt === true ? undefined : sanitizeOpt)
                formatted[col.name] = finalHtml
                rich[col.name]      = true
              }
              if (Object.keys(rich).length > 0) {
                out['_formatted']     = formatted
                out['_richtextCells'] = rich
              }
            }

            if (recordUrlFn !== undefined) {
              try {
                const url = recordUrlFn(row)
                if (url !== undefined) out['_recordUrl'] = url
              } catch {
                // Per-row recordUrl errors stay silent; rows without a URL
                // simply aren't clickable.
              }
            }

            if (recordClassesFn !== undefined) {
              try {
                const cls = recordClassesFn(row)
                if (cls) out['_recordClasses'] = cls
              } catch {
                // Silent — row falls back to default classes.
              }
            }

            if (activeGroup !== undefined) {
              const raw = recordObj[activeGroup.getColumn()]
              // Date-bucketed groups use `YYYY-MM-DD` as the stable-sort
              // key so all rows from the same day cluster together;
              // unparseable values bucket to '' (bottom).
              const value = activeGroup.isDate()
                ? bucketDateValue(raw)
                : (raw == null || raw === '' ? '' : String(raw))
              out['_groupValue'] = value

              // Per-row resolved title. User-supplied handler wins over
              // the date() default formatter. Throwing handler stays
              // silent — falls back to the raw `_groupValue`.
              const titleFn = activeGroup.getTitleHandler()
              if (titleFn) {
                try {
                  const t = titleFn(row)
                  if (t !== undefined) out['_groupTitle'] = String(t)
                } catch { /* silent */ }
              } else if (activeGroup.isDate() && value !== '') {
                out['_groupTitle'] = formatDateBucketTitle(raw)
              }

              const descFn = activeGroup.getDescriptionHandler()
              if (descFn) {
                try {
                  const d = descFn(row)
                  if (d !== undefined) out['_groupDescription'] = String(d)
                } catch { /* silent */ }
              }
            }

            if (columnsWithRecordUrl.length > 0) {
              const colUrls: Record<string, string> = {}
              for (const col of columnsWithRecordUrl) {
                const fn = col.getRecordUrlHandler()
                if (!fn) continue
                try {
                  const url = fn(recordObj)
                  if (url !== undefined) colUrls[col.name] = url
                } catch {
                  // Same as table-level: per-cell URL errors stay silent.
                }
              }
              out['_columnRecordUrls'] = colUrls
            }

            if (cardSchemaFn !== undefined) {
              try {
                const elements = await cardSchemaFn(row, finalCtx)
                const cardCtx: RenderContext = {
                  mode:   'table',
                  record: row,
                  ...(user !== undefined && user !== null
                    ? { user: user as NonNullable<RenderContext['user']> }
                    : {}),
                }
                const children = await resolveSchema(elements, cardCtx)
                out['_cardChildren'] = children as ElementMeta[]
              } catch (err) {
                console.warn(`[pilotiq] cardSchema() threw for row in Table:`, err)
                out['_cardChildren'] = [] as ElementMeta[]
              }
            }

            if (canEditEditableColumns) {
              // ONE auth call per row regardless of editable column count
              // — same record, same answer. Failures or false → no edit
              // affordance for any column.
              let allowed = false
              try { allowed = await hooks!.canEdit!(user, recordObj) }
              catch { allowed = false }
              if (allowed) {
                const editableMap: Record<string, true> = {}
                const disabledMap: Record<string, true> = {}
                for (const col of editableColumns) {
                  editableMap[col.name] = true
                  if (col.isDisabledFor(recordObj)) disabledMap[col.name] = true
                }
                out['_cellEditable'] = editableMap
                if (Object.keys(disabledMap).length > 0) {
                  out['_cellDisabled'] = disabledMap
                }
              }
            }

            return out
          }))

      // Group banding: stable-sort by _groupValue so all rows with the
      // same value cluster together. The user's sort still applies
      // (records came in pre-sorted from `records()`); we just shuffle
      // those clusters so groups are contiguous. Empty/null group values
      // bubble to the bottom under the empty-string key. When
      // `TableGroup.orderUsing(comparator)` is set on the active group,
      // the comparator overrides the default alphabetic order.
      const finalRows = groupColumn === undefined
        ? rows
        : sortRowsByGroupValue(
            rows as Array<Record<string, unknown>>,
            activeGroup?.getKeyComparator(),
          )

      // Per-column summaries. Compute over the rows we just rendered
      // (per-page only in v1; cross-page aggregation is deferred). Pulls
      // raw column values — summarizers coerce to numbers internally.
      const columnsWithSummaries = (table.getChildren() ?? [])
        .filter((c): c is Column => c instanceof Column && c.hasSummarizers())
      if (columnsWithSummaries.length > 0) {
        const summaries: Record<string, SummaryResult[]> = {}
        for (const col of columnsWithSummaries) {
          const values = (finalRows as Array<Record<string, unknown>>)
            .map(r => r[col.name])
          summaries[col.name] = col.getSummarizers().map(s => s.toResult(values))
        }
        table.withSummaries(summaries)

        // Per-group summaries — one summary set per `_groupValue`. Only
        // computed when a group is active; otherwise the global tfoot
        // is the only summary row. Empty-group bucket ('') still gets
        // its own row when present (mirrors the bucket-to-bottom rule
        // already used for sorting).
        if (activeGroup !== undefined) {
          const buckets: Record<string, Array<Record<string, unknown>>> = {}
          for (const r of finalRows as Array<Record<string, unknown>>) {
            const key = String(r['_groupValue'] ?? '')
            if (!buckets[key]) buckets[key] = []
            buckets[key].push(r)
          }
          const groupSummaries: Record<string, Record<string, SummaryResult[]>> = {}
          for (const [groupValue, groupRows] of Object.entries(buckets)) {
            const perCol: Record<string, SummaryResult[]> = {}
            for (const col of columnsWithSummaries) {
              const values = groupRows.map(r => r[col.name])
              perCol[col.name] = col.getSummarizers().map(s => s.toResult(values))
            }
            groupSummaries[groupValue] = perCol
          }
          table.withGroupSummaries(groupSummaries)
        }
      }

      table.withRows(finalRows as unknown[], total)
    }

    // Mirror the resolved context back onto the table so the renderer can
    // produce sort/search/page links without re-parsing the URL.
    if (effectiveSort)  table.withSort(effectiveSort.column, effectiveSort.direction)
    if (search !== undefined) table.withSearch(search)
    table.withPage(effectivePage)
    if (pathname) table.withCurrentPath(pathname)
  }))
}

/**
 * Locate the currently-active list-page tab in the schema. The active tab
 * is the `ListTab` whose `_active` flag was set by
 * `pageData.resolveActiveTab` during the page-data pass — the tab strip
 * lives in the page schema (above the Table), so this just walks the
 * tree until it finds the matching tab. Returns `undefined` when the
 * page has no ListTabs (most non-resource pages).
 *
 * Uses a structural `getType() === 'listTab'` check rather than
 * `instanceof ListTab` for the same reason as `findForms / findActions`
 * — Vite SSR module-cache duplication can load the package through
 * two paths during a dev session and silently break `instanceof`.
 */
/**
 * Stable-sort rows by their stamped `_groupValue` so all rows with the
 * same group are contiguous. Preserves original order within groups
 * (ties broken by original index). Empty / unstamped group values sort
 * to the end so the "ungrouped" band appears last.
 *
 * When a `comparator` is supplied (via `TableGroup.orderUsing(...)`) it
 * replaces the default alphabetic comparison between distinct keys. The
 * empty-bucket-last rule and within-group stability are preserved
 * around the user's comparator — those are structural, not policy.
 */
function sortRowsByGroupValue(
  rows: ReadonlyArray<Record<string, unknown>>,
  comparator?: (a: string, b: string) => number,
): Array<Record<string, unknown>> {
  const indexed = rows.map((r, i) => ({ r, i, key: String(r['_groupValue'] ?? '') }))
  indexed.sort((a, b) => {
    const aEmpty = a.key === ''
    const bEmpty = b.key === ''
    if (aEmpty && !bEmpty) return 1
    if (!aEmpty && bEmpty) return -1
    if (a.key === b.key) return a.i - b.i
    if (comparator) {
      const cmp = comparator(a.key, b.key)
      if (cmp !== 0) return cmp
      // Comparator-tied → fall back to alphabetic so ties don't churn
      // depending on input order (otherwise pinning two keys to the
      // same rank would leave them in arrival order, which surprises
      // users when their `records()` reorders).
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
  return indexed.map(({ r }) => r)
}

function findActiveTab(elements: ReadonlyArray<Element>): ListTab | undefined {
  const walk = (els: ReadonlyArray<Element>): ListTab | undefined => {
    for (const el of els) {
      if (el.getType() === 'listTab' && (el as ListTab).isActive()) return el as ListTab
      const children = el.getChildren()
      if (children) {
        const found = walk(children)
        if (found) return found
      }
    }
    return undefined
  }
  return walk(elements)
}
