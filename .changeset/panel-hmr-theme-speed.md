---
'@pilotiq/pilotiq': patch
---

fix(pilotiq): preserve theme + speed up panel hot-reload

Two refinements to the dev panel-HMR support added in the prior patch:

- **Theme no longer resets on a panel edit.** Boot-time runtime state — the theme storage adapter and the DB-loaded overrides injected by the provider's `boot()` — is now carried onto the freshly hot-reloaded panel instance (new internal `Pilotiq.getThemeOverrides()`), so editing `AdminPanel.ts` keeps the active theme/colors.
- **Faster saves.** The dev watcher rebuilds both the client component manifest and the live registry from a single **incremental** `ssrLoadModule` import instead of the no-cache jiti re-import it used before — so each save only re-executes the modules that actually changed.
