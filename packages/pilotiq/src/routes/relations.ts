import type { Router } from '@rudderjs/router'
import type { AppRequest, AppResponse } from '@rudderjs/contracts'
import { view } from '@rudderjs/view'
import type { Pilotiq } from '../Pilotiq.js'
import type { ResourceClass } from '../Resource.js'
import { Form } from '../elements/Form.js'
import { dispatchFormSubmit } from '../elements/dispatchForm.js'
import { dispatchAction, parseActionBody, type ResolveRecord } from '../elements/dispatchAction.js'
import { Table } from '../elements/Table.js'
import {
  tagActionDispatch,
  relationManagerData, findRelatedResource, safeManagerPolicy,
  resolveRelationChain, type ResolvedChain,
} from '../pageData.js'
import {
  normalizeRelationMode,
  type RelationMode,
} from '../RelationManager.js'
import {
  modelSave, modelLoadRecord, findRecord, getPrimaryKey, getRelationType,
  getMorphRelationDescriptor, computeMorphPayload,
} from '../orm/modelDefaults.js'
import { resourceBasePath } from '../clusterPaths.js'
import {
  wantsJson,
  readFormBody,
  normalizeRedirect,
  splitMeta,
  forbidden,
  checkPolicy,
  resolveDispatchTarget,
  sendActionResult,
  sendMutationSuccess,
  sendRedirectResponse,
  findInQueryWithTrashed,
  loadAccessGated,
} from './helpers.js'

// One-shot warning dedup: a Resource that declares relations() without
// setting `static model` silently has every relation collapse to 'hasMany'
// (the safe default), which is wrong for M2M / morph. The fallback prevents
// crashes during late binding but masks the misconfiguration in dev — log
// once per offending Resource so the operator sees it.
const warnedMissingModelResources = new Set<string>()

/**
 * Register the relation manager routes for one Resource — every
 * relation declared via `R.relations()` mounts a depth-1 strip
 * (list / create / view / edit / delete / restore / force-delete /
 * `_action` / `_detach`); each nested `M.relations()` entry mounts a
 * depth-2 strip with the same shape under a `nestedBase` prefix.
 *
 * Authorization is two-layered: parent `canAccess + canEdit` runs first,
 * then manager-scoped `canX` (with fall-through to the related Resource
 * via `safeManagerPolicy`). Reserved-token / depth-3 / morphTo-no-target
 * guards run at boot in the host barrel (`routes.ts`), not here.
 *
 * Pulled out of `registerPilotiqRoutes` in 2026-05-12 (Phase 4 of the
 * routes.ts split). Called once per `cfg.resources` entry from
 * `registerResourceRoutes`.
 */
