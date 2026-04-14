/**
 * Утилиты для работы с CardLayout: резолвинг, стили, манипуляции.
 */

import type {
  CardFieldId,
  CardFieldStyle,
  CardFieldPlacement,
  CardLayout,
  CardLayoutRow,
} from './types'
import { CARD_FIELD_DEFS } from './listSettingsConfigs'

// ── Resolved layout для рендеринга ──────────────────────

export interface ResolvedField {
  fieldId: CardFieldId
  style: CardFieldStyle
}

export interface ResolvedRow {
  fields: ResolvedField[]
}

/**
 * Берёт CardLayout и возвращает «чистый» массив строк
 * только с видимыми полями, подходящими для данного entity_type.
 * null = layout не задан, используй старый рендеринг.
 */
export function resolveCardLayout(
  layout: CardLayout | null | undefined,
  entityType: 'task' | 'project',
): ResolvedRow[] | null {
  if (!layout) return null
  const validFields = new Set(
    CARD_FIELD_DEFS
      .filter((f) => f.entityTypes.includes(entityType))
      .map((f) => f.id),
  )
  const rows = layout.rows
    .map((row) => ({
      fields: row.fields
        .filter((f) => f.visible && validFields.has(f.fieldId))
        .map((f) => ({ fieldId: f.fieldId, style: f.style })),
    }))
    .filter((row) => row.fields.length > 0)
  return rows.length > 0 ? rows : null
}

// ── CSS-классы из стиля поля ────────────────────────────

const FONT_SIZE_MAP: Record<CardFieldStyle['fontSize'], string> = {
  sm: 'text-[11px]',
  md: 'text-[14px]',
  lg: 'text-[16px]',
}

export function fieldStyleToClasses(style: CardFieldStyle): string {
  const parts: string[] = [FONT_SIZE_MAP[style.fontSize]]
  if (style.align === 'right') parts.push('text-right ml-auto')
  else if (style.align === 'center') parts.push('text-center')
  if (style.truncate === 'truncate') parts.push('truncate')
  else parts.push('break-words')
  if (style.bold) parts.push('font-medium')
  return parts.join(' ')
}

// ── Дефолтный стиль поля ────────────────────────────────

export const DEFAULT_FIELD_STYLE: CardFieldStyle = {
  fontSize: 'sm',
  align: 'left',
  truncate: 'truncate',
  bold: false,
}

// ── Манипуляции с layout (для Appearance Tab) ───────────

/** Генерирует уникальный id строки */
export function makeRowId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** Добавляет пустую строку (макс. 3) */
export function addRow(layout: CardLayout): CardLayout {
  if (layout.rows.length >= 3) return layout
  return {
    ...layout,
    rows: [...layout.rows, { id: makeRowId(), fields: [] }],
  }
}

/** Удаляет строку. Её поля скрываются и переносятся в первую строку. */
export function removeRow(layout: CardLayout, rowId: string): CardLayout {
  const row = layout.rows.find((r) => r.id === rowId)
  if (!row || layout.rows.length <= 1) return layout
  const orphanedFields = row.fields.map((f) => ({ ...f, visible: false }))
  const newRows = layout.rows.filter((r) => r.id !== rowId)
  newRows[0] = {
    ...newRows[0],
    fields: [...newRows[0].fields, ...orphanedFields],
  }
  return { ...layout, rows: newRows }
}

/** Переключает видимость поля. Если поля нет ни в одной строке — добавляет в последнюю. */
export function toggleFieldVisibility(
  layout: CardLayout,
  fieldId: CardFieldId,
): CardLayout {
  let found = false
  const newRows = layout.rows.map((row) => ({
    ...row,
    fields: row.fields.map((f) => {
      if (f.fieldId === fieldId) {
        found = true
        return { ...f, visible: !f.visible }
      }
      return f
    }),
  }))

  if (!found) {
    // Поле не существует в layout — добавляем в последнюю строку как видимое
    const lastIdx = newRows.length - 1
    const newField: CardFieldPlacement = {
      fieldId,
      visible: true,
      style: fieldId === 'name'
        ? { ...DEFAULT_FIELD_STYLE, fontSize: 'md' }
        : DEFAULT_FIELD_STYLE,
    }
    newRows[lastIdx] = {
      ...newRows[lastIdx],
      fields: [...newRows[lastIdx].fields, newField],
    }
  }

  return { ...layout, rows: newRows }
}

