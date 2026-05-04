// Entry runtime registry — opt-in component registration for
// `ComponentEntry` elements. Imported by panel `bootstrap/providers.ts`,
// not by `AdminPanel.ts` (which is re-imported on the client via the Vite
// plugin's `_components.ts` manifest — same constraint as
// `@pilotiq/pilotiq/uploads` / `@pilotiq/pilotiq/widgets`, per
// `feedback_pilotiq_panel_module_client_safe.md`).
export {
  registerEntryComponents,
  getEntryComponent,
  type EntryComponent,
  type EntryComponentProps,
} from './registry.js'
