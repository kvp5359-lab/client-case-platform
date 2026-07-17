import { describe, it, expect } from 'vitest'
import {
  planDocInsert,
  docInsertNumbers,
  applyDocOrder,
  hideUploadedSlots,
  buildDocTreeHtml,
  buildDocTreePlain,
  docFolderKey,
  docSlotKey,
  type DocPlanNode,
  type DocInsertNode,
} from './docTreeInsert'

const slot = (id: string, name: string, withArticle = false, hasDocument = false) => ({
  slot_id: id,
  name,
  article_id: withArticle ? `art-${id}` : null,
  token: withArticle ? `tok-${id}` : null,
  has_document: hasDocument,
})

const kits = [
  {
    kit_id: 'kit1',
    name: 'Документы CP',
    folders: [
      {
        folder_id: 'f1',
        name: 'Базовые документы',
        article_id: null,
        token: null,
        slots: [slot('s1', 'Загранпаспорт', true), slot('s2', 'Бронь квартиры')],
      },
      {
        folder_id: 'f2',
        name: 'Образование',
        article_id: 'art-f2',
        token: 'tok-f2',
        slots: [slot('s3', 'Диплом'), slot('s4', 'Трудовая книжка')],
      },
    ],
  },
]

const node = (
  label: string,
  url: string | null,
  number: string | null,
  children: DocInsertNode[] = [],
): DocInsertNode => ({
  label,
  url,
  number,
  children,
  ...(children.length > 0 ? { isFolder: true } : {}),
})

/** Тот же путь, что в UI: план → номера → готовые узлы. */
const nodesFor = (selected: string[], overrides: Record<string, number> = {}): DocInsertNode[] => {
  const plan = planDocInsert(kits, selected)
  const numbers = docInsertNumbers(plan, overrides)
  const toNode = (n: DocPlanNode): DocInsertNode => ({
    label: n.label,
    url: n.token ? `https://x/a/${n.token}` : null,
    number: numbers.get(n.key) ?? null,
    isFolder: n.isFolder,
    children: n.children.map(toNode),
  })
  return plan.map(toNode)
}

describe('planDocInsert', () => {
  it('отмеченная папка становится заголовком, её слоты — вложенными', () => {
    const plan = planDocInsert(kits, [docFolderKey('f1'), docSlotKey('s1'), docSlotKey('s2')])
    expect(plan).toHaveLength(1)
    expect(plan[0].label).toBe('Базовые документы')
    expect(plan[0].isFolder).toBe(true)
    expect(plan[0].children.map((c) => c.label)).toEqual(['Загранпаспорт', 'Бронь квартиры'])
  })

  it('без отметки папки слоты уходят на верхний уровень', () => {
    const plan = planDocInsert(kits, [docSlotKey('s1'), docSlotKey('s2')])
    expect(plan.map((n) => n.label)).toEqual(['Загранпаспорт', 'Бронь квартиры'])
    expect(plan.every((n) => n.children.length === 0)).toBe(true)
  })

  it('порядок кликов НЕ влияет — всё идёт как в дереве документов', () => {
    const clickedBackwards = planDocInsert(kits, [
      docSlotKey('s4'),
      docSlotKey('s3'),
      docSlotKey('s2'),
      docSlotKey('s1'),
    ])
    expect(clickedBackwards.map((n) => n.label)).toEqual([
      'Загранпаспорт',
      'Бронь квартиры',
      'Диплом',
      'Трудовая книжка',
    ])
  })

  it('перетаскивание меняет порядок: папки внутри набора, слоты внутри папки', () => {
    // Перестановки применяются к дереву ДО плана — тем же кодом, что рисует список.
    const reordered = applyDocOrder(kits, {
      folders: { kit1: ['f2', 'f1'] },
      slots: { f1: ['s2', 's1'] },
    })
    const plan = planDocInsert(reordered, [
      docSlotKey('s1'),
      docSlotKey('s2'),
      docSlotKey('s3'),
      docSlotKey('s4'),
    ])
    expect(plan.map((n) => n.label)).toEqual([
      'Диплом',
      'Трудовая книжка',
      'Бронь квартиры',
      'Загранпаспорт',
    ])
  })

  it('applyDocOrder не теряет то, чего нет в порядке — остаётся в хвосте', () => {
    const reordered = applyDocOrder(kits, { slots: { f2: ['s4'] } })
    expect(reordered[0].folders[1].slots.map((s) => s.slot_id)).toEqual(['s4', 's3'])
  })

  it('переносит признак загруженного документа в план', () => {
    const withDoc = [
      {
        kit_id: 'k',
        name: 'K',
        folders: [
          {
            folder_id: 'f',
            name: 'F',
            article_id: null,
            token: null,
            slots: [slot('a', 'Загружен', false, true), slot('b', 'Пустой')],
          },
        ],
      },
    ]
    const plan = planDocInsert(withDoc, [docSlotKey('a'), docSlotKey('b')])
    expect(plan[0].hasDocument).toBe(true)
    expect(plan[1].hasDocument).toBe(false)
  })
})

