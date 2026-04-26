export { Pilotiq, type PilotiqConfig, type PilotiqPlugin } from './Pilotiq.js'
export { PilotiqRegistry } from './PilotiqRegistry.js'
export { pilotiq } from './PilotiqServiceProvider.js'
export { Resource, type TableConfig, type FormConfig } from './Resource.js'
export { Page, type PageMeta } from './Page.js'
export { Field, type FieldType, type FieldMeta, type FieldCondition } from './fields/Field.js'
export { resolveField, resolveFields } from './fields/resolveField.js'
export {
  Action,
  type ActionPlacement,
  type ActionContext,
  type ActionHandler,
  type ActionConfirm,
  type ActionMeta,
} from './actions/Action.js'
export { TextField } from './fields/TextField.js'
export { TextareaField } from './fields/TextareaField.js'
export { EmailField } from './fields/EmailField.js'
export { NumberField } from './fields/NumberField.js'
export { SelectField } from './fields/SelectField.js'
export { ToggleField } from './fields/ToggleField.js'
export { DateField } from './fields/DateField.js'
export { SlugField } from './fields/SlugField.js'
export { Column } from './Column.js'
export { registerPilotiqRoutes } from './routes.js'

// Theme
export { resolveTheme, generateThemeCSS, iconMap, resolveIconName } from './theme/index.js'
export {
  presets, baseColors, resolveThemeColor, resolveChartColor, radiusMap,
  colors, BASE_COLOR_NAMES, HUE_NAMES, parseSeedToScale,
} from './theme/index.js'
export type {
  ThemeConfig, ThemeMeta,
  StylePreset, BaseColor, HueColor, ThemeColor, ChartColor, RadiusPreset,
  IconLibrary, ThemeFonts, PresetDefinition,
  ColorName, ColorScale, ColorStep,
} from './theme/index.js'

// Schema
export { Element, type ElementMeta } from './schema/Element.js'
export { Text } from './schema/Text.js'
export { Heading } from './schema/Heading.js'
export { Alert, type AlertType } from './schema/Alert.js'
export { Divider } from './schema/Divider.js'
export { Card } from './schema/Card.js'
export { Section } from './schema/Section.js'
export { Tabs, Tab } from './schema/Tabs.js'
export { Grid } from './schema/Grid.js'
export {
  resolveSchema,
  registerResolver,
  type SchemaDefinition,
  type SchemaContext,
  type RenderContext,
  type RenderMode,
  type ElementResolver,
} from './schema/resolveSchema.js'
