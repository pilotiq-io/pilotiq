---
"@pilotiq/pilotiq": minor
---

Add a System Settings area — an admin-runtime settings surface, distinct from user content (Pages / Globals), that installed packages can extend the way iOS apps inject their own settings panes.

**New contribution API:**

```ts
Pilotiq.make('Admin').settingsPane({
  id:     'ai',
  label:  'AI',
  icon:   'sparkles',
  group:  'Integrations',
  render: AiSettingsPane,   // OR href: '/admin/account' to cross-link a page
  canAccess: user => isAdmin(user),
})
```

`settingsPane(c)` / `settingsPanes([…])` register panes (mirrors `rightPanel()`): each is auth-gated, sorted, and serialized into `panel.settings`; the React `render` is harvested into `_components.ts` (`settingsPaneRegistry`) and never crosses the wire. Adapter packages register panes from inside their plugin's `register(panel)`.

**Shell + nav:** a single gear **Settings** nav entry opens `${base}/settings` — an iOS-style shell with a grouped section rail. The entry appears only when at least one accessible pane exists.

**Theme editor migrated:** `themeEditor()` now registers a built-in **Theme** pane instead of a standalone "Theme" nav item. The old `${base}/theme` URL 302-redirects to `${base}/settings/theme` (bookmarks keep working); the theme API endpoints are unchanged.

**Profile:** when `.profile(Page)` is set, a **Profile** entry is surfaced in the Settings rail (and the user menu). The profile page is no longer rendered as a standalone sidebar item — it lives in the user menu + Settings, matching its intended role. Its route is unchanged.

**Reserved slug:** `settings` is now a reserved top-level slug (alongside `theme` / `api`). A Resource / Global / Page / Cluster using `settings` throws a clear error at boot — rename it (e.g. `site-settings`). This is the only breaking note; everything else is additive.

New exports: `settingsPane`/`settingsPanes`/`getSettingsPanes` on the builder; `SettingsPaneContribution` / `SettingsPaneProps` types; `SettingsShell`, `ThemeSettingsPane`, and the settings-pane registry from `@pilotiq/pilotiq/react`.
