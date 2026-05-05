import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readBlockFieldValue, coerceBlockValues, clampPanelWidth } from './BlockSidePanel.js'
import { BlockNodeExtension } from '../extensions/BlockNodeExtension.js'

describe('readBlockFieldValue', () => {
  it('passes strings through for text fields', () => {
    const target = { type: 'text', value: 'hello world' }
    const result = readBlockFieldValue(target, { fieldType: 'text' })
    assert.equal(result, 'hello world')
  })

  it('passes strings through for textarea fields', () => {
    const target = { type: 'textarea', value: 'multi\nline' }
    const result = readBlockFieldValue(target, { fieldType: 'textarea' })
    assert.equal(result, 'multi\nline')
  })

  it('treats toggle as a boolean from `checked`', () => {
    assert.equal(readBlockFieldValue({ value: 'on', checked: true }, { fieldType: 'toggle' }), true)
    assert.equal(readBlockFieldValue({ value: 'off', checked: false }, { fieldType: 'toggle' }), false)
  })

  it('treats checkbox as a boolean from `checked`', () => {
    assert.equal(readBlockFieldValue({ value: 'on', checked: true }, { fieldType: 'checkbox' }), true)
    assert.equal(readBlockFieldValue({ value: 'off', checked: false }, { fieldType: 'checkbox' }), false)
  })

  it('coerces number fields to a Number, null when empty', () => {
    assert.equal(readBlockFieldValue({ value: '42', type: 'number' }, { fieldType: 'number' }), 42)
    assert.equal(readBlockFieldValue({ value: '3.14', type: 'number' }, { fieldType: 'number' }), 3.14)
    assert.equal(readBlockFieldValue({ value: '', type: 'number' }, { fieldType: 'number' }), null)
  })

  it('keeps slider values as Number too', () => {
    assert.equal(readBlockFieldValue({ value: '7' }, { fieldType: 'slider' }), 7)
  })

  it('falls back to raw string when number parse fails (NaN guard)', () => {
    // Browsers normally clamp invalid numeric input to '', but defensively
    // we must not silently emit NaN — round-trips into `JSON.stringify`
    // become `null`, and the next reload would lose the value.
    assert.equal(readBlockFieldValue({ value: 'abc' }, { fieldType: 'number' }), 'abc')
  })

  it('treats unknown fieldTypes as plain string', () => {
    assert.equal(readBlockFieldValue({ value: 'whatever' }, { fieldType: 'futuristic' }), 'whatever')
    assert.equal(readBlockFieldValue({ value: 'no type' }, {}), 'no type')
  })
})

describe('coerceBlockValues — flat fields', () => {
  it('passes plain strings through for text / textarea / select', () => {
    const result = coerceBlockValues(
      { title: 'hello', body: 'multi\nline', size: 'lg' },
      [
        { name: 'title', fieldType: 'text' },
        { name: 'body',  fieldType: 'textarea' },
        { name: 'size',  fieldType: 'select' },
      ],
    )
    assert.deepEqual(result, { title: 'hello', body: 'multi\nline', size: 'lg' })
  })

  it('coerces toggle / checkbox `true` / `false` strings to booleans', () => {
    const result = coerceBlockValues(
      { active: 'true', subscribe: 'false' },
      [
        { name: 'active',    fieldType: 'toggle' },
        { name: 'subscribe', fieldType: 'checkbox' },
      ],
    )
    assert.equal(result['active'], true)
    assert.equal(result['subscribe'], false)
  })

  it('coerces number / slider, null on empty, raw string on NaN', () => {
    const result = coerceBlockValues(
      { count: '42', dial: '7', empty: '', bad: 'abc' },
      [
        { name: 'count', fieldType: 'number' },
        { name: 'dial',  fieldType: 'slider' },
        { name: 'empty', fieldType: 'number' },
        { name: 'bad',   fieldType: 'number' },
      ],
    )
    assert.equal(result['count'], 42)
    assert.equal(result['dial'], 7)
    assert.equal(result['empty'], null)
    assert.equal(result['bad'], 'abc')
  })
})

