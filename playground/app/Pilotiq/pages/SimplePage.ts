import { Page, Heading, Text, Alert, Card } from '@pilotiq/pilotiq'

export class SimplePage extends Page {
  static slug  = 'simple-demo'
  static label = 'Simple'
  static icon  = 'image'

  static schema() {
    return [
      Heading.make('Simple Page').description('A custom page built with the schema system.'),
      Text.make('This is a simple page example using @pilotiq/pilotiq.'),
      Card.make('Info').description('Cards can contain nested elements.').schema([
        Text.make('This text is inside a card.'),
        Alert.make('Schema elements compose naturally.').success(),
      ]),
    ]
  }
}
