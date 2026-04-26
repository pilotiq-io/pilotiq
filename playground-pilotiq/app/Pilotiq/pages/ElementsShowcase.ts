import {
  Page, Heading, Text, Alert, Divider, Card,
  Section, Tabs, Tab, Grid,
  TextField, EmailField, NumberField, SelectField, TextareaField,
  ToggleField, DateField, SlugField,
  Action,
} from '@pilotiq/pilotiq'

/**
 * Showcase page exercising every primitive in the schema model.
 * Useful as a visual smoke test after each foundation sub-phase lands.
 */
export class ElementsShowcase extends Page {
  static slug  = 'elements'
  static label = 'Elements'
  static icon  = 'layout-grid'

  static schema() {
    return [
      // ─── Display elements ───────────────────────────────────────
      Heading.make('Schema Elements Showcase').description('Every primitive in @pilotiq/pilotiq, rendered.'),

      Heading.make('Headings').level(2),
      Heading.make('H1 heading').level(1),
      Heading.make('H2 heading').level(2),
      Heading.make('H3 heading').level(3).description('With a description below the title.'),

      Divider.make('Text + Alerts'),

      Text.make('A simple paragraph of text rendered via the Text element.'),

      Alert.make('Informational alert.').info().title('Info'),
      Alert.make('Something needs attention.').warning().title('Warning'),
      Alert.make('Action completed successfully.').success().title('Success'),
      Alert.make('Something went wrong.').danger().title('Danger'),

      Divider.make('Dividers'),
      Text.make('A bare divider:'),
      Divider.make(),
      Text.make('And a labeled divider:'),
      Divider.make('Section break'),

      // ─── Containers ─────────────────────────────────────────────
      Heading.make('Containers').level(2),

      Card.make('Card with nested content')
        .description('Cards group related elements with a title + description.')
        .schema([
          Text.make('Cards can contain any other elements.'),
          Alert.make('Including alerts.').info(),
        ]),

      Section.make('Single-column section').description('Default columns=1.').schema([
        TextField.make('name').required(),
        TextField.make('slug').placeholder('auto-generated'),
      ]),

      Section.make('Two-column section').description('columns=2 lays children side-by-side.').columns(2).schema([
        TextField.make('firstName').required(),
        TextField.make('lastName').required(),
        EmailField.make('email').required(),
        TextField.make('phone'),
      ]),

      Section.make('Collapsible section').description('Click "Collapse" in the header.').collapsible().schema([
        Text.make('This content can be hidden.'),
      ]),

      Tabs.make().tabs([
        Tab.make('Profile').schema([
          TextField.make('displayName').label('Display name').required(),
          TextareaField.make('bio').rows(3),
        ]),
        Tab.make('Account').icon('user').schema([
          EmailField.make('email').required(),
          ToggleField.make('twoFactor').label('Two-factor auth'),
        ]),
        Tab.make('Notifications').badge('3').schema([
          ToggleField.make('emailNotifications').label('Email'),
          ToggleField.make('pushNotifications').label('Push'),
        ]),
      ]),

      Grid.make().columns(3).schema([
        Card.make('Stat A').schema([Text.make('1,234')]),
        Card.make('Stat B').schema([Text.make('5,678')]),
        Card.make('Stat C').schema([Text.make('9,012')]),
      ]),

      // ─── Fields ─────────────────────────────────────────────────
      Divider.make('Form Fields'),
      Heading.make('Fields').level(2),

      Card.make('All field types').schema([
        Section.make('Text-like').columns(2).schema([
          TextField.make('text').label('Text').placeholder('Plain text…').required(),
          EmailField.make('email').label('Email').required(),
          NumberField.make('age').label('Number').min(0).max(120).step(1),
          DateField.make('publishedAt').label('Date'),
          SlugField.make('slug').from('title').label('Slug'),
          TextField.make('readonly').label('Read-only').readonly(),
        ]),
        Section.make('Multi-line + choice').columns(2).schema([
          TextareaField.make('bio').label('Textarea').rows(4),
          SelectField.make('status').label('Select').options([
            { value: 'draft',     label: 'Draft' },
            { value: 'published', label: 'Published' },
            { value: 'archived',  label: 'Archived' },
          ]),
          ToggleField.make('featured').label('Toggle'),
        ]),
      ]),

      // ─── Actions ────────────────────────────────────────────────
      Divider.make('Actions'),
      Heading.make('Actions').level(2),

      Card.make('Action placements').description('All four placement variants. (Handlers wire up in Phase 2.)').schema([
        Text.make('Inline (default):'),
        Action.make('save').label('Save').icon('check'),
        Text.make('Header:'),
        Action.make('export').label('Export').header(),
        Text.make('Row:'),
        Action.make('edit').label('Edit').row(),
        Text.make('Bulk:'),
        Action.make('archive').label('Archive selected').bulk(),
        Text.make('Destructive with confirmation:'),
        Action.make('delete').label('Delete').destructive().confirm({
          title: 'Delete this item?',
          message: 'This action cannot be undone.',
          confirmLabel: 'Yes, delete',
        }),
      ]),
    ]
  }
}
