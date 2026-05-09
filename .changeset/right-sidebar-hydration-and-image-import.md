---
"@pilotiq/pilotiq": patch
---

Two SSR-safety fixes that surface in real apps but tests don't catch:

- `<RightSidebarProvider>` no longer reads `localStorage` synchronously inside `useState(() => …)` initialisers — that produced a hydration mismatch every time a returning user reloaded with the panel previously open (server rendered the panel closed; client rehydrated it open). State now defaults to closed / fallback / default-width on the first render and rehydrates from `localStorage` in a post-mount `useEffect`. Standard SSR pattern; brief closed→open flash on reload is identical to first-visit behaviour.
- `routes.ts` server-side image-resize uses a variable-string `await import(name)` for the optional `@rudderjs/image` peer dep instead of a literal `'@rudderjs/image' as string`. The literal form bypassed Vite's static import-analysis only for TypeScript compilation; the analyser still failed at transform time on host apps that didn't have the package installed. Mirrors the existing pattern in `notifications/database.ts` for `@rudderjs/orm`.
