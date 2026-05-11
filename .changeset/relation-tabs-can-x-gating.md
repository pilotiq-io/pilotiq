---
'@pilotiq/pilotiq': minor
---

feat(core): per-tab `canX` gating on `RelationTabs`

The record sub-navigation strip (`[View, Edit, …managers]`) now runs the
matching authorization predicate for each tab and drops entries the
user can't reach. The routes always enforced — this is presentation
polish so the chrome doesn't promise a link that 403s on click.

**Gates evaluated per tab:**

- `__view` → `R.canView(user, parentRecord)`
- `__edit` → `R.canEdit(user, parentRecord)`
- manager  → `safeManagerPolicy(M, 'canViewAny', Related, user,
  parentRecord)` (falls through to the related Resource's
  `canViewAny` when the manager hasn't overridden — same shape as
  everywhere else)

Throwing predicate fails closed (tab hidden). Record-aware predicates
short-circuit to "visible" when the record-load failed (so the route's
own gate surfaces the 404/403, not a silent hide).

**Empty-strip collapse:** if every gated tab drops, `buildRelationTabs`
returns `undefined` and the strip is omitted entirely (consistent with
the existing "no managers registered" branch). The depth-2
`buildNestedRelationTabs` mirrors the shape — sibling nested manager
tabs gate on `safeManagerPolicy(N, 'canViewAny', Related, user,
child1Record)`; the back-link `__view` stays unconditional since the
user already passed `M.canViewAny` to reach that page; if all sibling
tabs drop the depth-2 strip is omitted (back-link alone isn't useful
sub-nav).

**No public API change.** Tab gating runs inside the existing
`buildRelationTabs` / `buildNestedRelationTabs` helpers — both private
to `pageData.ts`. Their callers (`resourceEditData` / `resourceViewData`
/ relation data builders / nested relation data builders) already had
`user` and `parentRecord` (or `child1`) in scope so threading is a
one-line change at each site.

7 tests added (6 depth-1 + 1 depth-2).
