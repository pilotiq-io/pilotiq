---
'@pilotiq/pilotiq': patch
---

Tighten auto-generated page-stub emissions so consumers' `tsc --noEmit` passes under `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`:

- All 10 depth-1 and 4 depth-2 route stubs now emit `basePath: parts[0]!` (was `parts[0]`, typed as `string | undefined`, which Vike's `RouteSync.routeParams: Record<string, string>` rejects).
- `_clusterOffset.ts` emits `slugs.includes(parts[1]!)` for the same reason.
- `+Layout.tsx` passes `currentPath={currentPath ?? ''}` to `<AppShell>` so `exactOptionalPropertyTypes` accepts the prop.

The non-null assertions are safe — each route guards on `parts.length` before reaching the return; `_clusterOffset` checks `parts.length < 2` before reading `parts[1]`. Pure emission tightening — no runtime behavior change.
