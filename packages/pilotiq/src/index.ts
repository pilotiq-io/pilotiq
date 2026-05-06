// ─── Panel core ───────────────────────────────────────
export {
  Pilotiq,
  type PilotiqConfig,
  type PilotiqPlugin,
  type UserResolver,
  type UploadConfig,
  type SignOutConfig,
} from './Pilotiq.js'
export {
  UserMenuItem,
  type UserMenuItemMeta,
  type UserMenuItemColor,
  type UserMenuItemValue,
} from './UserMenuItem.js'
export {
  resolveRenderHooks,
  CHROME_HOOK_NAMES,
  PAGE_HOOK_NAMES,
  type RenderHookName,
  type RenderHookContext,
  type RenderHookFn,
  type RenderHookScope,
  type RenderHookEntry,
  type RenderHookMap,
} from './RenderHook.js'
export { PilotiqRegistry } from './PilotiqRegistry.js'
export { pilotiq } from './PilotiqServiceProvider.js'
export { registerPilotiqRoutes } from './routes.js'
export {
  searchAllResources,
  type GlobalSearchResult,
  type GlobalSearchOptions,
} from './search.js'

// Per-page-role data builders (consumed by Vike +data hooks for SPA nav).
export type { NavItem, UserMenuMeta, PanelInfoRoute } from './pageData.js'
export {
  applyPageHooks,
  pageHooksFor,
  type PageRole,
} from './applyPageHooks.js'
export {
  dispatchPageData,
  panelInfo,
  resolvePageHooks,
  applyRoleHooks,
  dashboardData,
  resourceIndexData,
  resourceCreateData,
  resourceEditData,
  resourceViewData,
  globalEditData,
  globalViewData,
  customPageData,
  resolveServerDataElements,
  tagWidgetUrls,
  widgetData,
  type ServerDataMap,
  type WidgetScope,
  type WidgetRequest,
  type WidgetSuccess,
  type WidgetFailure,
  type PageContextLike,
} from './pageData.js'
export { Resource, type ResourcePages, type ResourceClass } from './Resource.js'
export {
  RelationManager,
  RESERVED_RELATIONSHIP_TOKENS,
  safeManagerPolicy,
  isManagerCanOverridden,
  type RelationManagerContext,
  type ManagerCanMethod,
} from './RelationManager.js'
export { Global, type GlobalPages, type GlobalClass } from './Global.js'
export { Cluster, type ClusterClass } from './Cluster.js'
export { Page, type PageMeta, type PageMode } from './Page.js'
export {
  // Page base classes — extend these to bind a Page to a Resource.
  ListPage, CreatePage, EditPage, ViewPage,
  // Factory functions — return anonymous subclasses bound to a Resource.
  defaultPages,
  defaultListPage, defaultCreatePage, defaultEditPage, defaultViewPage,
  // Helpers exposed for advanced override of the default schema wiring.
  applyFormDefaults, applyTableDefaults,
} from './defaultPages.js'
export {
  defaultGlobalPages,
  defaultGlobalEditPage,
  defaultGlobalViewPage,
} from './defaultGlobalPages.js'
export {
  Column,
  type ColumnMeta,
  type ColumnAlignment,
  type ColumnType,
  type ColumnWeight,
  type ColumnColor,
  type ColumnFormat,
  type FormatStateHandler,
  type ColumnDisabledFn,
  type ColumnSelectOption,
} from './Column.js'

export {
  TextColumn,
  BadgeColumn,
  type BadgeColor,
  IconColumn,
  type IconOption,
  BooleanColumn,
  ImageColumn,
  TextInputColumn,
  type TextInputColumnType,
  ToggleColumn,
  SelectColumn,
  type SelectColumnOptionsInput,
} from './columns/index.js'

// ─── Column summarizers (footer aggregates) ───────────
export {
  Summarizer,
  Sum,
  Average,
  Count,
  Range,
  type SummarizerKind,
  type SummarizerMeta,
  type SummaryResult,
  type SummaryFormatter,
} from './summarizers/index.js'

// ─── ORM model wiring ─────────────────────────────────
export {
  modelSave, modelLoadRecord, modelTableRecords, findRecord, getPrimaryKey,
  defaultRelatedQuery, resolveRelatedQuery, modelRelationTableRecords,
  type ModelLike, type ModelQuery, type ModelWhereOperator,
  type QueryContext, type ResourceLike,
} from './orm/modelDefaults.js'

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
export { Text, type TextColor, type TextSize, type TextWeight } from './schema/Text.js'
export { Heading } from './schema/Heading.js'
export { Alert, type AlertType } from './schema/Alert.js'
export { EmptyState } from './schema/EmptyState.js'
export { Divider } from './schema/Divider.js'
export { UnorderedList } from './schema/UnorderedList.js'
export { Image, type ImageShape } from './schema/Image.js'
export { Icon, type IconColor } from './schema/Icon.js'
export { Markdown, type MarkdownProseSize } from './schema/Markdown.js'
export { Html } from './schema/Html.js'

