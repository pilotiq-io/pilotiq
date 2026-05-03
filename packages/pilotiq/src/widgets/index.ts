// Widget runtime registry — opt-in component registration for `View`
// elements. Imported by panel `bootstrap/providers.ts`, not by `AdminPanel.ts`
// (which is re-imported on the client via the Vite plugin's
// `_components.ts` manifest — same constraint as `@pilotiq/pilotiq/uploads`,
// per `feedback_pilotiq_panel_module_client_safe.md`).
export {
  registerWidgetComponents,
  getWidgetComponent,
  type WidgetComponent,
} from './registry.js'