export function registerRelationRoutes(
  router:  Router,
  pilotiq: Pilotiq,
  R:       ResourceClass,
  base:    string,
): void {
  const cfg = pilotiq.getConfig()
  const slug = R.getSlug()
  const resourceBase = resourceBasePath(base, R)

    if (R.relations().length > 0 && !R.model && !warnedMissingModelResources.has(R.name)) {
      warnedMissingModelResources.add(R.name)
      console.warn(
        `[@pilotiq/pilotiq] ${R.name}: declares relations() without a static model — every relation will default to 'hasMany'. ` +
        `M2M (belongsToMany / morphToMany / morphedByMany) and polymorphic (morphMany / morphTo) relations will misbehave. ` +
        `Set 'static model = …' on the Resource to fix.`,
      )
    }

    for (const M of R.relations()) {
      const rel = M.getRelationship()
      const parentBase = `${resourceBase}/:id/${rel}`

      // Read the relation type once at registration so the (R, M)-
      // scoped closures all see the same mode without re-reading the
      // relations map per request. `R.model` is asserted by
      // `requireParent` at request time; here it may legitimately be
      // missing during late binding, in which case we fall back to
      // 'hasMany' (the safe default — no special action injection / no
      // factory short-circuiting). See `normalizeRelationMode` for the
      // M2M / polymorphic mappings.
      const relationType = R.model ? getRelationType(R.model, rel) : 'hasMany'
      const mode: RelationMode = normalizeRelationMode(relationType)
      // Hoist out of the per-handler closures: `findRelatedResource` does
      // a linear scan over `cfg.resources` and the result is invariant
      // per (R, M) pair. Compute once at registration so each request
      // skips the scan.
      const Related = findRelatedResource(M, R, cfg)

      // Common policy prelude: load parent, gate access. Returns the
      // parent record on success or a thrown 403/404 response. Returns
      // `undefined` when the route should bail out (response already sent).
      const requireParent = async (req: AppRequest, res: AppResponse, json: boolean): Promise<{ user: unknown; parent: unknown; recordId: string } | undefined> => {
        const recordId = req.params['id']!
        if (!R.model) {
          // Async resolve is still needed to keep error-shape identical.
          await pilotiq.resolveUser(req)
          res.status(500)
          if (json) res.json({ ok: false, error: `Resource "${R.name}" has relations but no static model` })
          else      res.send(`Resource "${R.name}" has relations but no static model`)
          return undefined
        }
        const user = await pilotiq.resolveUser(req)
        // Parallelize the access probe and the parent load — both depend
        // only on `user`, and the access check + parent existence check
        // happen on parallel round-trips instead of sequential.
        const { access, record: parent } = await loadAccessGated(R, recordId, user)
        if (!access) { forbidden(req, res, json); return undefined }
        if (!parent) { res.status(404); if (json) res.json({ ok: false, error: 'Parent not found' }); else res.send('Parent not found'); return undefined }
        if (!await checkPolicy(() => R.canEdit(user, parent))) { forbidden(req, res, json); return undefined }
        return { user, parent, recordId }
      }

      // List — GET ${resourceBase}/:id/${rel}
      // Manager-level canViewAny is enforced inside relationManagerData via
      // safeManagerPolicy (with related-resource fall-through). We just
      // surface the {ok:false,status:403} from the data builder as 403.
      router.get(parentBase, async (req, res) => {
        const json = wantsJson(req)
        const ctx = await requireParent(req, res, json)
        if (!ctx) return
        const data = await relationManagerData(pilotiq, {
          kind: 'relation-list', slug, recordId: ctx.recordId, relationship: rel, query: req.query as Record<string, string>,
        }, req)
        if (data === null)                            { res.status(404); return res.send('Not found') }
        if ('ok' in data && data.ok === false)        return forbidden(req, res, json)
        return view('pilotiq.relation-list', data)
      })

      // Create — GET ${resourceBase}/:id/${rel}/create
      router.get(`${parentBase}/create`, async (req, res) => {
        const json = wantsJson(req)
        const ctx = await requireParent(req, res, json)
        if (!ctx) return
        const data = await relationManagerData(pilotiq, {
          kind: 'relation-create', slug, recordId: ctx.recordId, relationship: rel,
        }, req)
        if (data === null)                            { res.status(404); return res.send('Not found') }
        if ('ok' in data && data.ok === false)        return forbidden(req, res, json)
        return view('pilotiq.relation-create', data)
      })

      // Create submit — POST ${resourceBase}/:id/${rel}/create
      router.post(`${parentBase}/create`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return

        if (!Related) {
          res.status(500)
          const msg = `RelationManager ${M.name}: cannot resolve related Resource for create`
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }
        if (!await safeManagerPolicy(M, 'canCreate', Related, pre.user, pre.parent)) return forbidden(req, res, json)

        const body = await readFormBody(req)
        const { values } = splitMeta(body)

        const listUrl   = parentBase.replace(':id', pre.recordId)
        const form = M.form(Form.make(), {
          basePath:     base,
          parentSlug:   slug,
          parentId:     pre.recordId,
          relationship: rel,
          parentRecord: pre.parent,
          related:      Related,
          mode,
        })
        if (Related.model) {
          if (!form.getSave())       form.save(modelSave(Related.model))
          if (!form.getLoadRecord()) form.loadRecord(modelLoadRecord(Related))
        }

        // Polymorphic auto-injection — when the parent's relation entry
        // is `morphMany` / `morphOne`, fill the `{morphName}Id` and
        // `{morphName}Type` columns on the child before persistence.
        // Compose with any user-supplied `mutateDataBeforeCreate` and
        // run AFTER it so morph values overwrite anything the form
        // body or user hook might have set — the parent record is the
        // single source of truth for who owns the new child, and a
        // submitted form field cannot be allowed to tamper with that.
        if (mode === 'morphMany' && R.model) {
          const morphDesc = getMorphRelationDescriptor(R.model, rel)
          if (!morphDesc) {
            res.status(500)
            const msg = `RelationManager ${M.name}: relations[${JSON.stringify(rel)}] reports a polymorphic type but is missing morphName.`
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }
          const morphPayload = computeMorphPayload(pre.parent, morphDesc)
          const existing = form.getMutateDataBeforeCreate()
          form.mutateDataBeforeCreate(async (data, ctx) => {
            const next = existing ? await existing(data, ctx) : data
            return { ...next, ...morphPayload }
          })
        }

        // Stamp parent context onto FormContext so user hooks
        // (mutateDataBeforeCreate, redirectAfterSave, etc.) can default
        // foreign-key columns or build URLs from the parent.
        const formCtx = {
          values,
          basePath: base,
          parent: pre.parent,
          parentId: pre.recordId,
          relationship: rel,
        }

        const result = await dispatchFormSubmit(form, values, formCtx)
        if (!result.ok) {
          if (json) { res.status(422); return res.json({ ok: false, errors: result.errors }) }
          const data = await relationManagerData(pilotiq, {
            kind: 'relation-create', slug, recordId: pre.recordId, relationship: rel,
            prefill: { values, errors: result.errors ?? {} },
          }, req)
          res.status(422)
          return view('pilotiq.relation-create', data ?? {})
        }

        const redirect = normalizeRedirect(result.redirect, base) ?? listUrl
        return sendRedirectResponse(req, res, json, redirect, result.notifications,
          result.relationshipRenames.length > 0 ? { relationshipRenames: result.relationshipRenames } : undefined,
        )
      })

      // View — GET ${resourceBase}/:id/${rel}/:childId  (Phase A nested
      // resources). 5-segment URL. The literal `${parentBase}/create`
      // route is registered above and Hono prefers static segments over
      // wildcards, but the `childId === 'create'` guard belt-and-suspenders
      // against any router that doesn't.
      router.get(`${parentBase}/:childId`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return
        const childId = req.params['childId']!
        if (childId === 'create')                     { res.status(404); return res.send('Not found') }
        const data = await relationManagerData(pilotiq, {
          kind: 'relation-view', slug, recordId: pre.recordId, relationship: rel, childId,
        }, req)
        if (data === null)                            { res.status(404); return res.send('Not found') }
        if ('ok' in data && data.ok === false)        return forbidden(req, res, json)
        return view('pilotiq.relation-view', data)
      })

      // Edit — GET ${resourceBase}/:id/${rel}/:childId/edit
      router.get(`${parentBase}/:childId/edit`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return
        const childId = req.params['childId']!
        const data = await relationManagerData(pilotiq, {
          kind: 'relation-edit', slug, recordId: pre.recordId, relationship: rel, childId,
        }, req)
        if (data === null)                            { res.status(404); return res.send('Not found') }
        if ('ok' in data && data.ok === false)        return forbidden(req, res, json)
        return view('pilotiq.relation-edit', data)
      })

      // Edit submit — POST ${resourceBase}/:id/${rel}/:childId/edit
      router.post(`${parentBase}/:childId/edit`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return
        const childId = req.params['childId']!

        if (!Related?.model) {
          res.status(500)
          const msg = `RelationManager ${M.name}: cannot resolve related Resource for edit`
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }

        // IDOR + load via the data builder's gating: re-use it to verify
        // the child belongs to this parent, then do the form submit.
        const childCheck = await relationManagerData(pilotiq, {
          kind: 'relation-edit', slug, recordId: pre.recordId, relationship: rel, childId,
        }, req)
        if (childCheck === null)                       { res.status(404); return res.send('Not found') }
        if ('ok' in childCheck && childCheck.ok === false) return forbidden(req, res, json)

        const body = await readFormBody(req)
        const { values } = splitMeta(body)

        const editUrl = `${parentBase}/${childId}/edit`.replace(':id', pre.recordId)
        const form = M.form(Form.make(), {
          basePath:     base,
          parentSlug:   slug,
          parentId:     pre.recordId,
          relationship: rel,
          parentRecord: pre.parent,
          related:      Related,
          mode,
        })
        if (!form.getSave())       form.save(modelSave(Related.model))
        if (!form.getLoadRecord()) form.loadRecord(modelLoadRecord(Related))

        // Re-load child for FormContext so cross-field validators see it.
        let child: unknown = undefined
        try { child = await findRecord(Related, childId, { user: pre.user }) } catch { /* ignore */ }
        if (!child) { res.status(404); return res.send('Not found') }

        // Polymorphic re-stamp on update — same posture as the create
        // path. Re-injecting the morph columns from the live parent
        // record ensures a tampered body (`commentableId=…` /
        // `commentableType=…` posted by an attacker) can't reassign
        // the child to another polymorphic parent. Composed AFTER any
        // user `mutateDataBeforeUpdate` so the framework wins.
        if (mode === 'morphMany' && R.model) {
          const morphDesc = getMorphRelationDescriptor(R.model, rel)
          if (morphDesc) {
            const morphPayload = computeMorphPayload(pre.parent, morphDesc)
            const existing = form.getMutateDataBeforeUpdate()
            form.mutateDataBeforeUpdate(async (data, ctx) => {
              const next = existing ? await existing(data, ctx) : data
              return { ...next, ...morphPayload }
            })
          }
        }

        const formCtx = {
          values,
          basePath: base,
          record: child,
          parent: pre.parent,
          parentId: pre.recordId,
          relationship: rel,
        }

        const result = await dispatchFormSubmit(form, values, formCtx)
        if (!result.ok) {
          if (json) { res.status(422); return res.json({ ok: false, errors: result.errors }) }
          const data = await relationManagerData(pilotiq, {
            kind: 'relation-edit', slug, recordId: pre.recordId, relationship: rel, childId,
            prefill: { values, errors: result.errors ?? {} },
          }, req)
          res.status(422)
          return view('pilotiq.relation-edit', data ?? {})
        }

        const redirect = normalizeRedirect(result.redirect, base) ?? editUrl
        return sendRedirectResponse(req, res, json, redirect, result.notifications,
          result.relationshipRenames.length > 0 ? { relationshipRenames: result.relationshipRenames } : undefined,
        )
      })

      // Delete — POST ${resourceBase}/:id/${rel}/:childId/delete
      router.post(`${parentBase}/:childId/delete`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return
        const childId = req.params['childId']!

        if (!Related?.model) {
          res.status(500)
          const msg = `RelationManager ${M.name}: cannot resolve related Resource for delete`
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }

        // Anti-IDOR: re-use the data builder's child-belongs check.
        const childCheck = await relationManagerData(pilotiq, {
          kind: 'relation-edit', slug, recordId: pre.recordId, relationship: rel, childId,
        }, req)
        if (childCheck === null)                       { res.status(404); return res.send('Not found') }
        if ('ok' in childCheck && childCheck.ok === false) return forbidden(req, res, json)

        const child = await findRecord(Related, childId, { user: pre.user }).catch(() => undefined)
        if (!child) { res.status(404); return res.send('Not found') }

        if (!await safeManagerPolicy(M, 'canDelete', Related, pre.user, pre.parent, child)) return forbidden(req, res, json)

        const listUrl = parentBase.replace(':id', pre.recordId)
        try {
          await Related.model.delete(childId)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Delete failed'
          res.status(500)
          return json ? res.json({ ok: false, error: message }) : res.send(message)
        }

        return sendMutationSuccess(req, res, json, {
          id: childId, kind: 'rdelete', title: `${M.getLabelSingular()} deleted`, redirect: listUrl,
        })
      })

      // ── Plan #13 polish — relation restore / force-delete ─────
      // Mirror the resource-side soft-delete routes, scoped under the
      // parent record. Both routes opt in only when the related Resource
      // has `softDeletes = true` AND its model carries `restore` /
      // `forceDelete`. Two-layer auth: parent canAccess + canEdit, then
      // manager `canRestore / canForceDelete` (with related-Resource
      // fall-through). IDOR check re-runs the parent's relation query
      // through `withTrashed()` so trashed children still resolve.
      const RelatedForSoft = Related
      if (RelatedForSoft?.softDeletes) {
        const RM = RelatedForSoft.model
        if (!RM) {
          throw new Error(
            `[Pilotiq] RelationManager ${M.name} on ${R.name}: related Resource ${RelatedForSoft.name} has softDeletes = true but no model. ` +
            `Wire one up or unset softDeletes.`,
          )
        }
        if (typeof RM.restore !== 'function' || typeof RM.forceDelete !== 'function') {
          throw new Error(
            `[Pilotiq] RelationManager ${M.name} on ${R.name}: related Resource ${RelatedForSoft.name} has softDeletes = true but model.restore / model.forceDelete are missing. ` +
            `Set Model.softDeletes = true on the rudder side, or upgrade @rudderjs/orm.`,
          )
        }

        // IDOR-safe load through the parent's relation query, broadened
        // with `withTrashed()` so currently-trashed children resolve.
        // Returns undefined when the child doesn't belong to this parent
        // (under the broadened scope) or the lookup misses.
        const loadTrashableChild = async (parent: unknown, childId: string): Promise<unknown> => {
          if (!R.model) return undefined
          const pk = (RM.primaryKey ?? 'id') as string
          const q: import('../orm/modelDefaults.js').ModelQuery = R.model.relatedQuery
            ? R.model.relatedQuery(parent, rel)
            : (parent as { related: (n: string) => import('../orm/modelDefaults.js').ModelQuery }).related(rel)
          return findInQueryWithTrashed(q, pk, childId)
        }

        // Restore — POST ${resourceBase}/:id/${rel}/:childId/restore
        router.post(`${parentBase}/:childId/restore`, async (req, res) => {
          const json = wantsJson(req)
          const pre = await requireParent(req, res, json)
          if (!pre) return
          const childId = req.params['childId']!

          const child = await loadTrashableChild(pre.parent, childId)
          if (!child) { res.status(404); return res.send('Not found') }

          if (!await safeManagerPolicy(M, 'canRestore', RelatedForSoft, pre.user, pre.parent, child)) return forbidden(req, res, json)

          const listUrl = parentBase.replace(':id', pre.recordId)
          try {
            await RM.restore!(childId)
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Restore failed'
            res.status(500)
            return json ? res.json({ ok: false, error: message }) : res.send(message)
          }

          return sendMutationSuccess(req, res, json, {
            id: childId, kind: 'rrestore', title: `${M.getLabelSingular()} restored`, redirect: listUrl,
          })
        })

        // Force-delete — POST ${resourceBase}/:id/${rel}/:childId/force-delete
        router.post(`${parentBase}/:childId/force-delete`, async (req, res) => {
          const json = wantsJson(req)
          const pre = await requireParent(req, res, json)
          if (!pre) return
          const childId = req.params['childId']!

          const child = await loadTrashableChild(pre.parent, childId)
          if (!child) { res.status(404); return res.send('Not found') }

          if (!await safeManagerPolicy(M, 'canForceDelete', RelatedForSoft, pre.user, pre.parent, child)) return forbidden(req, res, json)

          const listUrl = parentBase.replace(':id', pre.recordId)
          try {
            await RM.forceDelete!(childId)
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Force-delete failed'
            res.status(500)
            return json ? res.json({ ok: false, error: message }) : res.send(message)
          }

          return sendMutationSuccess(req, res, json, {
            id: childId, kind: 'rforce', title: `${M.getLabelSingular()} permanently deleted`, redirect: listUrl,
          })
        })
      }

      // ── M2M follow-up — manager-scoped action dispatch + detach ─────
      // Two new routes per relation manager. Mounted unconditionally
      // (even on hasMany managers) because handler-style actions are
      // useful beyond M2M — any user-defined `Action.handler(...)` on a
      // manager table needs a place to dispatch. The detach route is
      // M2M-specific but cheap enough to register either way; non-M2M
      // managers' `Action.relationDetach` factories return `visible=false`
      // anyway, so the URL is unreachable in practice.

      // Action dispatch — POST ${parentBase}/_action/:actionName
      // Resolves the manager's table elements, finds the named action,
      // and dispatches it with `ctx.relation = { parent, parentId, rel }`
      // so M2M handlers can call `parent.related(rel).attach / detach`.
      // Records hydrate against the related model (the rows visible in
      // the manager's table are related-model records).
      router.post(`${parentBase}/_action/:actionName`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return

        const actionName = req.params['actionName']!
        const body  = await readFormBody(req)
        const input = parseActionBody(body)

        // Rebuild the manager's table so the dispatcher can find the
        // action by name. Pure recreation — same context the page-data
        // builder uses — so factories that close over `ctx` (URL,
        // mode, parent record) see the same shape as at page render.
        const managerCtx = {
          basePath:     base,
          parentSlug:   slug,
          parentId:     pre.recordId,
          relationship: rel,
          parentRecord: pre.parent,
          related:      Related,
          mode,
        }
        const table = M.table(Table.make(), managerCtx)
        const elements: import('../schema/Element.js').Element[] = [table]
        // Stamp dispatch URLs so any nested action factories that read
        // `dispatchUrl` (rare — most read it from the meta at render
        // time) still see something sensible.
        const listUrl = parentBase.replace(':id', pre.recordId)
        tagActionDispatch(elements, listUrl)

        const target = resolveDispatchTarget(elements, actionName)
        if (!target) {
          if (json) { res.status(404); return res.json({ ok: false, error: `Action "${actionName}" not found` }) }
          res.status(404)
          return res.send(`Action "${actionName}" not found on ${M.name}`)
        }

        const resolveRecord: ResolveRecord | undefined = Related?.model
          ? (id: string) => Related.model!.find(id)
          : undefined

        const result = await dispatchAction(target.action, {
          ...input,
          request: req,
          user:    pre.user,
          relation: { parent: pre.parent, parentId: pre.recordId, relationship: rel },
          ...(target.rowField   ? { rowField:   target.rowField   } : {}),
          ...(target.formSchema ? { formSchema: target.formSchema } : {}),
        }, resolveRecord)
        return sendActionResult(req, res, json, result, base, listUrl)
      })

      // Detach — POST ${parentBase}/:childId/_detach
      // Direct row-action target for `Action.relationDetach`. Removes the
      // pivot row only; the related record stays in place. IDOR check:
      // verify the child is currently attached before calling detach so
      // a tampered URL can't probe random ids.
      router.post(`${parentBase}/:childId/_detach`, async (req, res) => {
        const json = wantsJson(req)
        const pre = await requireParent(req, res, json)
        if (!pre) return
        const childId = req.params['childId']!

        if (mode !== 'belongsToMany' && mode !== 'morphToMany' && mode !== 'morphedByMany') {
          // Detach is meaningless for hasMany — the user wants `delete`.
          // Surface a clear 404 instead of silently no-op'ing.
          res.status(404)
          const msg = 'Detach is only supported on M2M relations (belongsToMany, morphToMany, morphedByMany)'
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }

        // Manager-only canDetach: pivot ops don't fall through to the
        // related Resource. We don't have the related child loaded yet —
        // pass `undefined` for the per-record arg; canDetach gates on
        // (user, parent) by default and only sees `record` when a
        // manager has explicitly overridden with a per-row predicate.
        // Authors who need per-row gating can detect undefined and either
        // load the child themselves or short-circuit.
        // Two distinct accessors are needed under the real
        // `@rudderjs/orm`:
        //   - `parent.related(rel)` returns a deferred QueryBuilder
        //     with `where / paginate` (IDOR read-side check).
        //   - `parent[rel]()` returns the pivot-mutation accessor with
        //     `attach / detach / sync` (write-side).
        // Test stubs may collapse both onto the same `parent.related(rel)`
        // shape — handle that fallback so existing tests keep passing.
        let child: unknown = undefined
        const readSide = (pre.parent as { related?: (n: string) => { where?: (...a: unknown[]) => unknown; paginate?: (p: number, pp: number) => Promise<{ data: unknown[] }> } })
          ?.related?.(rel)
        if (!readSide) {
          res.status(500)
          const msg = `Parent.related("${rel}") missing — wrong relation type or ORM version?`
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }
        try {
          // IDOR: confirm the child is currently attached.
          if (typeof readSide.paginate === 'function') {
            const pk = Related?.model ? getPrimaryKey(Related.model) : 'id'
            const out = await (readSide as unknown as { where: (col: string, op: string, val: unknown) => { paginate: (p: number, pp: number) => Promise<{ data: unknown[] }> } }).where(pk, '=', childId).paginate(1, 1)
            child = Array.isArray(out.data) ? out.data[0] : undefined
          }
        } catch {
          // fall through; null child means we couldn't verify — safer to 404
        }
        if (child === undefined) { res.status(404); return res.send('Not found') }

        if (!await safeManagerPolicy(M, 'canDetach', undefined, pre.user, pre.parent, child)) return forbidden(req, res, json)

        // Real ORM: `parent[rel]()` returns the pivot accessor. Test
        // stubs: `parent.related(rel)` may carry `detach` directly.
        // Try the prototype-installed instance method first, then fall
        // back to the read-side shape.
        let writeAccessor: { detach?: (ids: unknown) => Promise<unknown> } | undefined
        const inst = (pre.parent as Record<string, unknown>)[rel]
        if (typeof inst === 'function') {
          try {
            const out = (inst as () => unknown).call(pre.parent) as { detach?: (ids: unknown) => Promise<unknown> } | undefined
            if (out && typeof out.detach === 'function') writeAccessor = out
          } catch { /* fall through to legacy shape */ }
        }
        if (!writeAccessor && typeof (readSide as { detach?: unknown }).detach === 'function') {
          writeAccessor = readSide as { detach: (ids: unknown) => Promise<unknown> }
        }
        if (!writeAccessor) {
          res.status(500)
          const msg = `Pivot accessor missing on ${rel} — wrong relation type or ORM version?`
          return json ? res.json({ ok: false, error: msg }) : res.send(msg)
        }

        try {
          await writeAccessor.detach!([childId])
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Detach failed'
          res.status(500)
          return json ? res.json({ ok: false, error: message }) : res.send(message)
        }

        const listUrl = parentBase.replace(':id', pre.recordId)
        return sendMutationSuccess(req, res, json, {
          id: childId, kind: 'rdetach', title: `${M.getLabelSingular()} detached`, redirect: listUrl,
        })
      })

      // ── Phase B nested relation routes ──────────────────
      // For each manager N declared under M.relations(), mount the
      // depth-2 list/create/view/edit/delete handlers. Auth + chain
      // IDOR are centralized in `nestedRelationManagerData` — route
      // bodies dispatch the data builder and unwrap the tagged
      // {ok:false,status:403} / null shapes. Surface area mirrors
      // Phase A: no M2M attach/detach, no soft-delete restore on
      // nested managers in v1 (open follow-ups if a consumer asks).
      for (const N of M.relations()) {
        const nestedRel  = N.getRelationship()
        const nestedBase = `${parentBase}/:childId/${nestedRel}`

        // Hoist the depth-2 related-resource lookups out of per-handler
        // closures — same rationale as the depth-1 `Related` hoist above.
        // `Related1` is the (M-side) related Resource (already hoisted as
        // `Related`); `Related2` is the (N-side) related Resource.
        const Related1 = Related
        const Related2 = Related1 ? findRelatedResource(N, Related1, cfg) : undefined

        // Build a `chain` tuple from the URL params for relayed calls
        // into `relationManagerData`. The childId of the *outer* manager
        // is the recordId of the leaf step.
        const buildChain = (id: string, childId1: string): [{ recordId: string; relationship: string }, { recordId: string; relationship: string }] => [
          { recordId: id,       relationship: rel },
          { recordId: childId1, relationship: nestedRel },
        ]

        // ── List ──
        router.get(nestedBase, async (req, res) => {
          const json = wantsJson(req)
          const params = req.params as Record<string, string | undefined>
          const id       = params['id']!
          const childId1 = params['childId']!
          const data = await relationManagerData(pilotiq, {
            kind: 'nested-relation-list', slug,
            chain: buildChain(id, childId1),
            query: req.query as Record<string, string>,
          }, req)
          if (data === null)                            { res.status(404); return res.send('Not found') }
          if ('ok' in data && data.ok === false)        return forbidden(req, res, json)
          return view('pilotiq.nested-relation-list', data)
        })

        // ── Create (GET) ──
        router.get(`${nestedBase}/create`, async (req, res) => {
          const json = wantsJson(req)
          const params = req.params as Record<string, string | undefined>
          const id       = params['id']!
          const childId1 = params['childId']!
          const data = await relationManagerData(pilotiq, {
            kind: 'nested-relation-create', slug,
            chain: buildChain(id, childId1),
          }, req)
          if (data === null)                            { res.status(404); return res.send('Not found') }
          if ('ok' in data && data.ok === false)        return forbidden(req, res, json)
          return view('pilotiq.nested-relation-create', data)
        })

        // ── Create (POST) ──
        router.post(`${nestedBase}/create`, async (req, res) => {
          const json = wantsJson(req)
          const params = req.params as Record<string, string | undefined>
          const id       = params['id']!
          const childId1 = params['childId']!
          // Run the chain walk once to verify auth + IDOR + load child1.
          // Any failure returns the same tagged shape we serve on GET.
          const pre = await relationManagerData(pilotiq, {
            kind: 'nested-relation-create', slug,
            chain: buildChain(id, childId1),
          }, req)
          if (pre === null)                             { res.status(404); return res.send('Not found') }
          if ('ok' in pre && pre.ok === false)          return forbidden(req, res, json)

          // Re-resolve the leaf manager's bits for form submit. We need
          // the leaf parent record (`child1`) and the related class for
          // save/loadRecord wiring. Reuse `findRelatedResource` against
          // the chain walk's intermediate Resource (Related1).
          if (!Related1) {
            res.status(500)
            const msg = `Nested manager ${N.name}: cannot resolve middle Resource for create`
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }
          if (!Related2?.model) {
            res.status(500)
            const msg = `Nested manager ${N.name}: cannot resolve related Resource for create`
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }
          const user   = await pilotiq.resolveUser(req)
          const child1 = await findRecord(Related1, childId1, { user }).catch(() => undefined)
          if (!child1) { res.status(404); return res.send('Not found') }

          const body = await readFormBody(req)
          const { values } = splitMeta(body)

          const listUrl   = nestedBase.replace(':id', id).replace(':childId', childId1)

          const nestedMode: RelationMode = Related1.model
            ? normalizeRelationMode(getRelationType(Related1.model, nestedRel))
            : 'hasMany'

          const form = N.form(Form.make(), {
            basePath:     base,
            parentSlug:   slug,
            parentId:     childId1,
            relationship: nestedRel,
            parentRecord: child1,
            related:      Related2,
            mode:         nestedMode,
            chain:        [{ slug, recordId: id, relationship: rel }],
          })
          if (Related2.model) {
            if (!form.getSave())       form.save(modelSave(Related2.model))
            if (!form.getLoadRecord()) form.loadRecord(modelLoadRecord(Related2))
          }

          // Polymorphic morph-column auto-injection mirrors the depth-1
          // create handler — uses Related1 (the leaf parent's owner) as
          // the morph source on the leaf relation.
          if (nestedMode === 'morphMany' && Related1.model) {
            const morphDesc = getMorphRelationDescriptor(Related1.model, nestedRel)
            if (!morphDesc) {
              res.status(500)
              const msg = `Nested manager ${N.name}: relations[${JSON.stringify(nestedRel)}] reports a polymorphic type but is missing morphName.`
              return json ? res.json({ ok: false, error: msg }) : res.send(msg)
            }
            const morphPayload = computeMorphPayload(child1, morphDesc)
            const existing = form.getMutateDataBeforeCreate()
            form.mutateDataBeforeCreate(async (data, ctx) => {
              const next = existing ? await existing(data, ctx) : data
              return { ...next, ...morphPayload }
            })
          }

          const formCtx = {
            values,
            basePath: base,
            parent: child1,
            parentId: childId1,
            relationship: nestedRel,
          }

          const result = await dispatchFormSubmit(form, values, formCtx)
          if (!result.ok) {
            if (json) { res.status(422); return res.json({ ok: false, errors: result.errors }) }
            const data = await relationManagerData(pilotiq, {
              kind: 'nested-relation-create', slug,
              chain: buildChain(id, childId1),
              prefill: { values, errors: result.errors ?? {} },
            }, req)
            res.status(422)
            return view('pilotiq.nested-relation-create', data ?? {})
          }

          const redirect = normalizeRedirect(result.redirect, base) ?? listUrl
          return sendRedirectResponse(req, res, json, redirect, result.notifications,
            result.relationshipRenames.length > 0 ? { relationshipRenames: result.relationshipRenames } : undefined,
          )
        })

        // ── View ──
        router.get(`${nestedBase}/:childId2`, async (req, res) => {
          const json = wantsJson(req)
          const params = req.params as Record<string, string | undefined>
          const id       = params['id']!
          const childId1 = params['childId']!
          const childId2 = params['childId2']!
          if (childId2 === 'create')                    { res.status(404); return res.send('Not found') }
          const data = await relationManagerData(pilotiq, {
            kind: 'nested-relation-view', slug,
            chain: buildChain(id, childId1),
            childId: childId2,
          }, req)
          if (data === null)                            { res.status(404); return res.send('Not found') }
          if ('ok' in data && data.ok === false)        return forbidden(req, res, json)
          return view('pilotiq.nested-relation-view', data)
        })

        // ── Edit (GET) ──
        router.get(`${nestedBase}/:childId2/edit`, async (req, res) => {
          const json = wantsJson(req)
          const params = req.params as Record<string, string | undefined>
          const id       = params['id']!
          const childId1 = params['childId']!
          const childId2 = params['childId2']!
          const data = await relationManagerData(pilotiq, {
            kind: 'nested-relation-edit', slug,
            chain: buildChain(id, childId1),
            childId: childId2,
          }, req)
          if (data === null)                            { res.status(404); return res.send('Not found') }
          if ('ok' in data && data.ok === false)        return forbidden(req, res, json)
          return view('pilotiq.nested-relation-edit', data)
        })

        // ── Edit (POST) ──
        router.post(`${nestedBase}/:childId2/edit`, async (req, res) => {
          const json = wantsJson(req)
          const params = req.params as Record<string, string | undefined>
          const id       = params['id']!
          const childId1 = params['childId']!
          const childId2 = params['childId2']!

          // Replay the chain to verify auth, IDOR, load child1+child2.
          const pre = await relationManagerData(pilotiq, {
            kind: 'nested-relation-edit', slug,
            chain: buildChain(id, childId1),
            childId: childId2,
          }, req)
          if (pre === null)                             { res.status(404); return res.send('Not found') }
          if ('ok' in pre && pre.ok === false)          return forbidden(req, res, json)

          if (!Related1) {
            res.status(500)
            const msg = `Nested manager ${N.name}: cannot resolve middle Resource for edit`
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }
          if (!Related2?.model) {
            res.status(500)
            const msg = `Nested manager ${N.name}: cannot resolve related Resource for edit`
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }

          const user   = await pilotiq.resolveUser(req)
          // Parallelize child1 + child2 loads — both depend only on `user`.
          const [child1, child2] = await Promise.all([
            findRecord(Related1, childId1, { user }).catch(() => undefined),
            findRecord(Related2, childId2, { user }).catch(() => undefined),
          ])
          if (!child1) { res.status(404); return res.send('Not found') }
          if (!child2) { res.status(404); return res.send('Not found') }

          const body = await readFormBody(req)
          const { values } = splitMeta(body)

          const editUrl = `${nestedBase}/${childId2}/edit`.replace(':id', id).replace(':childId', childId1)

          const nestedMode: RelationMode = Related1.model
            ? normalizeRelationMode(getRelationType(Related1.model, nestedRel))
            : 'hasMany'

          const form = N.form(Form.make(), {
            basePath:     base,
            parentSlug:   slug,
            parentId:     childId1,
            relationship: nestedRel,
            parentRecord: child1,
            related:      Related2,
            mode:         nestedMode,
            chain:        [{ slug, recordId: id, relationship: rel }],
          })
          if (!form.getSave())       form.save(modelSave(Related2.model))
          if (!form.getLoadRecord()) form.loadRecord(modelLoadRecord(Related2))

          if (nestedMode === 'morphMany' && Related1.model) {
            const morphDesc = getMorphRelationDescriptor(Related1.model, nestedRel)
            if (morphDesc) {
              const morphPayload = computeMorphPayload(child1, morphDesc)
              const existing = form.getMutateDataBeforeUpdate()
              form.mutateDataBeforeUpdate(async (data, ctx) => {
                const next = existing ? await existing(data, ctx) : data
                return { ...next, ...morphPayload }
              })
            }
          }

          const formCtx = {
            values,
            basePath: base,
            record: child2,
            parent: child1,
            parentId: childId1,
            relationship: nestedRel,
          }

          const result = await dispatchFormSubmit(form, values, formCtx)
          if (!result.ok) {
            if (json) { res.status(422); return res.json({ ok: false, errors: result.errors }) }
            const data = await relationManagerData(pilotiq, {
              kind: 'nested-relation-edit', slug,
              chain: buildChain(id, childId1),
              childId: childId2,
              prefill: { values, errors: result.errors ?? {} },
            }, req)
            res.status(422)
            return view('pilotiq.nested-relation-edit', data ?? {})
          }

          const redirect = normalizeRedirect(result.redirect, base) ?? editUrl
          return sendRedirectResponse(req, res, json, redirect, result.notifications,
            result.relationshipRenames.length > 0 ? { relationshipRenames: result.relationshipRenames } : undefined,
          )
        })

        // ── Delete ──
        router.post(`${nestedBase}/:childId2/delete`, async (req, res) => {
          const json = wantsJson(req)
          const params = req.params as Record<string, string | undefined>
          const id       = params['id']!
          const childId1 = params['childId']!
          const childId2 = params['childId2']!

          // Replay the chain to verify auth + IDOR + load child2.
          // We piggy-back on the edit scope's checks (canEdit on the
          // leaf manager — same gate the depth-1 delete uses today via
          // the relation-edit scope).
          const pre = await relationManagerData(pilotiq, {
            kind: 'nested-relation-edit', slug,
            chain: buildChain(id, childId1),
            childId: childId2,
          }, req)
          if (pre === null)                             { res.status(404); return res.send('Not found') }
          if ('ok' in pre && pre.ok === false)          return forbidden(req, res, json)

          if (!Related1) {
            res.status(500)
            const msg = `Nested manager ${N.name}: cannot resolve middle Resource for delete`
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }
          if (!Related2?.model) {
            res.status(500)
            const msg = `Nested manager ${N.name}: cannot resolve related Resource for delete`
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }

          const user   = await pilotiq.resolveUser(req)
          // Parallelize child1 + child2 loads — both depend only on `user`.
          const [child1, child2] = await Promise.all([
            findRecord(Related1, childId1, { user }).catch(() => undefined),
            findRecord(Related2, childId2, { user }).catch(() => undefined),
          ])
          if (!child1) { res.status(404); return res.send('Not found') }
          if (!child2) { res.status(404); return res.send('Not found') }

          if (!await safeManagerPolicy(N, 'canDelete', Related2, user, child1, child2)) return forbidden(req, res, json)

          const listUrl = nestedBase.replace(':id', id).replace(':childId', childId1)
          try {
            await Related2.model.delete(childId2)
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Delete failed'
            res.status(500)
            return json ? res.json({ ok: false, error: message }) : res.send(message)
          }

          return sendMutationSuccess(req, res, json, {
            id: childId2, kind: 'nrdelete', title: `${N.getLabelSingular()} deleted`, redirect: listUrl,
          })
        })

        // ── Phase B follow-up — nested action / detach / soft-delete ──
        // Mirror the depth-1 manager surface (`_action`, `_detach`,
        // `restore`, `force-delete`) under the nested manager. Auth +
        // chain IDOR centralized in `resolveRelationChain`; each route
        // layers its own scope-specific gate (canDetach / canRestore /
        // canForceDelete; the action route mirrors depth-1 by not adding
        // an extra manager-level gate beyond the chain walk).
        const nestedChainSlug = slug
        const requireNestedChain = async (req: AppRequest, res: AppResponse, json: boolean): Promise<{
          user:     unknown
          resolved: ResolvedChain
          parentId: string
          child1Id: string
        } | undefined> => {
          const id       = req.params['id']!
          const child1Id = req.params['childId']!
          const user = await pilotiq.resolveUser(req)
          const resolved = await resolveRelationChain(pilotiq, {
            kind:  'nested-relation-list',
            slug:  nestedChainSlug,
            chain: [
              { recordId: id,       relationship: rel },
              { recordId: child1Id, relationship: nestedRel },
            ],
          }, user)
          if (resolved === null) { res.status(404); res.send('Not found'); return undefined }
          if ('ok' in resolved) { forbidden(req, res, json); return undefined }
          return { user, resolved, parentId: id, child1Id }
        }

        // Listing URL (filled per request — `:id` / `:childId` get baked
        // in once the params are known). All four routes redirect here
        // on success so users land back on the nested-relation list.
        const nestedListUrlFor = (id: string, child1Id: string): string =>
          nestedBase.replace(':id', id).replace(':childId', child1Id)

        // ── Action dispatch — POST ${nestedBase}/_action/:actionName ──
        // Resolves N's table elements, finds the named action, dispatches
        // it with `ctx.relation = { parent: child1, parentId, rel }` so
        // M2M handlers on the nested manager can call accessor methods.
        // Handler-style actions are useful on hasMany too — mounted
        // unconditionally.
        router.post(`${nestedBase}/_action/:actionName`, async (req, res) => {
          const json = wantsJson(req)
          const pre = await requireNestedChain(req, res, json)
          if (!pre) return
          const { resolved } = pre
          const { child1, M2, Related2, child2Mode } = resolved

          const actionName = req.params['actionName']!
          const body  = await readFormBody(req)
          const input = parseActionBody(body)

          // Manager ctx for N — same shape `nestedManagerCtx` builds for
          // the data-builder side, so factories that close over `ctx`
          // (URL templates, mode-aware visibility) see the same view as
          // at page render.
          const nestedManagerCtxObj = {
            basePath:     base,
            parentSlug:   resolved.R.getSlug(),
            parentId:     pre.child1Id,         // immediate parent of N = child1
            relationship: nestedRel,
            parentRecord: child1,
            related:      Related2,
            mode:         child2Mode,
            chain: [{
              slug:         resolved.R.getSlug(),
              recordId:     pre.parentId,
              relationship: rel,
            }],
          }
          const table = M2.table(Table.make(), nestedManagerCtxObj)
          const elements: import('../schema/Element.js').Element[] = [table]
          const listUrl = nestedListUrlFor(pre.parentId, pre.child1Id)
          tagActionDispatch(elements, listUrl)

          const target = resolveDispatchTarget(elements, actionName)
          if (!target) {
            if (json) { res.status(404); return res.json({ ok: false, error: `Action "${actionName}" not found` }) }
            res.status(404)
            return res.send(`Action "${actionName}" not found on ${M2.name}`)
          }

          const resolveRecord: ResolveRecord | undefined = Related2?.model
            ? (id: string) => Related2.model!.find(id)
            : undefined

          const result = await dispatchAction(target.action, {
            ...input,
            request: req,
            user:    pre.user,
            relation: { parent: child1, parentId: pre.child1Id, relationship: nestedRel },
            ...(target.rowField   ? { rowField:   target.rowField   } : {}),
            ...(target.formSchema ? { formSchema: target.formSchema } : {}),
          }, resolveRecord)
          return sendActionResult(req, res, json, result, base, listUrl)
        })

        // ── Detach — POST ${nestedBase}/:childId2/_detach ──
        // M2M-only direct row-detach. IDOR-checks the grandchild against
        // child1.related(nestedRel), then calls accessor.detach. Mirrors
        // the depth-1 detach route at line 1955.
        router.post(`${nestedBase}/:childId2/_detach`, async (req, res) => {
          const json = wantsJson(req)
          const pre = await requireNestedChain(req, res, json)
          if (!pre) return
          const childId2 = req.params['childId2']!
          const { resolved } = pre
          const { child1, M2, Related2, child2Mode } = resolved

          if (child2Mode !== 'belongsToMany' && child2Mode !== 'morphToMany' && child2Mode !== 'morphedByMany') {
            res.status(404)
            const msg = 'Detach is only supported on M2M relations (belongsToMany, morphToMany, morphedByMany)'
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }

          // IDOR: confirm child2 is currently attached to child1 under
          // nestedRel. Read-side accessor (`child1.related(nestedRel)`)
          // returns a deferred QueryBuilder; we never bypass it.
          const readSide = (child1 as { related?: (n: string) => { where?: (...a: unknown[]) => unknown; paginate?: (p: number, pp: number) => Promise<{ data: unknown[] }> } })
            ?.related?.(nestedRel)
          if (!readSide) {
            res.status(500)
            const msg = `child1.related("${nestedRel}") missing — wrong relation type or ORM version?`
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }
          let child2: unknown = undefined
          try {
            if (typeof readSide.paginate === 'function') {
              const pk = Related2?.model ? getPrimaryKey(Related2.model) : 'id'
              const out = await (readSide as unknown as { where: (col: string, op: string, val: unknown) => { paginate: (p: number, pp: number) => Promise<{ data: unknown[] }> } }).where(pk, '=', childId2).paginate(1, 1)
              child2 = Array.isArray(out.data) ? out.data[0] : undefined
            }
          } catch { /* fall through */ }
          if (child2 === undefined) { res.status(404); return res.send('Not found') }

          if (!await safeManagerPolicy(M2, 'canDetach', Related2, pre.user, child1, child2)) return forbidden(req, res, json)

          // Real ORM: child1[nestedRel]() returns the pivot accessor
          // with attach/detach/sync. Test stubs may collapse onto
          // `child1.related(nestedRel)` — try both.
          let writeAccessor: { detach?: (ids: unknown) => Promise<unknown> } | undefined
          const inst = (child1 as Record<string, unknown>)[nestedRel]
          if (typeof inst === 'function') {
            try {
              const out = (inst as () => unknown).call(child1) as { detach?: (ids: unknown) => Promise<unknown> } | undefined
              if (out && typeof out.detach === 'function') writeAccessor = out
            } catch { /* fall through */ }
          }
          if (!writeAccessor && typeof (readSide as { detach?: unknown }).detach === 'function') {
            writeAccessor = readSide as { detach: (ids: unknown) => Promise<unknown> }
          }
          if (!writeAccessor) {
            res.status(500)
            const msg = `Pivot accessor missing on ${nestedRel} — wrong relation type or ORM version?`
            return json ? res.json({ ok: false, error: msg }) : res.send(msg)
          }

          try {
            await writeAccessor.detach!([childId2])
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Detach failed'
            res.status(500)
            return json ? res.json({ ok: false, error: message }) : res.send(message)
          }

          const listUrl = nestedListUrlFor(pre.parentId, pre.child1Id)
          return sendMutationSuccess(req, res, json, {
            id: childId2, kind: 'nrdetach', title: `${M2.getLabelSingular()} detached`, redirect: listUrl,
          })
        })

        // ── Soft-delete: restore + force-delete ───────────────────────
        // Opt in only when Related2 has `softDeletes = true` AND its
        // model carries `restore` / `forceDelete`. Mirrors the depth-1
        // routes at line 1804+. IDOR runs against child1.related(nestedRel)
        // broadened with `withTrashed()` so trashed grandchildren resolve.
        const Related2ForSoft = Related2
        if (Related2ForSoft?.softDeletes) {
          const RM2 = Related2ForSoft.model
          if (!RM2) {
            throw new Error(
              `[Pilotiq] Nested RelationManager ${N.name} on ${M.name} (${R.name}): related Resource ${Related2ForSoft.name} has softDeletes = true but no model. ` +
              `Wire one up or unset softDeletes.`,
            )
          }
          if (typeof RM2.restore !== 'function' || typeof RM2.forceDelete !== 'function') {
            throw new Error(
              `[Pilotiq] Nested RelationManager ${N.name} on ${M.name} (${R.name}): related Resource ${Related2ForSoft.name} has softDeletes = true but model.restore / model.forceDelete are missing. ` +
              `Set Model.softDeletes = true on the rudder side, or upgrade @rudderjs/orm.`,
            )
          }

          // Like the depth-1 helper: load the grandchild via the parent's
          // relation query, broadened with `withTrashed()`. Returns
          // undefined when the lookup misses or the grandchild doesn't
          // belong to child1 under nestedRel.
          const loadTrashableGrandchild = async (parentChild: unknown, child2Id: string): Promise<unknown> => {
            const pk = (RM2.primaryKey ?? 'id') as string
            const q: import('../orm/modelDefaults.js').ModelQuery = (parentChild as { related: (n: string) => import('../orm/modelDefaults.js').ModelQuery }).related(nestedRel)
            return findInQueryWithTrashed(q, pk, child2Id)
          }

          // Restore — POST ${nestedBase}/:childId2/restore
          router.post(`${nestedBase}/:childId2/restore`, async (req, res) => {
            const json = wantsJson(req)
            const pre = await requireNestedChain(req, res, json)
            if (!pre) return
            const childId2 = req.params['childId2']!
            const child2 = await loadTrashableGrandchild(pre.resolved.child1, childId2)
            if (!child2) { res.status(404); return res.send('Not found') }

            if (!await safeManagerPolicy(N, 'canRestore', Related2ForSoft, pre.user, pre.resolved.child1, child2)) return forbidden(req, res, json)

            const listUrl = nestedListUrlFor(pre.parentId, pre.child1Id)
            try {
              await RM2.restore!(childId2)
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Restore failed'
              res.status(500)
              return json ? res.json({ ok: false, error: message }) : res.send(message)
            }

            return sendMutationSuccess(req, res, json, {
              id: childId2, kind: 'nrrestore', title: `${N.getLabelSingular()} restored`, redirect: listUrl,
            })
          })

          // Force-delete — POST ${nestedBase}/:childId2/force-delete
          router.post(`${nestedBase}/:childId2/force-delete`, async (req, res) => {
            const json = wantsJson(req)
            const pre = await requireNestedChain(req, res, json)
            if (!pre) return
            const childId2 = req.params['childId2']!
            const child2 = await loadTrashableGrandchild(pre.resolved.child1, childId2)
            if (!child2) { res.status(404); return res.send('Not found') }

            if (!await safeManagerPolicy(N, 'canForceDelete', Related2ForSoft, pre.user, pre.resolved.child1, child2)) return forbidden(req, res, json)

            const listUrl = nestedListUrlFor(pre.parentId, pre.child1Id)
            try {
              await RM2.forceDelete!(childId2)
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Force-delete failed'
              res.status(500)
              return json ? res.json({ ok: false, error: message }) : res.send(message)
            }

            return sendMutationSuccess(req, res, json, {
              id: childId2, kind: 'nrforce', title: `${N.getLabelSingular()} permanently deleted`, redirect: listUrl,
            })
          })
        }
      }
    }
}
