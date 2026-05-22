---
name: pilotiq-relations
description: Wiring related entities in pilotiq — RelationManager tabs (hasMany / morph / belongsToMany), Repeater.relationship for inline child rows, and Builder.relationship for heterogeneous child types
license: MIT
appliesTo:
  - '@pilotiq/pilotiq'
trigger: defining `Resource.relations()`, subclassing `RelationManager`, or wiring `Repeater.relationship` / `Builder.relationship` for relation-backed array rows
skip: defining standalone fields with no parent-child semantics — that's `pilotiq-fields`
metadata:
  author: pilotiq
---

# Pilotiq Relations

## When to use this skill

Load when you're:

- Adding a `comments` / `tags` / `attachments` tab to a record's edit page via a `RelationManager`
- Choosing between a `RelationManager` (separate tab, full table + form) and `Repeater.relationship()` (inline rows on the parent form)
- Wiring a polymorphic (`morphMany` / `morphTo`) or many-to-many (`belongsToMany`) relation
- Building a Builder field whose rows persist as real child records with `{type, data}` shape (`Builder.relationship`)

For standalone form fields (no relation), use `pilotiq-fields`. For Resource basics, `pilotiq-resource`.

## Quick Reference

| Task | Open |
|---|---|
| RelationManager — separate tab on the parent's edit/view page; full table + form for the related records. Covers hasMany / morph / M2M | `rules/relation-managers.md` |
| Repeater.relationship — inline rows on the parent form backed by real `hasMany` / `morph*` / M2M children. Builder.relationship for `{type,data}` heterogeneous rows | `rules/repeater-relationship.md` |

## Key concepts (load once)

- **Two patterns, different UX.** A `RelationManager` is a separate tab with its own table — good for many children (Posts → Comments). A `Repeater.relationship()` is inline rows on the parent form — good for tight 1-to-few (Order → LineItems).
- **`RelationManager` requires `static relationName` to match a key on the parent model's `static relations` map.** That string doubles as URL segment (`/posts/:id/comments`) and the relation accessor (`parent.related('comments')`).
- **`RelationManager.mode` is auto-derived.** From `parent.constructor.relations[relationName].type` via `getRelationType + normalizeRelationMode`. `hasOne` / `hasMany` → `'hasMany'`; `morphMany` / `morphOne` → `'morphMany'`; `morphTo` → `'morphTo'`; M2M (`belongsToMany`, `morphToMany`, `morphedByMany`) → `'belongsToMany'`. Forms + actions adapt accordingly — M2M flips into pivot-mutation mode; morphMany auto-fills `<morphName>Id` / `<morphName>Type` on create + edit.
- **`Repeater.relationship` persists rows as real children.** Diffs submitted rows vs `parent.related(rel).get()` on save — matching `__id` runs `M.update`, missing ID runs `M.create`, existing PK absent from submitted set runs `M.delete`. M2M variant calls `accessor.attach/detach` instead of `M.delete`.
- **`Builder.relationship` adds a discriminator column** (default `'type'`, the block name) + a JSON payload column (default `'data'`, the per-block inner-schema values). Same diff persistence as Repeater.relationship, but each row carries its block type so the form can render the right inner schema.
- **Authorization is two-layered.** Parent's `canView` / `canEdit` runs first; then the manager's `canViewAny` / `canCreate` / `canEdit` / `canDelete` (or `canAttach` / `canDetach` for M2M). Fall-through: manager predicates default to the related Resource's matching predicate when the manager hasn't overridden (except `canAttach` / `canDetach` — manager-only, no fall-through).

## Examples

- `playground/app/Pilotiq/Posts/RelationManagers/CommentsRelationManager.ts` — vanilla `hasMany` manager.
- `playground/app/Pilotiq/Articles/RelationManagers/TagsRelationManager.ts` — `belongsToMany` with attach/detach.
- `playground/app/Pilotiq/Comments/CommentResource.ts` — `morphTo` (child-side polymorphic) shared across multiple parents.
- `playground/app/Pilotiq/Orders/Schemas/form.ts` — `Repeater.relationship('lineItems')` for inline child rows.