/** Обновляет стиль конкретного поля */
export function updateFieldStyle(
  layout: CardLayout,
  fieldId: CardFieldId,
  patch: Partial<CardFieldStyle>,
): CardLayout {
  return {
    ...layout,
    rows: layout.rows.map((row) => ({
      ...row,
      fields: row.fields.map((f) =>
        f.fieldId === fieldId ? { ...f, style: { ...f.style, ...patch } } : f,
      ),
    })),
  }
}

/** Перемещает поле из одной строки в другую (или внутри строки).
 *  sourceRowId, targetRowId — id строк, fieldId — поле,
 *  targetIndex — позиция вставки в целевой строке. */
export function moveField(
  layout: CardLayout,
  fieldId: CardFieldId,
  sourceRowId: string,
  targetRowId: string,
  targetIndex: number,
): CardLayout {
  let movedField: CardFieldPlacement | null = null
  let newRows: CardLayoutRow[] = layout.rows.map((row) => {
    if (row.id === sourceRowId) {
      const idx = row.fields.findIndex((f) => f.fieldId === fieldId)
      if (idx !== -1) {
        movedField = row.fields[idx]
        return { ...row, fields: row.fields.filter((_, i) => i !== idx) }
      }
    }
    return row
  })

  if (!movedField) return layout

  newRows = newRows.map((row) => {
    if (row.id === targetRowId) {
      const fields = [...row.fields]
      fields.splice(targetIndex, 0, movedField!)
      return { ...row, fields }
    }
    return row
  })

  return { ...layout, rows: newRows }
}

/** Проверяет, видимо ли поле в layout */
export function isFieldVisible(layout: CardLayout, fieldId: CardFieldId): boolean {
  return layout.rows.some((row) =>
    row.fields.some((f) => f.fieldId === fieldId && f.visible),
  )
}

/** Находит стиль поля в layout */
export function getFieldStyle(
  layout: CardLayout,
  fieldId: CardFieldId,
): CardFieldStyle | null {
  for (const row of layout.rows) {
    const f = row.fields.find((f) => f.fieldId === fieldId)
    if (f) return f.style
  }
  return null
}

/** Скрывает поле (возвращает в «банк»). Поле остаётся в layout, но visible=false. */
export function hideField(layout: CardLayout, fieldId: CardFieldId): CardLayout {
  return {
    ...layout,
    rows: layout.rows.map((row) => ({
      ...row,
      fields: row.fields.map((f) =>
        f.fieldId === fieldId ? { ...f, visible: false } : f,
      ),
    })),
  }
}

/** Добавляет поле из банка в конкретную строку (в конец). Если поле уже где-то есть — делает visible. */
export function placeFieldInRow(
  layout: CardLayout,
  fieldId: CardFieldId,
  targetRowId: string,
): CardLayout {
  // Проверим, есть ли поле уже в какой-то строке
  let found = false
  let newRows = layout.rows.map((row) => ({
    ...row,
    fields: row.fields.map((f) => {
      if (f.fieldId === fieldId) {
        found = true
        // Если в нужной строке — просто делаем видимым
        if (row.id === targetRowId) return { ...f, visible: true }
        // Иначе — скрываем из старой (перенесём ниже)
        return { ...f, visible: false }
      }
      return f
    }),
  }))

  if (found) {
    // Если поле было в другой строке — нужно его перенести в целевую
    const alreadyInTarget = newRows
      .find((r) => r.id === targetRowId)
      ?.fields.some((f) => f.fieldId === fieldId && f.visible)
    if (!alreadyInTarget) {
      // Найти скрытое поле, вытащить его и вставить в target
      let placement: CardFieldPlacement | null = null
      newRows = newRows.map((row) => ({
        ...row,
        fields: row.fields.filter((f) => {
          if (f.fieldId === fieldId && !f.visible) {
            placement = { ...f, visible: true }
            return false
          }
          return true
        }),
      }))
      if (placement) {
        newRows = newRows.map((row) =>
          row.id === targetRowId
            ? { ...row, fields: [...row.fields, placement!] }
            : row,
        )
      }
    }
  } else {
    // Поля нет в layout — создаём с дефолтным стилем
    const newField: CardFieldPlacement = {
      fieldId,
      visible: true,
      style: fieldId === 'name'
        ? { ...DEFAULT_FIELD_STYLE, fontSize: 'md' }
        : DEFAULT_FIELD_STYLE,
    }
    newRows = newRows.map((row) =>
      row.id === targetRowId
        ? { ...row, fields: [...row.fields, newField] }
        : row,
    )
  }

  return { ...layout, rows: newRows }
}

