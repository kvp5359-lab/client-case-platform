import { describe, it, expect } from 'vitest'
import { buildProjectPlanLines, planLinesToText, planLinesToHtml } from './projectPlanText'

// Простейший stub: убирает теги <p>…</p> в перевод строки (как htmlToPlain).
const htmlToPlain = (s: string) =>
  s
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()

const build = (input: Parameters<typeof buildProjectPlanLines>[0]) =>
  planLinesToText(buildProjectPlanLines(input))

describe('buildProjectPlanLines', () => {
  it('возвращает «План пуст.» при отсутствии данных', () => {
    expect(build({ tasks: [], blocks: [], kits: [], slots: [], htmlToPlain })).toBe('План пуст.')
  })

  it('нумерует задачи и перезапускает счёт после разделителя-заголовка', () => {
    const text = build({
      tasks: [
        { id: 't1', name: 'Задача А', sort_order: 0 },
        { id: 't2', name: 'Задача Б', sort_order: 10 },
        { id: 't3', name: 'Задача В', sort_order: 30 },
      ],
      blocks: [{ id: 'h1', block_type: 'heading', content: '<p>Этап 2</p>', sort_order: 20 }],
      kits: [],
      slots: [],
      htmlToPlain,
    })
    expect(text).toContain('ЗАДАЧИ')
    expect(text).toContain('1. Задача А')
    expect(text).toContain('2. Задача Б')
    expect(text).toContain('Этап 2')
    expect(text).toContain('1. Задача В')
  })

  it('группирует слоты по наборам, нумеруя подряд без папок', () => {
    const lines = buildProjectPlanLines({
      tasks: [],
      blocks: [],
      kits: [
        {
          id: 'k1',
          name: 'Набор 1',
          sort_order: 0,
          folders: [
            { id: 'f1', name: 'Папка 1', sort_order: 0 },
            { id: 'f2', name: 'Папка 2', sort_order: 1 },
          ],
        },
        {
          id: 'k2',
          name: 'Набор 2',
          sort_order: 1,
          folders: [{ id: 'f3', name: 'Папка 3', sort_order: 0 }],
        },
      ],
      slots: [
        { id: 's1', name: 'Паспорт', folder_id: 'f1', sort_order: 0 },
        { id: 's2', name: 'Виза', folder_id: 'f2', sort_order: 0 },
        { id: 's3', name: 'Договор', folder_id: 'f3', sort_order: 0 },
      ],
      htmlToPlain,
    })
    const text = planLinesToText(lines)
    expect(text).toContain('ДОКУМЕНТЫ')
    // нумерация по набору, слоты обеих папок набора 1 идут подряд
    expect(text).toContain('1. Паспорт')
    expect(text).toContain('2. Виза')
    expect(text).toContain('1. Договор')
    // подзаголовков папок больше нет
    expect(text).not.toContain('— Папка')
    // названия наборов помечены жирными
    expect(lines.find((l) => l.text === 'Набор 1')?.bold).toBe(true)
    expect(lines.find((l) => l.text === 'Набор 2')?.bold).toBe(true)
  })

  it('помечает выполненные задачи зачёркнутыми (strike)', () => {
    const lines = buildProjectPlanLines({
      tasks: [
        { id: 't1', name: 'Готовая', sort_order: 0, done: true },
        { id: 't2', name: 'В работе', sort_order: 10 },
      ],
      blocks: [],
      kits: [],
      slots: [],
      htmlToPlain,
    })
    expect(lines.find((l) => l.text === '1. Готовая')?.strike).toBe(true)
    expect(lines.find((l) => l.text === '2. В работе')?.strike).toBeFalsy()
  })

  it('выводит статус загруженного документа через тире', () => {
    const text = build({
      tasks: [],
      blocks: [],
      kits: [{ id: 'k1', name: 'Набор', sort_order: 0, folders: [{ id: 'f1', name: 'F', sort_order: 0 }] }],
      slots: [
        { id: 's1', name: 'Паспорт', folder_id: 'f1', sort_order: 0, loadedStatus: 'Принят' },
        { id: 's2', name: 'Виза', folder_id: 'f1', sort_order: 1 },
      ],
      htmlToPlain,
    })
    expect(text).toContain('1. Паспорт — Принят')
    expect(text).toContain('2. Виза')
    expect(text).not.toContain('2. Виза —')
  })

  it('planLinesToHtml оборачивает жирность и зачёркивание', () => {
    const html = planLinesToHtml([
      { text: 'Набор', bold: true },
      { text: '1. Готовая', strike: true },
      { text: '' },
    ])
    expect(html).toBe('<p><strong>Набор</strong></p><p><s>1. Готовая</s></p><p></p>')
  })

  it('пропускает пустые наборы (без слотов)', () => {
    const text = build({
      tasks: [{ id: 't1', name: 'Задача', sort_order: 0 }],
      blocks: [],
      kits: [
        { id: 'k1', name: 'Пустой набор', sort_order: 0, folders: [{ id: 'f1', name: 'F', sort_order: 0 }] },
      ],
      slots: [],
      htmlToPlain,
    })
    expect(text).not.toContain('ДОКУМЕНТЫ')
    expect(text).not.toContain('Пустой набор')
  })
})
