import {
  Page, Heading, Section,
  Form, TextField, NumberField, ToggleField, SelectField, SliderField, Repeater,
  Notification,
} from '@pilotiq/pilotiq'

/**
 * Plan #14 Repeater demo.
 *
 * Exercises:
 *   - Basic Repeater with `defaultItems`, `min/maxItems`
 *   - `columns(2)` for grid-laid inner schema
 *   - `reorderable()` — drag the grip handle, or use Up/Down buttons
 *   - `cloneable()` duplicate-row button
 *   - `collapsible()` + `collapsed()` per-row collapse with localStorage
 *   - `itemLabel(row => …)` collapsed-row header
 *   - `itemHidden(({ values }) => …)` v1.2 row-level visibility — hidden
 *     rows render with display:none so values still round-trip on submit
 *   - Inner-schema `Section.visible(({ values }) => …)` row-scoped visibility
 *   - Inner-field `live() + afterStateUpdated()` — quantity/unitPrice
 *     updates write a row-scoped subtotal via `ctx.row.$set` (Plan #14 v1.1)
 *   - Nested Repeater (line items → modifiers)
 */

export class RepeaterDemo extends Page {
  static slug  = 'repeater-demo'
  static label = 'Repeater demo'
  static icon  = 'list-checks'

  static override navigationGroup = 'Demos'
  static override navigationSort  = 40

