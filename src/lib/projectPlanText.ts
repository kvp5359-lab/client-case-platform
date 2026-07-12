/**
 * Сборка текстового «плана выполнения» проекта для модалки «Сформировать план».
 *
 * Чистые функции (без зависимостей от UI/React) → легко тестируются.
 * Конвертер HTML→plain инжектится параметром, чтобы не тянуть компонентный
 * слой в lib (htmlToPlain живёт в components/plan/PlanBlockItem).
 *
 * Результат — массив строк (PlanLine[]) с флагом жирности: для отображения
 * в окне (названия наборов документов — жирные), а для копирования строки
 * склеиваются в plain-текст (planLinesToText).
 *
 * Структура — две секции:
 *   ЗАДАЧИ      — задачи в порядке плана, разбитые разделителями-заголовками,
 *                 нумерация перезапускается внутри каждой группы.
 *   ДОКУМЕНТЫ   — слоты документов, сгруппированные по наборам документов
 *                 (без вложенных папок: слоты набора нумеруются подряд).
 */

import { escapeHtml } from '@/lib/html'

export type PlanLine = { text: string; bold?: boolean; strike?: boolean }

export type PlanTaskInput = {
  id: string
  name: string
  sort_order: number
  /** Задача в финальном статусе (выполнена/завершена) — рисуется зачёркнутой. */
  done?: boolean
}

export type PlanBlockInput = {
  id: string
  block_type: 'heading' | 'text'
  content: string | null
  sort_order: number
}

export type PlanFolderInput = { id: string; name: string; sort_order: number }

export type PlanKitInput = {
  id: string
  name: string
  sort_order: number
  folders: PlanFolderInput[]
}

export type PlanSlotInput = {
  id: string
  name: string
  folder_id: string
  sort_order: number
  /** Статус загруженного документа — выводится через тире. Пусто = слот пустой. */
  loadedStatus?: string | null
}

const TASKS_HEADER = 'ЗАДАЧИ'
const DOCS_HEADER = 'ДОКУМЕНТЫ'

function bySortOrder<T extends { sort_order: number }>(a: T, b: T): number {
  return a.sort_order - b.sort_order
}

/** Секция «Задачи» — задачи + разделители (heading/text-блоки) в порядке плана. */
function buildTasksLines(
  tasks: PlanTaskInput[],
  blocks: PlanBlockInput[],
  htmlToPlain: (s: string) => string,
): PlanLine[] {
  type Merged =
    | { kind: 'task'; sort: number; task: PlanTaskInput }
    | { kind: 'block'; sort: number; block: PlanBlockInput }

  const merged: Merged[] = [
    ...tasks.map((t) => ({ kind: 'task' as const, sort: t.sort_order ?? 0, task: t })),
    ...blocks.map((b) => ({ kind: 'block' as const, sort: b.sort_order, block: b })),
  ].sort((a, b) => a.sort - b.sort || (a.kind === 'task' ? -1 : 1))

  if (merged.length === 0) return []

  const lines: PlanLine[] = [{ text: TASKS_HEADER }, { text: '' }]
  let counter = 0

  for (const item of merged) {
    if (item.kind === 'task') {
      counter += 1
      lines.push({ text: `${counter}. ${item.task.name.trim()}`, strike: item.task.done })
      continue
    }
    const text = htmlToPlain(item.block.content ?? '').trim()
    if (item.block.block_type === 'heading') {
      // Разделитель: пустая строка + заголовок, нумерация группы перезапускается.
      if (lines[lines.length - 1].text !== '') lines.push({ text: '' })
      lines.push({ text: text || '—' })
      counter = 0
    } else {
      // Текстовая заметка — отдельной строкой, без номера, нумерацию не сбрасывает.
      if (text) lines.push({ text })
    }
  }

  return lines
}

/** Секция «Документы» — слоты, сгруппированные по наборам (без вложенных папок). */
function buildDocsLines(kits: PlanKitInput[], slots: PlanSlotInput[]): PlanLine[] {
  const slotsByFolder = new Map<string, PlanSlotInput[]>()
  for (const s of slots) {
    const arr = slotsByFolder.get(s.folder_id)
    if (arr) arr.push(s)
    else slotsByFolder.set(s.folder_id, [s])
  }

  const sortedKits = [...kits].sort(bySortOrder)
  const body: PlanLine[] = []

  for (const kit of sortedKits) {
    // Слоты набора = слоты всех его папок (папки и слоты — по порядку), без подзаголовков.
    const folders = [...(kit.folders ?? [])].sort(bySortOrder)
    const kitSlots: PlanSlotInput[] = []
    for (const f of folders) {
      const fs = [...(slotsByFolder.get(f.id) ?? [])].sort(bySortOrder)
      kitSlots.push(...fs)
    }

    if (kitSlots.length === 0) continue

    if (body.length > 0) body.push({ text: '' })
    body.push({ text: kit.name.trim() || 'Набор документов', bold: true })
    kitSlots.forEach((s, i) => {
      const status = s.loadedStatus?.trim()
      body.push({ text: `${i + 1}. ${s.name.trim()}${status ? ` — ${status}` : ''}` })
    })
  }

  if (body.length === 0) return []
  return [{ text: DOCS_HEADER }, { text: '' }, ...body]
}

export function buildProjectPlanLines(input: {
  tasks: PlanTaskInput[]
  blocks: PlanBlockInput[]
  kits: PlanKitInput[]
  slots: PlanSlotInput[]
  htmlToPlain: (s: string) => string
}): PlanLine[] {
  const tasksLines = buildTasksLines(input.tasks, input.blocks, input.htmlToPlain)
  const docsLines = buildDocsLines(input.kits, input.slots)

  const lines: PlanLine[] = []
  if (tasksLines.length) lines.push(...tasksLines)
  if (tasksLines.length && docsLines.length) lines.push({ text: '' }, { text: '' })
  if (docsLines.length) lines.push(...docsLines)

  if (lines.length === 0) return [{ text: 'План пуст.' }]
  return lines
}

/** Склейка строк плана в plain-текст (для копирования в буфер обмена). */
export function planLinesToText(lines: PlanLine[]): string {
  return lines.map((l) => l.text).join('\n')
}

/** Строки плана → HTML-параграфы для Tiptap-редактора (жирность/зачёркивание). */
export function planLinesToHtml(lines: PlanLine[]): string {
  return lines
    .map((l) => {
      let inner = escapeHtml(l.text)
      if (l.strike) inner = `<s>${inner}</s>`
      if (l.bold) inner = `<strong>${inner}</strong>`
      return `<p>${inner}</p>`
    })
    .join('')
}
