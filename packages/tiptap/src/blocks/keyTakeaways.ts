import { TagsInput } from '@pilotiq/pilotiq'
import { Block } from '../Block.js'

/**
 * Default **Key takeaways** block — a short bulleted list of the article's
 * main points.
 *
 * Wire shape: `{ points: string[] }`. Renders read-side as
 * `<div class="pilotiq-key-takeaways">` with a label and a `<ul>`.
 */
export const keyTakeawaysBlock = Block.make('key-takeaways')
  .label('Key takeaways')
  .icon('🔑')
  .schema([
    TagsInput.make('points').label('Key takeaways'),
  ])
