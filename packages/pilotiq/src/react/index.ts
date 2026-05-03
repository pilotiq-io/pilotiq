export { AppShell, type AppShellProps } from './AppShell.js'
export {
  ComponentRegistryProvider,
  useComponentRegistry,
  useIconFor,
  type ComponentRegistry,
} from './icon-context.js'

export { SchemaRenderer, type SchemaRendererProps } from './SchemaRenderer.js'
export { registerFieldRenderer, getFieldRenderer, type FieldRendererProps } from './registry.js'
export {
  registerWidgetRenderer,
  getWidgetRenderer,
  type WidgetRendererProps,
} from './widgetRegistry.js'

export {
  FormStateProvider,
  useFieldState,
  useFormState,
  type FormStateApi,
  type FormStateProviderProps,
  type UseFieldStateResult,
} from './FormStateContext.js'

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

export { ThemeProvider, useTheme } from './ThemeProvider.js'
export { ThemeToggle } from './ThemeToggle.js'
export { ThemeSettingsPage } from './ThemeSettingsPage.js'

// Re-export pure theme functions for client-safe usage (avoids importing main barrel which has server-only code)
export { generateThemeCSS } from '../theme/generate-css.js'
export { resolveTheme } from '../theme/resolve.js'

// Backwards compat
export { AppShell as AdminShell, type AppShellProps as AdminShellProps } from './AppShell.js'
