import {
  Page, Heading, Section, Split,
  Form, TextField, NumberField, ToggleField, SelectField, SliderField, Repeater,
  RowButton,
  Action, Notification,
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

          Section.make('extraItemActions — per-row buttons')
            .description('Each row gets a "Send test" button alongside the built-in clone/delete strip. The handler receives the row\'s submitted values via `ctx.row.values` (along with `index`, `id`, `fieldName`). Visibility predicates see the row\'s values too, so unsaved rows can hide actions until the row is filled out.')
            .schema([
              Repeater.make('subscribers')
                .label('Subscribers')
                .reorderable()
                .cloneable()
                .itemLabel((row) => String(row['email'] ?? 'New subscriber'))
                .addActionLabel('Add subscriber')
                .extraItemActions([
                  Action.make('sendTest')
                    .label('Send test')
                    .icon('send')
                    .visible(({ values }) => Boolean(values?.['email']))
                    .handler((ctx) => {
                      const email = ctx.row?.values?.['email']
                      // eslint-disable-next-line no-console
                      console.log(`[repeater-demo] would send test to row ${ctx.row?.index}: ${email}`)
                      return {
                        notify: Notification.make(`Test queued for ${email}`).success(),
                      }
                    }),
                ])
                .schema([
                  TextField.make('email').label('Email').required(),
                  ToggleField.make('weekly').label('Weekly digest').default(true),
                ]),
            ]),

          Section.make('distinct() — cross-row uniqueness')
            .description('Inner field marked `.distinct({ caseInsensitive: true })`. Add two rows with the same SKU (any case) and submit — the second row fails validation. Empty rows are skipped by default; set `ignoreNulls: false` to require non-empty + unique.')
            .schema([
              Repeater.make('inventory')
                .label('Inventory items')
                .columns(2)
                .defaultItems(2)
                .reorderable()
                .cloneable()
                .itemLabel((row) => String(row['sku'] ?? 'New item'))
                .addActionLabel('Add item')
                .schema([
                  TextField.make('sku')
                    .label('SKU')
                    .required()
                    .distinct({ caseInsensitive: true, message: 'Each SKU must appear only once' })
                    .helperText('Case-insensitive — "ABC-1" and "abc-1" count as the same SKU.'),
                  NumberField.make('stock').label('In stock').default(0),
                ]),
            ]),

          Section.make('Simple Repeater — flat-array storage')
            .description('`Repeater.simple(TextField.make(\'value\'))` — single-input rows that store as `[v1, v2, …]` instead of `[{value: v1}, …]`. Reorder + delete + min/maxItems work as usual; clone + collapse are dropped (a single-field row has nothing to clone or collapse).')
            .schema([
              Repeater.make('keywords')
                .label('Keywords')
                .simple(
                  TextField.make('keyword')
                    .placeholder('Enter a keyword'),
                )
                .reorderable()
                .defaultItems(2)
                .addActionLabel('Add keyword'),
            ]),

          Section.make('disableOptionsWhenSelectedInSiblingRepeaterItems')
            .description('Pick a colour in row 1 — the same option greys out in every other row. Auto-enables `distinct()` (server-side guarantee) and `live()` (so picks reflect immediately in sibling rows without a submit).')
            .schema([
              Repeater.make('colourPicks')
                .label('Colour picks')
                .defaultItems(2)
                .reorderable()
                .cloneable()
                .itemLabel((row) => String(row['colour'] ?? 'New pick'))
                .addActionLabel('Add pick')
                .schema([
                  TextField.make('label').label('Label'),
                  SelectField.make('colour')
                    .label('Colour')
                    .options([
                      { value: 'red',    label: 'Red'    },
                      { value: 'green',  label: 'Green'  },
                      { value: 'blue',   label: 'Blue'   },
                      { value: 'yellow', label: 'Yellow' },
                      { value: 'purple', label: 'Purple' },
                    ])
                    .disableOptionsWhenSelectedInSiblingRepeaterItems()
                    .helperText('Each colour can only be used in one row.'),
                ]),
            ]),

          Section.make('Table mode — compact uniform-row layout')
            .description('`Repeater.table([cols…])` renders rows as a compact HTML table — each inner field becomes a `<td>`, the columns array supplies the headers (in declaration order). Reorder + clone + delete + extraActions land in a final actions cell. Inner-field labels render `sr-only` since the column header carries the labelling.')
            .schema([
              Repeater.make('teamMembers')
                .label('Team members')
                .table([
                  { label: 'Name' },
                  { label: 'Email' },
                  { label: 'Role',   alignment: 'right' },
                  { label: 'Active', alignment: 'center', width: '6rem' },
                ])
                .defaultItems(2)
                .reorderable()
                .cloneable()
                .addActionLabel('Add member')
                .schema([
                  TextField.make('name').label('Name').required(),
                  TextField.make('email').label('Email').required(),
                  SelectField.make('role').label('Role')
                    .options([
                      { value: 'admin',  label: 'Admin'  },
                      { value: 'editor', label: 'Editor' },
                      { value: 'viewer', label: 'Viewer' },
                    ])
                    .default('viewer'),
                  ToggleField.make('active').label('Active').default(true),
                ]),
            ]),

          Section.make('Grid mode — n-column row layout')
            .description('`Repeater.grid(n)` lays the *rows themselves* in an n-column grid — different from `columns(n)` which grids the inner schema *inside* a row. Useful for tile-style pickers / member cards. Reorder buttons still work; the drag-drop indicator is suppressed (it reads wrong across grid cells).')
            .schema([
              Repeater.make('memberCards')
                .label('Member cards')
                .grid(3)
                .defaultItems(3)
                .reorderable()
                .cloneable()
                .itemLabel((row) => String(row['name'] ?? 'New member'))
                .addActionLabel('Add member')
                .schema([
                  TextField.make('name').label('Name').required(),
                  TextField.make('title').label('Title'),
                ]),
            ]),

          Section.make('Responsive grid — container-query breakpoints')
            .description('`Repeater.grid({ default: 1, md: 2, xl: 3 })` keys column counts off the standard Tailwind breakpoint widths, but resolves them with **CSS container queries against the Repeater\'s parent**, not the viewport. Drop the same Repeater into a narrow Split aside and it folds back to fewer columns automatically — even on a wide screen.')
            .schema([
              Split.make()
                .from('right')
                .gap(6)
                .schema([
                  Repeater.make('teamGridFull')
                    .label('Team (full width)')
                    .grid({ default: 1, md: 2, xl: 3 })
                    .defaultItems(4)
                    .schema([
                      TextField.make('name').label('Name').required(),
                      TextField.make('title').label('Title'),
                    ]),
                  Section.make('Same Repeater, narrow column')
                    .aside()
                    .description('Identical .grid({ default: 1, md: 2, xl: 3 }) — the aside is too narrow to hit md, so this one stays single-column.')
                    .schema([
                      Repeater.make('teamGridAside')
                        .label('Team (aside)')
                        .grid({ default: 1, md: 2, xl: 3 })
                        .defaultItems(3)
                        .schema([
                          TextField.make('name').label('Name').required(),
                          TextField.make('title').label('Title'),
                        ]),
                    ]),
                ]),
            ]),

          Section.make('Accordion mode — one row open at a time')
            .description('`Repeater.accordion()` — picking a row collapses every other row. Auto-arms `collapsible()`. Pair with `collapsed()` to start with everything collapsed (default opens the first row). Open-row id persists to localStorage.')
            .schema([
              Repeater.make('faqAccordion')
                .label('FAQ entries')
                .defaultItems(3)
                .reorderable()
                .accordion()
                .itemLabel((row) => String(row['question'] ?? 'New question'))
                .addActionLabel('Add question')
                .schema([
                  TextField.make('question').label('Question').required(),
                  TextField.make('answer').label('Answer'),
                ]),
            ]),

          Section.make('Custom row chrome — `RowButton` overrides')
            .description('`addAction / cloneAction / deleteAction / moveUpAction / moveDownAction / reorderAction / collapseAction` swap the icon, label, color, and tooltip on the seven built-in row buttons. Defaults preserved when not set.')
            .schema([
              Repeater.make('annotations')
                .label('Annotations')
                .defaultItems(2)
                .reorderable()
                .cloneable()
                .collapsible()
                .itemLabel((row) => String(row['note'] ?? 'New annotation'))
                .addAction(RowButton.make().label('Add annotation').icon('sticker'))
                .deleteAction(RowButton.make().tooltip('Discard this note').color('destructive'))
                .cloneAction(RowButton.make().tooltip('Copy to a new row'))
                .moveUpAction(RowButton.make().tooltip('Move earlier'))
                .moveDownAction(RowButton.make().tooltip('Move later'))
                .reorderAction(RowButton.make().tooltip('Hold and drag'))
                .collapseAction(RowButton.make().tooltip('Toggle body'))
                .schema([
                  TextField.make('note').label('Note').required(),
                  SelectField.make('severity')
                    .label('Severity')
                    .options([
                      { value: 'low',    label: 'Low'    },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high',   label: 'High'   },
                    ])
                    .default('low'),
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
