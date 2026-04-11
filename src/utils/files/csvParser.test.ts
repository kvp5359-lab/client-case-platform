import { describe, it, expect } from 'vitest'
import { parseCSV, tryParseDate, autoDetectMapping } from './csvParser'

describe('parseCSV', () => {
  it('возвращает пустую структуру для пустой строки', () => {
    expect(parseCSV('')).toEqual({ headers: [], rows: [] })
  })

  it('парсит простой CSV', () => {
    const csv = 'name,age\nAlice,30\nBob,25'
    const result = parseCSV(csv)
    expect(result.headers).toEqual(['name', 'age'])
    expect(result.rows).toEqual([
      ['Alice', '30'],
      ['Bob', '25'],
    ])
  })

  it('обрезает пробелы в ячейках', () => {
    const csv = 'a,b\n  hello  ,  world  '
    expect(parseCSV(csv).rows).toEqual([['hello', 'world']])
  })

  it('фильтрует пустые строки', () => {
    const csv = 'a,b\nx,y\n\n\nz,w'
    expect(parseCSV(csv).rows).toEqual([
      ['x', 'y'],
      ['z', 'w'],
    ])
  })

  it('поддерживает поля в кавычках с запятой внутри', () => {
    const csv = 'name,desc\n"Smith, John","Hello, world"'
    const rows = parseCSV(csv).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(2)
    // Запятая внутри кавычек не должна разделять ячейки
    expect(rows[0][0]).toContain('Smith')
    expect(rows[0][0]).toContain('John')
    expect(rows[0][1]).toContain('Hello')
    expect(rows[0][1]).toContain('world')
  })

  it('поддерживает многострочные поля в кавычках', () => {
    const csv = 'a,b\n"line1\nline2",x'
    const result = parseCSV(csv)
    expect(result.rows).toHaveLength(1)
  })

  it('поддерживает экранированные двойные кавычки', () => {
    const csv = 'a\n"He said ""hi"""'
    const result = parseCSV(csv)
    expect(result.rows).toHaveLength(1)
  })

  it('обрабатывает CRLF переводы строк', () => {
    const csv = 'a,b\r\nx,y\r\nz,w'
    expect(parseCSV(csv).rows).toEqual([
      ['x', 'y'],
      ['z', 'w'],
    ])
  })
})

describe('tryParseDate', () => {
  it('пропускает уже валидный ISO формат', () => {
    expect(tryParseDate('2026-04-11')).toBe('2026-04-11')
  })

  it('конвертирует DD.MM.YYYY', () => {
    expect(tryParseDate('11.04.2026')).toBe('2026-04-11')
  })

  it('конвертирует DD/MM/YYYY', () => {
    expect(tryParseDate('11/04/2026')).toBe('2026-04-11')
  })

  it('добавляет ведущие нули в DD.MM.YYYY', () => {
    expect(tryParseDate('5.1.2026')).toBe('2026-01-05')
  })

  it('возвращает null для нераспознаваемой строки', () => {
    expect(tryParseDate('not a date')).toBe(null)
    expect(tryParseDate('xyz')).toBe(null)
  })

  it('возвращает null для пустой строки', () => {
    expect(tryParseDate('')).toBe(null)
  })
})

describe('autoDetectMapping', () => {
  it('маппит русские заголовки на поля Q&A', () => {
    const mapping = autoDetectMapping(['Вопрос', 'Ответ', 'Источник', 'Дата'])
    expect(mapping['Вопрос']).toBe('question')
    expect(mapping['Ответ']).toBe('answer')
    expect(mapping['Источник']).toBe('source')
    expect(mapping['Дата']).toBe('qa_date')
  })

  it('маппит английские заголовки на поля Q&A', () => {
    const mapping = autoDetectMapping(['question', 'answer', 'source', 'date'])
    expect(mapping['question']).toBe('question')
    expect(mapping['answer']).toBe('answer')
    expect(mapping['source']).toBe('source')
    expect(mapping['date']).toBe('qa_date')
  })

  it('нечувствителен к регистру и пробелам', () => {
    const mapping = autoDetectMapping(['  ВОПРОС  ', 'Answer'])
    expect(mapping['  ВОПРОС  ']).toBe('question')
    expect(mapping['Answer']).toBe('answer')
  })

  it('возвращает null для неизвестных заголовков', () => {
    const mapping = autoDetectMapping(['unknown', 'random'])
    expect(mapping['unknown']).toBe(null)
    expect(mapping['random']).toBe(null)
  })

  it('маппит составные русские заголовки', () => {
    const mapping = autoDetectMapping(['Исходный вопрос', 'Исходные ответы'])
    expect(mapping['Исходный вопрос']).toBe('original_question')
    expect(mapping['Исходные ответы']).toBe('original_answers')
  })
})