describe('coerceBlockValues — deferred V1 field types', () => {
  it('parses tagsInput JSON-encoded hidden input back to string[]', () => {
    const result = coerceBlockValues(
      { tags: '["alpha","beta"]', empty: '' },
      [
        { name: 'tags',  fieldType: 'tagsInput' },
        { name: 'empty', fieldType: 'tagsInput' },
      ],
    )
    assert.deepEqual(result['tags'], ['alpha', 'beta'])
    assert.deepEqual(result['empty'], [])
  })

  it('returns [] for tagsInput when JSON parse fails (defensive)', () => {
    const result = coerceBlockValues(
      { tags: 'not json' },
      [{ name: 'tags', fieldType: 'tagsInput' }],
    )
    assert.deepEqual(result['tags'], [])
  })

  it('parses keyValue JSON-encoded hidden input back to object', () => {
    const result = coerceBlockValues(
      { meta: '{"author":"sue","year":2026}' },
      [{ name: 'meta', fieldType: 'keyValue' }],
    )
    assert.deepEqual(result['meta'], { author: 'sue', year: 2026 })
  })

  it('returns {} for keyValue when JSON parse fails or value is array', () => {
    const r1 = coerceBlockValues({ m: 'bad' }, [{ name: 'm', fieldType: 'keyValue' }])
    assert.deepEqual(r1['m'], {})
    const r2 = coerceBlockValues({ m: '["a","b"]' }, [{ name: 'm', fieldType: 'keyValue' }])
    assert.deepEqual(r2['m'], {})
  })

  it('passes single-file fileUpload URL through as a string', () => {
    const result = coerceBlockValues(
      { hero: '/uploads/cover.png' },
      [{ name: 'hero', fieldType: 'fileUpload' }],
    )
    assert.equal(result['hero'], '/uploads/cover.png')
  })

  it('parses multi-file fileUpload JSON-encoded array', () => {
    const result = coerceBlockValues(
      { gallery: '["/a.png","/b.png"]' },
      [{ name: 'gallery', fieldType: 'fileUpload', multiple: true }],
    )
    assert.deepEqual(result['gallery'], ['/a.png', '/b.png'])
  })

  it('passes markdown textarea through as a plain string', () => {
    const result = coerceBlockValues(
      { body: '# Heading\n\nSome **bold** text.' },
      [{ name: 'body', fieldType: 'markdown' }],
    )
    assert.equal(result['body'], '# Heading\n\nSome **bold** text.')
  })

  it('parses checkboxList JSON-encoded hidden input back to string[]', () => {
    const result = coerceBlockValues(
      { roles: '["admin","editor"]' },
      [{ name: 'roles', fieldType: 'checkboxList' }],
    )
    assert.deepEqual(result['roles'], ['admin', 'editor'])
  })
})

describe('coerceBlockValues — Repeater rows', () => {
  it('coerces each row against the field template recursively', () => {
    const result = coerceBlockValues(
      {
        items: [
          { title: 'first',  qty: '3', enabled: 'true',  tags: '["x","y"]' },
          { title: 'second', qty: '',  enabled: 'false', tags: '[]'         },
        ],
      },
      [
        {
          name:     'items',
          fieldType:'repeater',
          template: [
            { name: 'title',   fieldType: 'text'      },
            { name: 'qty',     fieldType: 'number'    },
            { name: 'enabled', fieldType: 'toggle'    },
            { name: 'tags',    fieldType: 'tagsInput' },
          ],
        },
      ],
    )
    assert.deepEqual(result['items'], [
      { title: 'first',  qty: 3,    enabled: true,  tags: ['x', 'y'] },
      { title: 'second', qty: null, enabled: false, tags: []         },
    ])
  })

  it('returns [] for a repeater whose value is missing or non-array', () => {
    const result = coerceBlockValues(
      { items: undefined as unknown },
      [{ name: 'items', fieldType: 'repeater', template: [] }],
    )
    assert.deepEqual(result['items'], [])
  })

  it('handles a Repeater nested inside another Repeater', () => {
    const result = coerceBlockValues(
      {
        sections: [
          {
            heading: 'A',
            rows: [
              { label: 'r1', n: '1' },
              { label: 'r2', n: '2' },
            ],
          },
        ],
      },
      [
        {
          name:      'sections',
          fieldType: 'repeater',
          template:  [
            { name: 'heading', fieldType: 'text' },
            {
              name:      'rows',
              fieldType: 'repeater',
              template:  [
                { name: 'label', fieldType: 'text' },
                { name: 'n',     fieldType: 'number' },
              ],
            },
          ],
        },
      ],
    )
    assert.deepEqual(result['sections'], [
      {
        heading: 'A',
        rows:    [
          { label: 'r1', n: 1 },
          { label: 'r2', n: 2 },
        ],
      },
    ])
  })
})

