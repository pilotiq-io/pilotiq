// Slot-component runtime registry — opt-in component registration for
// `SlotComponent` schema elements. Imported by panel `bootstrap/providers.ts`
// or by a plugin's `register(panel)` step (e.g. `@pilotiq-pro/ai`'s
// resource-header agents dropdown).
export {
  registerSlotComponents,
  getSlotComponent,
  type SlotComponent,
  type SlotComponentProps,
} from './registry.js'
