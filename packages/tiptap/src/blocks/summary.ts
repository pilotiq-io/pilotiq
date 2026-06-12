import { TextareaField } from '@pilotiq/pilotiq'
import { Block } from '../Block.js'

/**
 * Default **Summary** block — a short, labelled summary of the article.
 *
 * Wire shape: `{ content: string }`. Renders read-side as
 * `<div class="pilotiq-summary">` with a label and the body.
 */
export const summaryBlock = Block.make('summary')
  .label('Summary')
  .icon('📝')
  .schema([
    TextareaField.make('content').label('Summary').placeholder('A short summary of the article…'),
  ])
