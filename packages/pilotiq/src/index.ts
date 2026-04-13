export { Pilotiq, type PilotiqConfig, type PilotiqPlugin } from './Pilotiq.js'
export { PilotiqRegistry } from './PilotiqRegistry.js'
export { pilotiq } from './PilotiqServiceProvider.js'
export { Resource, type TableConfig, type FormConfig } from './Resource.js'
export { Page, type PageMeta } from './Page.js'
export { Field, type FieldType } from './fields/Field.js'
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
export { presets, baseColors, accentColors, chartPalettes, radiusMap } from './theme/index.js'
export type {
  ThemeConfig, ThemeMeta,
  StylePreset, BaseColor, AccentColor, RadiusPreset, ChartPalette,
  IconLibrary, ThemeFonts, PresetDefinition,
} from './theme/index.js'

// Schema
export type { SchemaElement, SchemaElementMeta } from './schema/SchemaElement.js'
export { Text } from './schema/Text.js'
export { Heading } from './schema/Heading.js'
export { Alert, type AlertType } from './schema/Alert.js'
export { Divider } from './schema/Divider.js'
export { Card } from './schema/Card.js'
export { resolveSchema, type SchemaDefinition, type SchemaContext } from './schema/resolveSchema.js'