describe('hideUploadedSlots', () => {
  it('убирает слоты с загруженным документом, пустые оставляет', () => {
    const withDoc = [
      {
        kit_id: 'k',
        name: 'K',
        folders: [
          {
            folder_id: 'f',
            name: 'F',
            article_id: null,
            token: null,
            slots: [slot('a', 'Загружен', false, true), slot('b', 'Пустой')],
          },
        ],
      },
    ]
    const hidden = hideUploadedSlots(withDoc)
    expect(hidden[0].folders[0].slots.map((s) => s.slot_id)).toEqual(['b'])
    // Исходное дерево не мутируется (кэш React Query).
    expect(withDoc[0].folders[0].slots).toHaveLength(2)
  })

  it('нумеруется только отмеченное — без дыр', () => {
    const nodes = nodesFor([docFolderKey('f2'), docSlotKey('s4')])
    expect(nodes[0].children.map((c) => `${c.number} ${c.label}`)).toEqual(['1.1 Трудовая книжка'])
  })

  it('переносит статью и токен, а где статьи нет — оставляет null', () => {
    const plan = planDocInsert(kits, [docFolderKey('f2'), docSlotKey('s3'), docSlotKey('s2')])
    expect(plan[0]).toMatchObject({ label: 'Бронь квартиры', articleId: null })
    expect(plan[1]).toMatchObject({ label: 'Образование', articleId: 'art-f2', token: 'tok-f2' })
    expect(plan[1].children[0]).toMatchObject({ label: 'Диплом', articleId: null, token: null })
  })

  it('без резолвера ключи чужих вкладок и несуществующие id игнорируются', () => {
    const plan = planDocInsert(kits, ['art:x', 'ext:0', docSlotKey('gone'), docFolderKey('gone')])
    expect(plan).toEqual([])
  })

  it('статьи и внешние ссылки идут после дерева, в порядке отметки', () => {
    const plan = planDocInsert(kits, ['ext:0', docSlotKey('s1'), 'art:a1'], {
      resolveExtra: (key) =>
        key === 'art:a1'
          ? { label: 'Статья БЗ', articleId: 'a1', token: null }
          : key === 'ext:0'
            ? { label: 'Папка на Диске', articleId: null, token: null, url: 'https://drive/x' }
            : null,
    })
    expect(plan.map((n) => n.label)).toEqual(['Загранпаспорт', 'Папка на Диске', 'Статья БЗ'])
    expect(plan[1].url).toBe('https://drive/x')
  })
})

describe('docInsertNumbers', () => {
  it('слоты отмеченной папки — 1.1/1.2, у папки свой номер (в текст не идёт)', () => {
    const plan = planDocInsert(kits, [docFolderKey('f1'), docSlotKey('s1'), docSlotKey('s2')])
    const numbers = docInsertNumbers(plan)
    expect(numbers.get(docFolderKey('f1'))).toBe('1')
    expect(numbers.get(docSlotKey('s1'))).toBe('1.1')
    expect(numbers.get(docSlotKey('s2'))).toBe('1.2')
  })

  it('правка номера папки сдвигает её слоты: 3 → 3.1, 3.2', () => {
    const nodes = nodesFor([docFolderKey('f1'), docSlotKey('s1'), docSlotKey('s2')], {
      [docFolderKey('f1')]: 3,
    })
    expect(nodes[0].children.map((c) => c.number)).toEqual(['3.1', '3.2'])
  })

  it('правка номера сдвигает и все следующие пункты', () => {
    const plan = planDocInsert(kits, [docSlotKey('s1'), docSlotKey('s2'), docSlotKey('s3')])
    const numbers = docInsertNumbers(plan, { [docSlotKey('s2')]: 5 })
    expect(numbers.get(docSlotKey('s1'))).toBe('1')
    expect(numbers.get(docSlotKey('s2'))).toBe('5')
    expect(numbers.get(docSlotKey('s3'))).toBe('6')
  })

  it('правка номера слота сдвигает следующие внутри той же папки', () => {
    const nodes = nodesFor([docFolderKey('f2'), docSlotKey('s3'), docSlotKey('s4')], {
      [docSlotKey('s3')]: 4,
    })
    expect(nodes[0].children.map((c) => c.number)).toEqual(['1.4', '1.5'])
  })

  it('неотмеченные ключи номера не получают', () => {
    const numbers = docInsertNumbers(planDocInsert(kits, [docSlotKey('s1')]))
    expect(numbers.get(docSlotKey('s2'))).toBeUndefined()
    expect(numbers.get(docSlotKey('s1'))).toBe('1')
  })
})

