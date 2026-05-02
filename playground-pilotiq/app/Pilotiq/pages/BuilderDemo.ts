import {
  Page, Heading, Section,
  Form, TextField, TextareaField, NumberField, ToggleField, SelectField,
  Builder, Block,
  Notification,
} from '@pilotiq/pilotiq'

/**
 * Plan #14 follow-up — Builder field demo.
 *
 * Heterogeneous-row Repeater: each row picks one of N block types and
 * carries that block's own schema. Storage: `[{ type, data }]` per row.
 *
 * Exercises:
 *   - 5 block types (Heading, Paragraph, Image, Quote, Embed)
 *   - Block icons + per-block columns
 *   - `Block.maxItems(1)` on Heading — picker greys out after 1 added
 *   - `reorderable() / cloneable() / collapsible()` mirror Repeater
 *   - `blockNumbers()` numbered row headers
 *   - Inner-field `live() + afterStateUpdated()` row-scoped — Image
 *     block's alt updates from the URL
 *   - Pre-seeded values to verify per-row resolve
 */

export class BuilderDemo extends Page {
  static slug  = 'builder-demo'
  static label = 'Builder demo'
  static icon  = 'blocks'

  static override navigationGroup = 'Demos'
  static override navigationSort  = 50

  static schema() {
    return [
      Heading.make('Builder field')
        .description('Plan #14 — heterogeneous Repeater. Each row picks a block type, then renders that block\'s own inner schema.'),

      Form.make()
        .formId('builder-demo')
        .withValues({
          // Seed three rows of different types so the per-row resolve
          // is exercised on first paint.
          content: [
            { type: 'heading',   data: { text: 'Welcome to the page', level: 'h1' } },
            { type: 'paragraph', data: { body: 'A short intro paragraph.' } },
            { type: 'quote',     data: { quote: 'Done is better than perfect.', attribution: 'Sheryl Sandberg' } },
          ],
        })
        .schema([
          Section.make('Page content')
            .description('Click "Add block" to insert a new section. Drag to reorder.')
            .schema([
              Builder.make('content')
                .label('Content blocks')
                .reorderable()
                .cloneable()
                .collapsible()
                .blockNumbers()
                .blockPickerColumns(2)
                .minItems(1)
                .addActionLabel('Add block')
                .itemLabel((data, blockName) => {
                  if (blockName === 'heading')   return String(data['text']  ?? 'Heading')
                  if (blockName === 'paragraph') return String(data['body']  ?? 'Paragraph').slice(0, 60)
                  if (blockName === 'image')     return String(data['alt']   ?? data['url'] ?? 'Image')
                  if (blockName === 'quote')     return String(data['quote'] ?? 'Quote').slice(0, 60)
                  if (blockName === 'embed')     return String(data['url']   ?? 'Embed')
                  return blockName
                })
                .blocks([
                  Block.make('heading')
                    .label('Heading')
                    .icon('heading')
                    .columns(2)
                    .maxItems(1)              // Filament-style "exactly one Hero"
                    .schema([
                      TextField.make('text').label('Title').required(),
                      SelectField.make('level').label('Level').options([
                        { value: 'h1', label: 'H1' },
                        { value: 'h2', label: 'H2' },
                        { value: 'h3', label: 'H3' },
                      ]).default('h1'),
                    ]),

                  Block.make('paragraph')
                    .label('Paragraph')
                    .icon('paragraph')
                    .schema([
                      TextareaField.make('body').label('Body').required(),
                    ]),

                  Block.make('image')
                    .label('Image')
                    .icon('image')
                    .columns(2)
                    .schema([
                      TextField.make('url')
                        .label('Image URL')
                        .required()
                        .live({ debounce: 300 })
                        .afterStateUpdated((value, ctx) => {
                          // Demo of row-scoped live updates inside a
                          // Builder block — when the URL changes, suggest
                          // an alt text from the trailing path segment.
                          const url = String(value ?? '')
                          const seg = url.split('/').pop() ?? ''
                          const alt = seg.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim()
                          if (alt && !ctx.row?.$get('alt')) {
                            ctx.row?.$set('alt', alt)
                          }
                        }),
                      TextField.make('alt').label('Alt text'),
                      ToggleField.make('fullWidth').label('Full width'),
                    ]),

                  Block.make('quote')
                    .label('Quote')
                    .icon('quote')
                    .schema([
                      TextareaField.make('quote').label('Quote').required(),
                      TextField.make('attribution').label('Attribution'),
                    ]),

                  Block.make('embed')
                    .label('Embed')
                    .icon('link')
                    .schema([
                      TextField.make('url').label('URL').required(),
                      NumberField.make('aspectRatio').label('Aspect ratio (W:H)').helperText('e.g. 16 for 16:9'),
                    ]),
                ]),
            ]),
        ])
        .save(async (data) => {
          // eslint-disable-next-line no-console
          console.log('[builder-demo] saved', JSON.stringify(data, null, 2))
          return data
        })
        .savedNotification(
          Notification.make('Submitted')
            .body('Form posted — check console for the saved JSON.')
            .success(),
        )
        .redirectAfterSave(() => '/new-admin/builder-demo'),
    ]
  }
}
