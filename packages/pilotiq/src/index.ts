// ─── Panel core ───────────────────────────────────────
export { Pilotiq, type PilotiqConfig, type PilotiqPlugin } from './Pilotiq.js'
export { PilotiqRegistry } from './PilotiqRegistry.js'
export { pilotiq } from './PilotiqServiceProvider.js'
export { registerPilotiqRoutes } from './routes.js'
export { Resource, type ResourcePages, type ResourceClass, type RelationDef } from './Resource.js'
export { Global, type GlobalPages, type GlobalClass } from './Global.js'
export { Page, type PageMeta, type PageMode } from './Page.js'
export {
  defaultPages,
  defaultListPage,
  defaultCreatePage,
  defaultEditPage,
  defaultViewPage,
} from './defaultPages.js'
export {
  defaultGlobalPages,
  defaultGlobalEditPage,
  defaultGlobalViewPage,
} from './defaultGlobalPages.js'
export { Column, type ColumnMeta } from './Column.js'

// ─── Schema (Element tree + resolver) ─────────────────
export { Element, type ElementMeta } from './schema/Element.js'
export {
  resolveSchema,
  registerResolver,
  type SchemaDefinition,
  type SchemaContext,
  type RenderContext,
  type RenderMode,
  type ElementResolver,
} from './schema/resolveSchema.js'

// Display elements
export { Text } from './schema/Text.js'
export { Heading } from './schema/Heading.js'
export { Alert, type AlertType } from './schema/Alert.js'
export { Divider } from './schema/Divider.js'

// Container elements
export { Card } from './schema/Card.js'
export { Section } from './schema/Section.js'
export { Tabs, Tab } from './schema/Tabs.js'
export { Grid } from './schema/Grid.js'

// Form / Table containers (own their own lifecycle)
export {
  Form,
  type FormMethod,
  type FormMeta,
  type FormContext,
  type SaveHandler,
  type MutateDataHandler,
  type LifecycleHandler,
  type AfterSaveHandler,
  type RedirectHandler,
  type LoadRecordHandler,
  type FillFromRecordHandler,
} from './elements/Form.js'
export {
  Table,
  type TableMeta,
  type TableContext,
  type TableQueryHandler,
  type TableRecordsHandler,
  type TableRecordsResult,
  type SortDirection,
} from './elements/Table.js'
export {
  loadTableRecords,
  parseTableQuery,
  findTables,
  type QueryParams,
} from './elements/dispatchTable.js'
export {
  dispatchFormSubmit,
  findForms,
  selectForm,
  type DispatchResult,
  type DispatchSuccess,
  type DispatchFailure,
} from './elements/dispatchForm.js'

// ─── Fields ───────────────────────────────────────────
export { Field, type FieldType, type FieldMeta, type FieldCondition } from './fields/Field.js'
export { resolveField, resolveFields } from './fields/resolveField.js'
export { TextField } from './fields/TextField.js'
export { TextareaField } from './fields/TextareaField.js'
export { EmailField } from './fields/EmailField.js'
export { NumberField } from './fields/NumberField.js'
export { SelectField } from './fields/SelectField.js'
export { ToggleField } from './fields/ToggleField.js'
export { DateField } from './fields/DateField.js'
export { SlugField } from './fields/SlugField.js'

// ─── Actions ──────────────────────────────────────────
export {
  Action,
  type ActionPlacement,
  type ActionContext,
  type ActionHandler,
  type ActionConfirm,
  type ActionMethod,
  type ActionMeta,
} from './actions/Action.js'

// ─── Validation ───────────────────────────────────────
export {
  makeValidator,
  required, email, minLength, maxLength, min, max, pattern,
  validateSchema, isValid,
  type Validator, type ValidatorFn, type ValidatorContext,
  type SerializedRule, type ValidationErrors,
} from './validation/index.js'

// ─── Theme ────────────────────────────────────────────
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