describe('buildDocTreeHtml', () => {
  const tree = [
    node('Базовые документы', null, '1', [
      node('Загранпаспорт', 'https://x/a/t1', '1.1'),
      node('Бронь квартиры', null, '1.2'),
    ]),
    node('Образование', 'https://x/a/t2', '2', [node('Диплом', null, '2.1')]),
  ]

  it('папка — жирный заголовок без номера, её слоты — 1.1 / 1.2', () => {
    const html = buildDocTreeHtml(tree, { hideUnderText: true, numbered: true })
    expect(html).toBe(
      '<strong>Базовые документы</strong><br>' +
        '1.1. <a href="https://x/a/t1">Загранпаспорт</a><br>' +
        '1.2. Бронь квартиры' +
        '<br><br>' +
        '<a href="https://x/a/t2"><strong>Образование</strong></a><br>' +
        '2.1. Диплом',
    )
  })

  it('номер берётся из плана — список и сообщение не расходятся', () => {
    const nodes = nodesFor([docFolderKey('f1'), docSlotKey('s1'), docSlotKey('s2')], {
      [docFolderKey('f1')]: 3,
    })
    const html = buildDocTreeHtml(nodes, { hideUnderText: true, numbered: true })
    expect(html).toContain('<strong>Базовые документы</strong>')
    expect(html).toContain('3.1. <a href="https://x/a/tok-s1">Загранпаспорт</a>')
    expect(html).toContain('3.2. Бронь квартиры')
  })

  it('без статьи вставляет просто название — без ссылки', () => {
    const html = buildDocTreeHtml([node('Бронь квартиры', null, '1')], {
      hideUnderText: true,
      numbered: false,
    })
    expect(html).toBe('Бронь квартиры')
    expect(html).not.toContain('<a')
  })

  it('hideUnderText=false выносит ссылку отдельной строкой', () => {
    const html = buildDocTreeHtml([node('Загранпаспорт', 'https://x/a/t1', '1')], {
      hideUnderText: false,
      numbered: true,
    })
    expect(html).toBe('1. Загранпаспорт<br><a href="https://x/a/t1">https://x/a/t1</a>')
  })

  it('плоский список не раздувается пустыми строками', () => {
    const flat = [node('Первый', null, '1'), node('Второй', null, '2')]
    expect(buildDocTreeHtml(flat, { hideUnderText: true, numbered: true })).toBe(
      '1. Первый<br>2. Второй',
    )
  })

  it('зачёркивает загруженный пункт целиком — и текст, и ссылку', () => {
    const struckLink: DocInsertNode = {
      label: 'Загранпаспорт',
      url: 'https://x/a/t1',
      number: '1.1',
      struck: true,
      children: [],
    }
    expect(buildDocTreeHtml([struckLink], { hideUnderText: true, numbered: true })).toBe(
      '1.1. <s><a href="https://x/a/t1">Загранпаспорт</a></s>',
    )
    expect(buildDocTreeHtml([{ ...struckLink, url: null }], { hideUnderText: true, numbered: true })).toBe(
      '1.1. <s>Загранпаспорт</s>',
    )
    // Ссылка отдельной строкой — зачёркнуты обе строки.
    expect(buildDocTreeHtml([struckLink], { hideUnderText: false, numbered: false })).toBe(
      '<s>Загранпаспорт</s><br><s><a href="https://x/a/t1">https://x/a/t1</a></s>',
    )
  })

  it('экранирует название и адрес', () => {
    const html = buildDocTreeHtml([node('Счёт <b> & "к"', 'https://x/a/t?a=1&b=2', null)], {
      hideUnderText: true,
      numbered: false,
    })
    expect(html).toBe('<a href="https://x/a/t?a=1&amp;b=2">Счёт &lt;b&gt; &amp; &quot;к&quot;</a>')
  })

  it('пустой выбор даёт пустую строку', () => {
    expect(buildDocTreeHtml([], { hideUnderText: true, numbered: true })).toBe('')
  })
})

describe('buildDocTreePlain', () => {
  it('повторяет структуру текстом', () => {
    const plain = buildDocTreePlain(
      [node('Базовые документы', null, '1', [node('Загранпаспорт', 'https://x/a/t1', '1.1')])],
      { hideUnderText: true, numbered: true },
    )
    // В тексте жирного нет — папка просто заголовок без номера.
    expect(plain).toBe('Базовые документы\n1.1. Загранпаспорт')
  })

  it('при развёрнутой ссылке кладёт адрес следующей строкой', () => {
    const plain = buildDocTreePlain([node('Загранпаспорт', 'https://x/a/t1', null)], {
      hideUnderText: false,
      numbered: false,
    })
    expect(plain).toBe('Загранпаспорт\nhttps://x/a/t1')
  })

  // hideUnderText=true прячет адрес под названием — в plain-тексте прятать некуда,
  // поэтому копирование в чистый текст обязано звать нас с hideUnderText=false
  // (см. copyNodes в ShareLinksTab), иначе ссылка потеряется молча.
  it('при hideUnderText=true адреса в тексте нет — это ожидаемо', () => {
    const plain = buildDocTreePlain([node('Загранпаспорт', 'https://x/a/t1', null)], {
      hideUnderText: true,
      numbered: false,
    })
    expect(plain).toBe('Загранпаспорт')
  })
})