  static schema() {
    return [
      Heading.make('Repeater fields')
        .description('Plan #14 — array-of-subschema fields with reorder, clone, collapse, and nesting.'),

      Form.make()
        .formId('repeater-demo')
        .withValues({
          // Seed itemHidden demo with 3 rows — middle one archived.
          contactRows: [
            { name: 'Ada Lovelace',     email: 'ada@example.com',    archived: false },
            { name: 'Charles Babbage',  email: 'cb@example.com',     archived: true  },
            { name: 'Alan Turing',      email: 'alan@example.com',   archived: false },
          ],
        })
        .schema([
          Section.make('Order line items')
            .description('Add as many line items as you like; reorder, clone, or collapse each.')
            .schema([
              Repeater.make('lineItems')
                .label('Line items')
                .columns(2)
                .defaultItems(1)
                .minItems(1)
                .maxItems(20)
                .reorderable()
                .cloneable()
                .collapsible()
                .itemLabel((row) => {
                  const product = String(row['product'] ?? '')
                  return product || 'New line item'
                })
                .addActionLabel('Add line item')
                .schema([
                  TextField.make('product').label('Product').required(),
                  NumberField.make('quantity')
                    .label('Quantity')
                    .default(1)
                    .required()
                    .live({ debounce: 300 })
                    .afterStateUpdated((value, ctx) => {
                      const qty   = Number(value ?? 0)
                      const price = Number(ctx.row?.$get('unitPrice') ?? 0)
                      ctx.row?.$set('subtotal', Number.isFinite(qty * price) ? qty * price : 0)
                    }),
                  NumberField.make('unitPrice')
                    .label('Unit price')
                    .prefix('$')
                    .required()
                    .live({ debounce: 300 })
                    .afterStateUpdated((value, ctx) => {
                      const price = Number(value ?? 0)
                      const qty   = Number(ctx.row?.$get('quantity') ?? 0)
                      ctx.row?.$set('subtotal', Number.isFinite(qty * price) ? qty * price : 0)
                    }),
                  NumberField.make('subtotal')
                    .label('Subtotal')
                    .prefix('$')
                    .helperText('Auto-computed from quantity × unit price (live).')
                    .readonly(),
                  // Plan #14 v1.2 — Switch + Slider inner-live verification.
                  // Both call `fs.triggerLive(value)` explicitly inside their
                  // renderers; toggling discount on writes a 10% discount
                  // back into a sibling field, sliding the discount-rate
                  // updates that same field. Confirms inner `live()` fires
                  // for React-controlled primitives, not just native inputs.
                  ToggleField.make('discounted')
                    .label('Apply discount')
                    .live()
                    .afterStateUpdated((value, ctx) => {
                      const on    = value === true || value === 'true'
                      const sub   = Number(ctx.row?.$get('subtotal') ?? 0)
                      const rate  = Number(ctx.row?.$get('discountRate') ?? 10)
                      ctx.row?.$set('discountAmount',
                        on ? Math.round(sub * (rate / 100) * 100) / 100 : 0,
                      )
                    }),
                  SliderField.make('discountRate')
                    .label('Discount rate (%)')
                    .min(0).max(50).step(5)
                    .default(10)
                    .showValue()
                    .live({ debounce: 200 })
                    .afterStateUpdated((value, ctx) => {
                      const on  = ctx.row?.$get('discounted') === true
                      const sub = Number(ctx.row?.$get('subtotal') ?? 0)
                      const r   = Number(value ?? 0)
                      ctx.row?.$set('discountAmount',
                        on ? Math.round(sub * (r / 100) * 100) / 100 : 0,
                      )
                    }),
                  NumberField.make('discountAmount')
                    .label('Discount')
                    .prefix('$')
                    .helperText('Live-computed from toggle + slider.')
                    .readonly(),
                ]),
            ]),

          Section.make('FAQ entries')
            .description('Demonstrates per-row conditional visibility (Plan #8 interop).')
            .schema([
              Repeater.make('faqs')
                .label('FAQ entries')
                .defaultItems(0)
                .collapsible()
                .collapsed()
                .itemLabel((row) => String(row['question'] ?? 'New FAQ'))
                .addActionLabel('Add FAQ')
                .schema([
                  TextField.make('question').label('Question').required(),
                  TextField.make('answer').label('Answer').required(),
                  SelectField.make('category')
                    .label('Category')
                    .options([
                      { value: 'general', label: 'General' },
                      { value: 'billing', label: 'Billing' },
                      { value: 'technical', label: 'Technical' },
                    ])
                    .default('general'),
                  Section.make('Internal notes')
                    .description('Internal-only — visible per row when category=technical.')
                    .schema([
                      TextField.make('internalNotes').label('Notes for support'),
                    ])
                    .visible(({ values }) => values?.['category'] === 'technical'),
                ]),
            ]),

          Section.make('Archived rows (itemHidden)')
            .description('Rows where `archived = true` are pre-populated but hidden via `itemHidden`. Three rows are seeded below; the middle one is archived and renders with display:none — its inputs (and `__id`) still mount so values round-trip on submit. Toggle archive on a visible row, then submit the form: the row disappears from view but its data is preserved (check the saved JSON in the console).')
            .schema([
              Repeater.make('contactRows')
                .label('Contacts')
                .reorderable()
                .cloneable()
                .itemLabel((row) => String(row['name'] ?? 'New contact'))
                .itemHidden(({ values }) => values?.['archived'] === true)
                .addActionLabel('Add contact')
                .schema([
                  TextField.make('name').label('Name').required(),
                  TextField.make('email').label('Email'),
                  ToggleField.make('archived')
                    .label('Archive this row')
                    .helperText('Submit the form to see it disappear from view (data preserved).'),
                ]),
            ]),

          Section.make('Nested example — products with modifiers')
            .description('A Repeater inside a Repeater. Each product can have its own list of modifiers.')
            .schema([
              Repeater.make('products')
                .label('Products')
                .defaultItems(0)
                .reorderable()
                .collapsible()
                .itemLabel((row) => String(row['name'] ?? 'New product'))
                .addActionLabel('Add product')
                .schema([
                  TextField.make('name').label('Product name').required(),
                  Repeater.make('modifiers')
                    .label('Modifiers')
                    .defaultItems(0)
                    .columns(2)
                    .addActionLabel('Add modifier')
                    .schema([
                      TextField.make('name').label('Modifier').required(),
                      NumberField.make('price').label('Price delta').prefix('$'),
                    ]),
                ]),
            ]),
        ])
        .save(async (data) => {
          // eslint-disable-next-line no-console
          console.log('[repeater-demo] saved', JSON.stringify(data, null, 2))
          return data
        })
        .savedNotification(
          Notification.make('Submitted')
            .body('Form posted — check console for the saved data.')
            .success(),
        )
        .redirectAfterSave(() => '/new-admin/repeater-demo'),
    ]
  }
}
