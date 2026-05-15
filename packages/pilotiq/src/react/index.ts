export { AppShell, type AppShellProps } from './AppShell.js'
export {
  ComponentRegistryProvider,
  useComponentRegistry,
  useIconFor,
  type ComponentRegistry,
} from './icon-context.js'

export {
  SchemaRenderer,
  type SchemaRendererProps,
  FormFields,
  type FormFieldsProps,
} from './SchemaRenderer.js'
export { registerFieldRenderer, getFieldRenderer, type FieldRendererProps } from './registry.js'
export { registerFieldLabelSlot, getFieldLabelSlot, type FieldLabelSlotProps } from './FieldLabelSlotRegistry.js'
export {
  registerPendingSuggestionOverlay,
  getPendingSuggestionOverlay,
  type PendingSuggestionOverlayProps,
} from './PendingSuggestionOverlayRegistry.js'
export {
  PendingSuggestionsContext,
  usePendingSuggestions,
  usePendingSuggestionsForField,
  type PendingSuggestion,
  type PendingSuggestionOrigin,
  type PendingSuggestionsApi,
} from './PendingSuggestionsContext.js'
export {
  registerPendingSuggestionApplier,
  getPendingSuggestionApplier,
  type PendingSuggestionApplier,
} from './PendingSuggestionApplierRegistry.js'
export {
  CollabRoomContext,
  useCollabRoom,
  type CollabRoom,
} from './CollabRoomContext.js'
export {
  registerCollabExtensions,
  getCollabExtensions,
  type CollabExtensionFactory,
  type CollabExtensionFactoryArgs,
} from './CollabExtensionFactoryRegistry.js'
export {
  registerCollabTextRenderer,
  getCollabTextRenderer,
  type CollabTextRenderer,
  type CollabTextRendererProps,
} from './CollabTextRendererRegistry.js'
export {
  registerFormCollabBinding,
  getFormCollabBinding,
  type FormCollabBinding,
  type FormCollabBindingFactory,
  type FormCollabBindingFactoryArgs,
  type TextBinding,
  type TextDelta,
  type RowsEvent,
  type RowBindingApi,
} from './FormCollabBindingRegistry.js'
export {
  registerFieldPresenceComponent,
  getFieldPresenceComponent,
  type FieldPresenceProps,
} from './FieldPresenceRegistry.js'
export {
  registerFieldFocusReporter,
  getFieldFocusReporter,
  type FieldFocusReporter,
  type FieldFocusEvent,
} from './FieldFocusReporterRegistry.js'
export {
  registerRecordWrapper,
  getRecordWrapper,
  type RecordWrapperProps,
} from './RecordWrapperRegistry.js'
export {
  RecordWrapperGate,
  type RecordWrapperGateProps,
} from './RecordWrapperGate.js'
export {
  parseRecordPageUrl,
  parseRecordEditUrl,
  type RecordPageIdentity,
  type RecordPageRole,
  type RecordEditIdentity,
} from './parseRecordEditUrl.js'
export {
  registerWidgetRenderer,
  getWidgetRenderer,
  type WidgetRendererProps,
} from './widgetRegistry.js'

export {
  FormStateProvider,
  useFieldState,
  useFormState,
  useRowBinding,
  type FormStateApi,
  type FormStateProviderProps,
  type UseFieldStateResult,
} from './FormStateContext.js'

export { parseFormDataToNested } from './formStateHelpers.js'

export { NavigateProvider, useNavigate, type NavigateFn } from './navigate.js'

export { ToasterProvider, useToast } from './Toaster.js'

export {
  WidgetDataProvider,
  useInitialWidgetData,
  useWidgetData,
  type WidgetState,
  type WidgetMetaLike,
  type WidgetDataProviderProps,
} from './WidgetDataContext.js'

export {
  RightPanelRegistryProvider,
  useRightPanelRegistry,
  useRightPanelComponent,
  type RightPanelRegistry,
} from './right-panel-registry.js'

export {
  RightSidebarProvider,
  useRightSidebar,
  useRightSidebarOptional,
  type RightSidebarApi,
  type RightSidebarProviderProps,
} from './RightSidebarContext.js'
export {
  RightSidebar,
  type RightSidebarProps,
} from './RightSidebar.js'
export { RightSidebarTrigger } from './RightSidebarTrigger.js'
export { SearchTrigger }       from './SearchTrigger.js'
export {
  useResizableWidth,
  clampPanelWidth,
  type UseResizableWidthOptions,
  type UseResizableWidthApi,
} from './useResizableWidth.js'

export {
  CurrentUserProvider,
  useCurrentUser,
  type CurrentUser,
} from './CurrentUserContext.js'

export { ThemeProvider, useTheme } from './ThemeProvider.js'
export { ThemeToggle } from './ThemeToggle.js'
export { ThemeSettingsPage } from './ThemeSettingsPage.js'
export { UserMenu } from './UserMenu.js'
export { NotificationBell } from './NotificationBell.js'
export { RenderHookSlot } from './RenderHookSlot.js'
export { HeadHooks }      from './HeadHooks.js'

export {
  isNavItemActive,
  type NavComponentProps,
  type HeaderComponentProps,
  type FooterComponentProps,
  type ComponentSlotRegistry,
} from './component-slots.js'
export type { NavItem } from '../pageData.js'

// Re-export pure theme functions for client-safe usage (avoids importing main barrel which has server-only code)
export { generateThemeCSS } from '../theme/generate-css.js'
export { resolveTheme } from '../theme/resolve.js'

// Backwards compat
export { AppShell as AdminShell, type AppShellProps as AdminShellProps } from './AppShell.js'