/**
 * Конвертирует старые visibleFields + displayMode в CardLayout.
 * Используется как fallback, когда card_layout === null.
 */
export function visibleFieldsToLayout(
  visibleFields: string[],
  displayMode: 'list' | 'cards',
  entityType: 'task' | 'project',
): ResolvedRow[] {
  const S: CardFieldStyle = { fontSize: 'sm', align: 'left', truncate: 'truncate', bold: false }
  const M: CardFieldStyle = { fontSize: 'md', align: 'left', truncate: 'truncate', bold: false }
  const SR: CardFieldStyle = { fontSize: 'sm', align: 'right', truncate: 'truncate', bold: false }

  const has = (f: string) => visibleFields.includes(f)

  if (entityType === 'project') {
    const row: ResolvedField[] = [
      { fieldId: 'icon', style: S },
      { fieldId: 'name', style: M },
    ]
    if (has('deadline')) row.push({ fieldId: 'deadline', style: SR })
    if (has('template')) row.push({ fieldId: 'template', style: SR })
    return [{ fields: row }]
  }

  // task
  if (displayMode === 'cards') {
    const top: ResolvedField[] = []
    if (has('status')) top.push({ fieldId: 'status', style: S })
    top.push({ fieldId: 'name', style: M })
    if (has('assignees')) top.push({ fieldId: 'assignees', style: SR })
    top.push({ fieldId: 'unread', style: SR })

    const bottom: ResolvedField[] = []
    if (has('project')) bottom.push({ fieldId: 'project', style: { fontSize: 'sm', align: 'left', truncate: 'truncate', bold: false } })
    if (has('deadline')) bottom.push({ fieldId: 'deadline', style: SR })

    const rows: ResolvedRow[] = [{ fields: top }]
    if (bottom.length > 0) rows.push({ fields: bottom })
    return rows
  }

  // list mode
  const row: ResolvedField[] = []
  if (has('status')) row.push({ fieldId: 'status', style: S })
  row.push({ fieldId: 'name', style: M })
  if (has('project')) row.push({ fieldId: 'project', style: { fontSize: 'sm', align: 'left', truncate: 'truncate', bold: false } })
  if (has('deadline')) row.push({ fieldId: 'deadline', style: SR })
  if (has('assignees')) row.push({ fieldId: 'assignees', style: SR })
  row.push({ fieldId: 'unread', style: SR })
  return [{ fields: row }]
}

/** Возвращает список полей, не размещённых (visible) ни в одной строке */
export function getUnplacedFields(
  layout: CardLayout,
  entityType: 'task' | 'project',
): CardFieldId[] {
  const validFields = new Set(
    CARD_FIELD_DEFS
      .filter((f) => f.entityTypes.includes(entityType))
      .map((f) => f.id),
  )
  const placedFields = new Set(
    layout.rows.flatMap((row) =>
      row.fields.filter((f) => f.visible).map((f) => f.fieldId),
    ),
  )
  return Array.from(validFields).filter((id) => !placedFields.has(id))
}
