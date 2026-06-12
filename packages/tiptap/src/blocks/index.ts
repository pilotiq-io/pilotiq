import type { Block } from '../Block.js'

/**
 * Schema-form block factories — `Block.make().schema([...])` style, edited via
 * the right-docked side panel. Kept for **custom / legacy** use via
 * `RichTextField.blocks([...])`. They are NO LONGER defaults.
 *
 * The built-in content blocks — FAQ, Alert, Summary, Key takeaways, Pros & cons
 * — are now **inline editable nodes** (`extensions/contentBlocks.ts`):
 * labelled, edited in place, registered directly in the editor + slash menu.
 */
export { faqBlock } from './faq.js'
export { alertBlock } from './alert.js'
export { summaryBlock } from './summary.js'
export { keyTakeawaysBlock } from './keyTakeaways.js'
export { prosConsBlock } from './prosCons.js'

/**
 * Schema blocks shipped by default in every `RichTextField`. Empty — the
 * default content blocks are inline nodes now, not schema-form blocks. A
 * field's own `.blocks([...])` still merge in via `RichTextField`.
 */
export const defaultBlocks: readonly Block[] = []