// Plan #16 — read-only entry primitives for `Resource.detail()`.
export {
  Entry,
  isEntry,
  type EntryMeta,
  type EntryFormat,
  type EntryFormatStateHandler,
  type EntryWeight,
  type EntryColor,
  type EntrySize,
} from './entries/Entry.js'
export { TextEntry } from './entries/TextEntry.js'
export { BadgeEntry } from './entries/BadgeEntry.js'
export { IconEntry, type IconEntryOption } from './entries/IconEntry.js'
export { ImageEntry, type ImageEntryShape } from './entries/ImageEntry.js'
export { KeyValueEntry } from './entries/KeyValueEntry.js'
export { ColorEntry, type ColorEntryShape } from './entries/ColorEntry.js'
export { CodeEntry } from './entries/CodeEntry.js'
export { ComponentEntry } from './entries/ComponentEntry.js'
export {
  RepeatableEntry,
  type RepeatableEntryMeta,
  type RepeatableEntryRowMeta,
  type RepeatableEntryTableColumn,
} from './entries/RepeatableEntry.js'

// Plan #15 — server-data widget elements
export {
  ServerDataElement,
  isServerDataElement,
  stampServerDataMeta,
} from './schema/ServerDataElement.js'
export { View, type ViewDataHandler } from './schema/View.js'
export {
  Stat,
  type StatMeta,
  type StatColor,
  type StatDescriptionIcon,
  type StatDescriptionIconPosition,
} from './schema/Stat.js'
export {
  StatsOverview,
  type StatsHandler,
  type StatsOverviewPayload,
} from './schema/StatsOverview.js'
export {
  TableWidget,
  type TableWidgetRecordsHandler,
  type TableWidgetRecordsResult,
  type TableWidgetQueryHandler,
  type TableWidgetPayload,
} from './schema/TableWidget.js'

// Container elements
export { Card } from './schema/Card.js'
export { Section } from './schema/Section.js'
export { Tabs, Tab } from './schema/Tabs.js'
export { Grid } from './schema/Grid.js'
export { Group } from './schema/Group.js'
export { Fieldset } from './schema/Fieldset.js'
export { Split, type SplitFrom } from './schema/Split.js'
export { Wizard, Step } from './schema/Wizard.js'

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
  type ContentLayout,
  type CardSchemaHandler,
  type CardsPerRow,
} from './elements/Table.js'
export {
  TableGroup,
  type TableGroupMeta,
  type TableGroupTitleHandler,
  type TableGroupDescriptionHandler,
  type TableGroupKeyComparator,
  orderByKeys,
} from './elements/TableGroup.js'
export {
  loadTableRecords,
  parseTableQuery,
  parseActiveGroup,
  parseFilterValues,
  findTables,
  type QueryParams,
} from './elements/dispatchTable.js'

// List-page tabs (Filament-style query-shortcut strips above the table)
export {
  ListTab,
  type ListTabMeta,
  type TabBadgeColor,
  type TabBadgeHandler,
  type TabQueryHandler,
  type TabContextHandler,
} from './Tab.js'
export { ListTabs } from './elements/ListTabs.js'

// ─── Filters ──────────────────────────────────────────
export {
  Filter,
  type FilterKind,
  type FilterMeta,
  type FilterQueryHandler,
  type FilterIndicatorHandler,
} from './filters/Filter.js'
export { SelectFilter, type SelectFilterOption } from './filters/SelectFilter.js'
export {
  MultiSelectFilter,
  type MultiSelectFilterOption,
  parseMultiSelectValue,
  encodeMultiSelectValue,
} from './filters/MultiSelectFilter.js'
export { BooleanFilter, coerceBooleanFilterValue } from './filters/BooleanFilter.js'
export { TrashedFilter } from './filters/TrashedFilter.js'
export { TernaryFilter } from './filters/TernaryFilter.js'
export {
  DateRangeFilter,
  parseDateRangeValue,
  encodeDateRangeValue,
  type DateRangeValue,
} from './filters/DateRangeFilter.js'
export {
  FormFilter,
  parseFormFilterValue,
  encodeFormFilterValue,
  type FormFilterValue,
  type FormFilterQueryHandler,
  type FormFilterIndicatorHandler,
} from './filters/FormFilter.js'
export {
  QueryBuilderFilter,
  parseQueryBuilderValue,
  encodeQueryBuilderValue,
  emptyQueryBuilderTree,
  applyTreeToQuery,
  type QueryBuilderTree,
  type QueryBuilderRule,
  type QueryBuilderQueryHandler,
  type QueryBuilderIndicatorHandler,
} from './filters/QueryBuilderFilter.js'
export {
  Constraint,
  TextConstraint,
  NumberConstraint,
  DateConstraint,
  SelectConstraint,
  BooleanConstraint,
  type ConstraintMeta,
  type ConstraintOperator,
  type ConstraintOperatorName,
  type ConstraintValueKind,
} from './filters/queryBuilder/index.js'
export {
  dispatchFormSubmit,
  findForms,
  selectForm,
  selectFormById,
  type DispatchResult,
  type DispatchSuccess,
  type DispatchFailure,
} from './elements/dispatchForm.js'
export {
  dispatchAction,
  findActions,
  parseActionBody,
  type ActionRequestInput,
  type DispatchActionInput,
  type DispatchActionResult,
  type DispatchActionSuccess,
  type DispatchActionFailure,
  type ResolveRecord,
} from './elements/dispatchAction.js'

