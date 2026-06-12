import { SelectField, TextareaField } from '@pilotiq/pilotiq'
import { Block } from '../Block.js'

/**
 * Default **Alert** (callout) block — a typed notice.
 *
 * Wire shape: `{ type: 'info' | 'warning' | 'success' | 'tip'; content: string }`.
 * Renders read-side as `<div class="pilotiq-alert pilotiq-alert-<type>">`. An
 * empty / unknown `type` falls back to `info` at render time.
 */
export const alertBlock = Block.make('alert')
  .label('Alert')
  .icon('⚠️')
  .schema([
    SelectField.make('type')
      .label('Type')
      .options([
        { value: 'info', label: 'Info' },
        { value: 'warning', label: 'Warning' },
        { value: 'success', label: 'Success' },
        { value: 'tip', label: 'Tip' },
      ]),
    TextareaField.make('content').label('Content').placeholder('Alert message…'),
  ])
