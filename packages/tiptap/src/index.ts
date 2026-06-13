export {
  RichTextField,
  DEFAULT_TOOLBAR_GROUPS,
  DEFAULT_TEXT_COLORS,
  DEFAULT_HIGHLIGHT_COLORS,
  type ColorSwatch,
  type RichTextAttachmentVisibility,
  type RichTextFieldMeta,
  type RichTextStorage,
  type ToolbarButtonId,
  type ToolbarGroups,
} from './RichTextField.js'
export { Block, type BlockMeta } from './Block.js'
export {
  defaultBlocks,
  faqBlock,
  alertBlock,
  summaryBlock,
  keyTakeawaysBlock,
  prosConsBlock,
} from './blocks/index.js'
export {
  MentionProvider,
  type MentionItem,
  type MentionProviderMeta,
} from './MentionProvider.js'
export { registerTiptap } from './register.js'
export {
  createPlainTextEditor,
  plainTextOf,
  plainTextToDoc,
  type PlainTextEditorOptions,
} from './PlainTextEditor.js'
export { tiptap } from './plugin.js'
export { TiptapEditor } from './react/TiptapEditor.js'
export {
  AiSuggestionExtension,
  aiSuggestionPluginKey,
  upsertSuggestion,
  upsertSuggestions,
  removeSuggestion,
  remapSuggestions,
  sortForApproveAll,
  clampPos,
  type AiSuggestion,
  type AiSuggestionExtensionOptions,
} from './extensions/AiSuggestionExtension.js'
export { useAiSuggestionBridge } from './react/useAiSuggestionBridge.js'
export {
  AiInlineDiffExtension,
  aiInlineDiffPluginKey,
  getAiInlineDiffState,
  type AiInlineDiffExtensionOptions,
} from './extensions/AiInlineDiffExtension.js'
export {
  planReplaceBlock,
  planInsertBlockBefore,
  planDeleteBlock,
  planWrapBlocks,
  planUpdateBlockMark,
  summarizeBlockStructure,
  type BlockMarkRange,
  type TransactionModifier,
} from './surgicalOps.js'
export {
  renderRichTextToHtml,
  isRichTextValue,
  type RenderRichTextOptions,
  type TiptapNode,
  type TiptapMark,
} from './render.js'
// Default content-block node specs (Intro / FAQ / Alert / Summary / Key takeaways /
// Pros & cons). `contentBlockNodes` is the exact array `TiptapEditor` registers,
// so a consumer can build a headless editor whose schema matches the live
// editor — e.g. to parse the content-block HTML or drive the surgical-op
// planners (`planInsertBlockBefore` & co.) in a test, without mounting React.
export {
  contentBlockNodes,
  Intro,
  Faq,
  FaqItem,
  FaqQuestion,
  FaqAnswer,
  Alert,
  AlertTitle,
  AlertBody,
  Summary,
  KeyTakeaways,
  ProsCons,
  ProsColumn,
  ConsColumn,
  ContentBlockKeymap,
  LabeledBlockExitKeymap,
  planExitLabeledBlock,
  isSelectionInAlert,
  ALERT_VARIANTS,
  ALERT_VARIANT_LABEL,
  coerceAlertType,
  type AlertType,
} from './extensions/contentBlocks.js'