describe('coerceBlockValues — Builder rows', () => {
  it('coerces each row.data against the matching block template', () => {
    const result = coerceBlockValues(
      {
        content: [
          { type: 'paragraph', data: { text: 'hello',   live: 'true'  } },
          { type: 'image',     data: { src: '/a.png',   width: '320' } },
        ],
      },
      [
        {
          name:      'content',
          fieldType: 'builder',
          blocks:    [
            {
              name:     'paragraph',
              template: [
                { name: 'text', fieldType: 'textarea' },
                { name: 'live', fieldType: 'toggle'   },
              ],
            },
            {
              name:     'image',
              template: [
                { name: 'src',   fieldType: 'text'   },
                { name: 'width', fieldType: 'number' },
              ],
            },
          ],
        },
      ],
    )
    assert.deepEqual(result['content'], [
      { type: 'paragraph', data: { text: 'hello',  live: true   } },
      { type: 'image',     data: { src: '/a.png',  width: 320   } },
    ])
  })

  it('passes unknown Builder block types through verbatim (no schema match)', () => {
    const result = coerceBlockValues(
      {
        content: [
          { type: 'unknown', data: { foo: 'bar' } },
        ],
      },
      [{
        name:      'content',
        fieldType: 'builder',
        blocks:    [{ name: 'paragraph', template: [] }],
      }],
    )
    // Unknown type: data is preserved as-is, no coercion attempted.
    assert.deepEqual(result['content'], [
      { type: 'unknown', data: { foo: 'bar' } },
    ])
  })
})

