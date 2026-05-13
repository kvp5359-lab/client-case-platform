/**
 * Извлекает preset для предзаполнения диалога создания треда из фильтра
 * колонки доски / списка. Логика:
 *  - Только верхнеуровневая группа с logic='and'. Вложенные группы и OR
 *    игнорируем — preset не должен делать предположений за пользователя.
 *  - Только operator='equals' с одним значением.
 *  - assignees + 'in' с одним значением → ОК (и __me__ резолвим через ctx).
 *  - deadline + 'today' → ставим сегодня.
 *  - Несовместимые операторы (not_equals, in с несколькими, before/after,
 *    between, is_null, ...) → пропускаем. Соответствующее поле в диалоге
 *    останется с дефолтом.
 *
 * Возвращённый preset best-effort: гарантирует, что описанные поля
 * соответствуют фильтру, но не гарантирует, что созданный тред попадёт
 * в эту колонку, если фильтр содержит сложные ветки.
 */

import type { FilterGroup, FilterContext, FilterCondition } from './types'

export interface ThreadCreatePreset {
  tabMode?: 'task' | 'chat' | 'email'
  projectId?: string
  statusId?: string
  deadline?: string // ISO
  assigneeIds?: string[]
}

export function extractThreadCreatePreset(
  group: FilterGroup,
  ctx: FilterContext,
): ThreadCreatePreset {
  const preset: ThreadCreatePreset = {}
  if (!group || group.logic !== 'and' || group.rules.length === 0) return preset

  for (const rule of group.rules) {
    if (rule.type !== 'condition') continue
    const c = rule as FilterCondition

    if (c.field === 'type' && c.operator === 'equals' && typeof c.value === 'string') {
      if (c.value === 'task' || c.value === 'chat' || c.value === 'email') {
        preset.tabMode = c.value
      }
      continue
    }

    if (c.field === 'project_id' && c.operator === 'equals' && typeof c.value === 'string') {
      preset.projectId = c.value
      continue
    }

    if (c.field === 'status_id' && c.operator === 'equals' && typeof c.value === 'string') {
      preset.statusId = c.value
      continue
    }

    if (c.field === 'deadline') {
      if (c.operator === 'today') {
        preset.deadline = ctx.now.toISOString()
      } else if (
        (c.operator === 'date_eq' || c.operator === 'equals') &&
        typeof c.value === 'string'
      ) {
        preset.deadline = c.value
      }
      continue
    }

    if (c.field === 'assignees' && c.operator === 'in' && Array.isArray(c.value)) {
      const resolved = c.value
        .map((v) => (v === '__me__' ? ctx.currentParticipantId : v))
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
      if (resolved.length > 0) preset.assigneeIds = resolved
      continue
    }
  }

  return preset
}
