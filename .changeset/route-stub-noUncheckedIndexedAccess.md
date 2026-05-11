---
'@pilotiq/pilotiq': patch
---

Emit `parts[0]!` for the `basePath` field in every auto-generated route stub. Under consumers' `noUncheckedIndexedAccess` tsconfig, the previous `basePath: parts[0]` typed as `string | undefined`, which Vike's `RouteSync.routeParams: Record<string, string>` rejects. The non-null assertion is safe because each route guards on `parts.length` before reaching the return.