describe('BlockNodeExtension options', () => {
  it('defaults onEdit to undefined when not configured', () => {
    const ext = BlockNodeExtension
    // `addOptions` returns the defaults; not exercising the full Tiptap
    // configure pipeline here because that requires a live editor.
    const defaults = ext.config.addOptions?.call({ name: 'pilotiqBlock', parent: undefined })
    assert.deepEqual(defaults, { blocks: [] })
    assert.equal((defaults as { onEdit?: unknown } | undefined)?.onEdit, undefined)
  })

  it('configure({ onEdit }) round-trips through Tiptap options', () => {
    const seen: number[] = []
    const onEdit = (p: number): void => { seen.push(p) }
    const configured = BlockNodeExtension.configure({ blocks: [], onEdit })
    // Tiptap stores configured options on `.options` after configure().
    const opts = configured.options as { blocks: unknown[]; onEdit?: (p: number) => void }
    assert.equal(typeof opts.onEdit, 'function')
    opts.onEdit?.(5)
    opts.onEdit?.(11)
    assert.deepEqual(seen, [5, 11])
  })

  it('configure without onEdit leaves it undefined', () => {
    const configured = BlockNodeExtension.configure({ blocks: [] })
    const opts = configured.options as { blocks: unknown[]; onEdit?: (p: number) => void }
    assert.equal(opts.onEdit, undefined)
  })

  it('addKeyboardShortcuts exposes Mod-e', () => {
    // The shortcut handler closes over `this.editor` and `this.options` —
    // we don't need the live editor to verify the binding key is wired.
    const ctx = {
      editor:  { state: { selection: {} } },
      options: { blocks: [] },
      name:    'pilotiqBlock',
    } as unknown as ThisParameterType<NonNullable<typeof BlockNodeExtension.config.addKeyboardShortcuts>>
    const shortcuts = BlockNodeExtension.config.addKeyboardShortcuts?.call(ctx)
    assert.ok(shortcuts && typeof shortcuts === 'object')
    assert.equal(typeof (shortcuts as { 'Mod-e'?: unknown })['Mod-e'], 'function')
  })

  it('Mod-e returns false when onEdit is unset (no host listening)', () => {
    const ctx = {
      editor:  { state: { selection: { node: { type: { name: 'pilotiqBlock' } }, from: 7 } } },
      options: { blocks: [] },
      name:    'pilotiqBlock',
    } as unknown as ThisParameterType<NonNullable<typeof BlockNodeExtension.config.addKeyboardShortcuts>>
    const shortcuts = BlockNodeExtension.config.addKeyboardShortcuts?.call(ctx) as Record<string, () => boolean>
    assert.equal(shortcuts['Mod-e']?.(), false)
  })

  it('Mod-e returns false when the selection is not a block NodeSelection', () => {
    const calls: number[] = []
    const ctx = {
      editor:  { state: { selection: { from: 3, to: 3 } } },
      options: { blocks: [], onEdit: (p: number) => calls.push(p) },
      name:    'pilotiqBlock',
    } as unknown as ThisParameterType<NonNullable<typeof BlockNodeExtension.config.addKeyboardShortcuts>>
    const shortcuts = BlockNodeExtension.config.addKeyboardShortcuts?.call(ctx) as Record<string, () => boolean>
    assert.equal(shortcuts['Mod-e']?.(), false)
    assert.deepEqual(calls, [])
  })

  it('Mod-e calls onEdit(pos) and returns true when a block is NodeSelected', () => {
    const calls: number[] = []
    const ctx = {
      editor:  { state: { selection: { node: { type: { name: 'pilotiqBlock' } }, from: 12 } } },
      options: { blocks: [], onEdit: (p: number) => calls.push(p) },
      name:    'pilotiqBlock',
    } as unknown as ThisParameterType<NonNullable<typeof BlockNodeExtension.config.addKeyboardShortcuts>>
    const shortcuts = BlockNodeExtension.config.addKeyboardShortcuts?.call(ctx) as Record<string, () => boolean>
    assert.equal(shortcuts['Mod-e']?.(), true)
    assert.deepEqual(calls, [12])
  })
})

describe('clampPanelWidth', () => {
  it('falls back to the default for non-finite values', () => {
    assert.equal(clampPanelWidth(NaN),       320)
    assert.equal(clampPanelWidth(Infinity),  320)
    assert.equal(clampPanelWidth(-Infinity), 320)
    assert.equal(clampPanelWidth(undefined), 320)
    assert.equal(clampPanelWidth(null),      320)
    assert.equal(clampPanelWidth(''),        320)
    assert.equal(clampPanelWidth('garbage'), 320)
  })

  it('clamps below the minimum up to 240', () => {
    assert.equal(clampPanelWidth(0),    240)
    assert.equal(clampPanelWidth(-50),  240)
    assert.equal(clampPanelWidth(239),  240)
  })

  it('clamps above the maximum down to 600', () => {
    assert.equal(clampPanelWidth(601),    600)
    assert.equal(clampPanelWidth(2000),   600)
    assert.equal(clampPanelWidth(99_999), 600)
  })

  it('passes finite values inside the range through unchanged', () => {
    assert.equal(clampPanelWidth(240), 240)
    assert.equal(clampPanelWidth(320), 320)
    assert.equal(clampPanelWidth(450), 450)
    assert.equal(clampPanelWidth(600), 600)
  })

  it('parses numeric strings (localStorage round-trip)', () => {
    assert.equal(clampPanelWidth('320'), 320)
    assert.equal(clampPanelWidth('450'), 450)
    assert.equal(clampPanelWidth('900'), 600)
    assert.equal(clampPanelWidth('100'), 240)
  })
})
