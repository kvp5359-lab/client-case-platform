/**
 * Адаптер статей базы знаний к движку фильтров (src/lib/filters).
 *
 * `knowledgeFieldAccessors` — геттеры колонок статьи для обычных полей.
 * `buildKnowledgeJunctionAccessors` — карты article.id → group_ids / tag_ids
 * для junction-полей (группы/теги). Группы и теги уже приезжают вложенными в
 * статью (см. articlesQuery в useKnowledgeBasePage), поэтому доп. запросов нет.
 */

import type { FilterGroup, FilterRule, FilterCondition } from '@/lib/filters/types'
import type { KnowledgeArticle } from './useKnowledgeBasePage.types'

/** Поля быстрых чипов — их условия хранятся отдельно от «доп.» условий. */
const QUICK_CHIP_FIELDS = new Set(['status_id', 'groups', 'tags'])

export type ParsedChips = {
  statusIds: string[]
  groupIds: string[]
  tagIds: string[]
  /** Остальные условия (автор/даты/опубликовано/…) как расширенный фильтр. */
  advanced: FilterGroup
}

/**
 * Раскладывает единый FilterGroup обратно на быстрые чипы + расширенный
 * остаток — для активации представления. Обратная операция к
 * buildCombinedFilter/quickChipsToFilterRules.
 */
export function parseFilterToChips(filter: FilterGroup): ParsedChips {
  const statusIds: string[] = []
  const groupIds: string[] = []
  const tagIds: string[] = []
  const rest: FilterRule[] = []

  const junctionInto = (field: 'groups' | 'tags', target: string[], rule: FilterRule) => {
    // rule — либо condition (in / is_null), либо OR-группа (in + is_null).
    if (rule.type === 'condition') {
      if (rule.operator === 'is_null') target.push('__none__')
      else if (Array.isArray(rule.value)) target.push(...(rule.value as string[]))
      return
    }
    for (const r of rule.group.rules) {
      if (r.type !== 'condition' || r.field !== field) continue
      if (r.operator === 'is_null') target.push('__none__')
      else if (Array.isArray(r.value)) target.push(...(r.value as string[]))
    }
  }

  const isFieldGroup = (rule: FilterRule, field: string): boolean =>
    rule.type === 'group' &&
    rule.group.rules.every((r) => r.type === 'condition' && r.field === field)

  for (const rule of filter.rules) {
    if (rule.type === 'condition' && rule.field === 'status_id') {
      const vals = Array.isArray(rule.value) ? (rule.value as string[]) : []
      statusIds.push(...vals.map((v) => (v === '__no_status__' ? '__none__' : v)))
    } else if (
      (rule.type === 'condition' && rule.field === 'groups') ||
      isFieldGroup(rule, 'groups')
    ) {
      junctionInto('groups', groupIds, rule)
    } else if (
      (rule.type === 'condition' && rule.field === 'tags') ||
      isFieldGroup(rule, 'tags')
    ) {
      junctionInto('tags', tagIds, rule)
    } else {
      rest.push(rule)
    }
  }

  return { statusIds, groupIds, tagIds, advanced: { logic: 'and', rules: rest } }
}

/** Возвращает top-level условия расширенного фильтра, не относящиеся к
 *  быстрым чипам — для рендера доп. фильтров чипами. */
export function extraConditions(filter: FilterGroup): FilterCondition[] {
  return filter.rules.filter(
    (r): r is FilterCondition => r.type === 'condition' && !QUICK_CHIP_FIELDS.has(r.field),
  )
}

/**
 * Конвертирует быстрые чипы (статус/группа/тег) в условия единого фильтра.
 * Сентинел '__none__' → «без …»: для статуса это '__no_status__' (движок
 * матчит null в 'in'), для junction-полей — оператор is_null. Если выбраны
 * и реальные значения, и '__none__' — оборачиваем в OR (значение ИЛИ пусто).
 */
export function quickChipsToFilterRules(
  statusIds: string[],
  groupIds: string[],
  tagIds: string[],
): FilterRule[] {
  const rules: FilterRule[] = []

  if (statusIds.length > 0) {
    rules.push({
      type: 'condition',
      field: 'status_id',
      operator: 'in',
      value: statusIds.map((id) => (id === '__none__' ? '__no_status__' : id)),
    })
  }

  for (const [field, ids] of [
    ['groups', groupIds] as const,
    ['tags', tagIds] as const,
  ]) {
    if (ids.length === 0) continue
    const real = ids.filter((i) => i !== '__none__')
    const wantNone = ids.includes('__none__')
    if (real.length > 0 && wantNone) {
      rules.push({
        type: 'group',
        group: {
          logic: 'or',
          rules: [
            { type: 'condition', field, operator: 'in', value: real },
            { type: 'condition', field, operator: 'is_null', value: null },
          ],
        },
      })
    } else if (wantNone) {
      rules.push({ type: 'condition', field, operator: 'is_null', value: null })
    } else {
      rules.push({ type: 'condition', field, operator: 'in', value: real })
    }
  }

  return rules
}

/**
 * Собирает единый фильтр из быстрых чипов и расширенного фильтра (AND).
 * Используется при сохранении представления, чтобы оно захватило всё текущее
 * состояние фильтрации. Расширенный фильтр вкладывается группой — сохраняет
 * свою корневую логику (and/or).
 */
export function buildCombinedFilter(
  statusIds: string[],
  groupIds: string[],
  tagIds: string[],
  advanced: FilterGroup,
): FilterGroup {
  const quick = quickChipsToFilterRules(statusIds, groupIds, tagIds)
  if (quick.length === 0) return advanced
  if (advanced.rules.length === 0) return { logic: 'and', rules: quick }
  // AND-расширенный инлайним (условия остаются top-level → рендерятся чипами);
  // OR-расширенный вкладываем группой, чтобы сохранить его логику.
  const advRules: FilterRule[] =
    advanced.logic === 'and' ? advanced.rules : [{ type: 'group', group: advanced }]
  return { logic: 'and', rules: [...quick, ...advRules] }
}

const asArticle = (item: unknown) => item as KnowledgeArticle

/** Геттеры обычных (не junction) полей статьи. */
export const knowledgeFieldAccessors: Record<string, (item: unknown) => unknown> = {
  title: (i) => asArticle(i).title,
  status_id: (i) => asArticle(i).status_id,
  created_by: (i) => asArticle(i).created_by,
  is_published: (i) => asArticle(i).is_published,
  access_mode: (i) => asArticle(i).access_mode,
  indexing_status: (i) => asArticle(i).indexing_status,
  created_at: (i) => asArticle(i).created_at,
  updated_at: (i) => asArticle(i).updated_at,
}

/**
 * Строит junction-аксессоры (группы/теги) из загруженных статей.
 * Возвращает функции id → массив связанных id, как ждёт applyFilters.
 */
export function buildKnowledgeJunctionAccessors(
  articles: KnowledgeArticle[],
): Record<string, (itemId: string) => string[]> {
  const groupsById = new Map<string, string[]>()
  const tagsById = new Map<string, string[]>()
  for (const a of articles) {
    groupsById.set(a.id, a.knowledge_article_groups.map((g) => g.group_id))
    tagsById.set(a.id, a.knowledge_article_tags.map((t) => t.tag_id))
  }
  return {
    groups: (id) => groupsById.get(id) ?? [],
    tags: (id) => tagsById.get(id) ?? [],
  }
}