// ─── Fields ───────────────────────────────────────────
export {
  Field,
  type FieldType,
  type FieldMeta,
  type FieldCondition,
  type ConditionContext,
  type LiveOptions,
  type AfterStateUpdatedHandler,
  type AfterStateUpdatedContext,
  type FieldDecoration,
  type FormatStateUsingHandler,
  type DistinctOptions,
} from './fields/Field.js'
export { resolveField, resolveFields } from './fields/resolveField.js'
export { TextField } from './fields/TextField.js'
export { TextareaField } from './fields/TextareaField.js'
export { EmailField } from './fields/EmailField.js'
export { NumberField } from './fields/NumberField.js'
export { SelectField } from './fields/SelectField.js'
export { ToggleField } from './fields/ToggleField.js'
export { DateField } from './fields/DateField.js'
export { SlugField } from './fields/SlugField.js'
export { HiddenField, Hidden }     from './fields/HiddenField.js'
export { CheckboxField, Checkbox } from './fields/CheckboxField.js'
export { RadioField, Radio }       from './fields/RadioField.js'
export { ToggleButtonsField, ToggleButtons } from './fields/ToggleButtonsField.js'
export { CheckboxListField, CheckboxList } from './fields/CheckboxListField.js'
export { SliderField, Slider }             from './fields/SliderField.js'
export { ColorPickerField, ColorPicker }   from './fields/ColorPickerField.js'
export { DateTimePickerField, DateTimePicker } from './fields/DateField.js'
export { KeyValueField, KeyValue }         from './fields/KeyValueField.js'
export { TagsInputField, TagsInput, type TagsSuggestionsResolver } from './fields/TagsInputField.js'
export { FileUploadField, FileUpload }     from './fields/FileUploadField.js'
export {
  MarkdownField,
  DEFAULT_MARKDOWN_TOOLBAR,
  type MarkdownToolbarButton,
  type MarkdownAttachmentVisibility,
} from './fields/MarkdownField.js'
export {
  RepeaterField,
  Repeater,
  isRepeaterField,
  type RepeaterFieldMeta,
  type RepeaterRowMeta,
  type RepeaterItemLabel,
  type RepeaterTableColumn,
  type RepeaterItemHiddenRule,
} from './fields/RepeaterField.js'
export {
  RowButton,
  type RowButtonMeta,
  type RowButtonsMeta,
  type RowButtonKind,
  type RowButtonColor,
} from './fields/RowButton.js'
export {
  BuilderField,
  Builder,
  isBuilderField,
  type BuilderFieldMeta,
  type BuilderRowMeta,
  type BuilderItemLabel,
  type BuilderItemHiddenRule,
  type BuilderAddActionAlignment,
} from './fields/BuilderField.js'
export { Block, type BlockMeta } from './schema/Block.js'

// ─── Uploads ──────────────────────────────────────────
// `localUpload` (and any future Node-only adapters) live under the
// `@pilotiq/pilotiq/uploads` subpath so client bundles don't drag in
// `node:fs/promises` / `node:crypto` via the Vite plugin's manifest
// crawl. Types are safe to re-export from the root since TS strips
// them at build time.
export type {
  UploadAdapter,
  UploadRequest,
  UploadResult,
} from './uploads/index.js'
export {
  type SelectOption,
  type OptionsResolver,
  resolveOptions,
} from './fields/optionsResolver.js'

// ─── Actions ──────────────────────────────────────────
export {
  Action,
  type ActionPlacement,
  type ActionContext,
  type ActionHandler,
  type ActionResult,
  type ActionConfirm,
  type ActionMethod,
  type ActionMeta,
  type ActionColor,
  type ActionSize,
  type ActionModalWidth,
  type ActionModalMeta,
  type ActionVisibilityContext,
  type VisibilityRule,
} from './actions/Action.js'

export {
  ActionGroup,
  type ActionGroupMeta,
} from './actions/ActionGroup.js'

// ─── Notifications ────────────────────────────────────
export {
  Notification,
  type NotificationType,
  type NotificationMeta,
} from './notifications/Notification.js'

// ─── Validation ───────────────────────────────────────
export {
  makeValidator,
  required, email, minLength, maxLength, min, max, pattern,
  unique,
  validateSchema, isValid,
  type Validator, type ValidatorFn, type ValidatorContext,
  type SerializedRule, type ValidationErrors,
  type UniqueOptions,
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
