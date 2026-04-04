/**
 * CSV-парсер с поддержкой многострочных полей в кавычках
 */

export interface ParsedCSV {
  headers: string[]
  rows: string[][]
}

export function parseCSV(text: string): ParsedCSV {
  const lines = splitCSVLines(text)
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = parseCSVLine(lines[0])
  const rows = lines
    .slice(1)
    .map(parseCSVLine)
    .filter((row) => row.some((cell) => cell.trim()))

  return { headers, rows }
}

function splitCSVLines(text: string): string[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (ch === '"') {
      current += ch
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      if (current.trim()) lines.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) lines.push(current)
  return lines
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

/** Пытается разобрать дату из CSV в формат YYYY-MM-DD для PostgreSQL */
export function tryParseDate(raw: string): string | null {
  // Уже ISO: 2025-01-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // DD.MM.YYYY или DD/MM/YYYY
  const dmy = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`

  // Попробовать через Date.parse
  const d = new Date(raw)
  if (!isNaN(d.getTime())) {
    let y = d.getFullYear()
    if (y < 2020) y = new Date().getFullYear()
    return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  return null
}

/** Авто-маппинг CSV-заголовков на поля Q&A */
export type MappableField =
  | 'question'
  | 'answer'
  | 'original_question'
  | 'original_answers'
  | 'source'
  | 'qa_date'

export interface ColumnMapping {
  [csvHeader: string]: MappableField | null
}

const HEADER_MAP: Record<string, MappableField> = {
  вопрос: 'question',
  question: 'question',
  ответ: 'answer',
  answer: 'answer',
  'исходный вопрос': 'original_question',
  original_question: 'original_question',
  'исходные ответы': 'original_answers',
  original_answers: 'original_answers',
  источник: 'source',
  source: 'source',
  дата: 'qa_date',
  date: 'qa_date',
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    mapping[header] = HEADER_MAP[normalized] ?? null
  }
  return mapping
}
