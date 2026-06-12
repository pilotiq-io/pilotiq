import { TagsInput } from '@pilotiq/pilotiq'
import { Block } from '../Block.js'

/**
 * Default **Pros & cons** block — two lists, side by side.
 *
 * Wire shape: `{ pros: string[]; cons: string[] }`. Renders read-side as
 * `<div class="pilotiq-pros-cons">` with a `pros` and a `cons` column.
 */
export const prosConsBlock = Block.make('pros-cons')
  .label('Pros & cons')
  .icon('⚖️')
  .schema([
    TagsInput.make('pros').label('Pros'),
    TagsInput.make('cons').label('Cons'),
  ])
