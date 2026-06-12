import { Repeater, TextField, TextareaField } from '@pilotiq/pilotiq'
import { Block } from '../Block.js'

/**
 * Default **FAQ** block — a list of question / answer pairs.
 *
 * Wire shape: `{ items: Array<{ question: string; answer: string }> }`.
 * Renders read-side as a `<div class="pilotiq-faq">` of `<details>` items.
 */
export const faqBlock = Block.make('faq')
  .label('FAQ')
  .icon('❓')
  .schema([
    Repeater.make('items')
      .label('Questions')
      .schema([
        TextField.make('question').label('Question').placeholder('What is …?'),
        TextareaField.make('answer').label('Answer').placeholder('A short, direct answer.'),
      ])
      .reorderable()
      .addActionLabel('Add question'),
  ])
