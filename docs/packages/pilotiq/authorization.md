# Authorization

`Resource`, `Global`, and `Page` expose six async predicates that the
framework consults before serving any route. All default to `true` —
permissive until you opt in.

```ts filename="app/Pilotiq/Resources/PostResource.ts"
export class PostResource extends Resource {
  static slug() { return 'posts' }

  static canAccess(user)             { return Boolean(user) }
  static canViewAny(user)            { return user.role !== 'banned' }
  static canView(user, record)       { return record.public || record.authorId === user.id }
  static canCreate(user)             { return user.role === 'editor' }
  static canEdit(user, record)       { return record.authorId === user.id }
  static canDelete(user, record)     { return user.role === 'admin' }
}
```

| Predicate | Gates |
|---|---|
| `canAccess(user)` | Sidebar visibility + every route. Fail → 403 on every URL under the resource |
| `canViewAny(user)` | List page |
| `canView(user, record)` | View page + per-row links in the list |
| `canCreate(user)` | Create page + the "Create" header action |
| `canEdit(user, record)` | Edit page + per-row Edit action |
| `canDelete(user, record)` | Delete action (per-row + bulk) |

> [!IMPORTANT]
> Predicates throwing → fail closed. Routes return 403, not 500.

## Resolving the user

`Pilotiq.user(req => userOrNull)` is the opaque user resolver. Whatever
shape you return is what gets passed to every `can*` predicate.

```ts filename="bootstrap/providers.ts"
pilotiq([adminPanel])
  .user(async (req) => {
    const session = await req.session.get('user')
    return session ? await User.find(session.id) : null
  })
```

## 401 vs 403

`Pilotiq.guard()` is the 401 layer (unauthenticated → redirect to
login). `can*` predicates produce 403 (authenticated but unauthorized).
Don't conflate the two.

## Soft-delete extras

When `Resource.softDeletes = true`, two extra predicates kick in:

```ts
static canRestore(user, record)      { return user.role === 'admin' }
static canForceDelete(user, record)  { return this.canDelete(user, record) }
```

Both default sensibly — `canForceDelete` falls through to `canDelete`
so you don't have to redeclare it in the common case.
