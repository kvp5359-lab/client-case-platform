/**
 * Утилиты построения матрицы «критерии × виды ВНЖ» (Контур 1, Шаг 2).
 * Чистые функции — без React/IO. Извлекают пороги из дерева правил.
 */

import type {
  ResidenceCatalog,
  ResidenceCriterion,
  ResidenceCriteriaGroup,
  ResidenceType,
  RuleCondition,
  RuleGroup,
} from './types'

/** Рекурсивно собрать все условия из дерева правила (И/ИЛИ, вложенные группы). */
export function extractConditions(rg: RuleGroup | null | undefined): RuleCondition[] {
  if (!rg) return []
  const out: RuleCondition[] = [...(rg.conditions ?? [])]
  for (const sub of rg.groups ?? []) out.push(...extractConditions(sub))
  return out
}

export type MatrixCell = {
  operator: RuleCondition['operator']
  value: RuleCondition['value']
  severity?: RuleCondition['severity']
  /** Критерий встретился в нескольких правилах ВНЖ с РАЗНЫМИ значениями. */
  conflict: boolean
} | null

export type MatrixRow = {
  group: ResidenceCriteriaGroup | null
  criteria: ResidenceCriterion[]
}

export type ResidenceMatrix = {
  rows: MatrixRow[]
  residenceTypes: ResidenceType[]
  /** field_key → residence_type_id → ячейка. */
  cells: Map<string, Map<string, MatrixCell>>
}

/** Построить матрицу: для каждого ВНЖ собрать условия из его правил по field_key. */
export function buildResidenceMatrix(cat: ResidenceCatalog): ResidenceMatrix {
  // residence_type_id → link_ids
  const linksByType = new Map<string, string[]>()
  for (const link of cat.links) {
    const arr = linksByType.get(link.residence_type_id) ?? []
    arr.push(link.id)
    linksByType.set(link.residence_type_id, arr)
  }

  // link_id → rules
  const rulesByLink = new Map<string, typeof cat.rules>()
  for (const rule of cat.rules) {
    const arr = rulesByLink.get(rule.link_id) ?? []
    arr.push(rule)
    rulesByLink.set(rule.link_id, arr)
  }

  // field_key → residence_type_id → cell
  const cells = new Map<string, Map<string, MatrixCell>>()

  for (const rt of cat.residenceTypes) {
    const linkIds = linksByType.get(rt.id) ?? []
    // собрать все условия всех правил всех связок этого ВНЖ
    const conds: RuleCondition[] = []
    for (const lid of linkIds) {
      for (const rule of rulesByLink.get(lid) ?? []) {
        conds.push(...extractConditions(rule.rule_json))
      }
    }
    // сгруппировать по field, определить конфликт значений
    const byField = new Map<string, RuleCondition[]>()
    for (const c of conds) {
      const arr = byField.get(c.field) ?? []
      arr.push(c)
      byField.set(c.field, arr)
    }
    for (const [field, list] of byField) {
      const first = list[0]
      const conflict = list.some(
        (c) => c.operator !== first.operator || JSON.stringify(c.value) !== JSON.stringify(first.value),
      )
      let map = cells.get(field)
      if (!map) {
        map = new Map()
        cells.set(field, map)
      }
      map.set(rt.id, {
        operator: first.operator,
        value: first.value,
        severity: first.severity,
        conflict,
      })
    }
  }

  // строки: критерии по группам (в порядке групп, потом без группы)
  const sortedGroups = [...cat.groups].sort((a, b) => a.display_order - b.display_order)
  const rows: MatrixRow[] = []
  for (const g of sortedGroups) {
    const crit = cat.criteria
      .filter((c) => c.group_id === g.id)
      .sort((a, b) => a.display_order - b.display_order)
    if (crit.length) rows.push({ group: g, criteria: crit })
  }
  const ungrouped = cat.criteria
    .filter((c) => !c.group_id || !cat.groups.some((g) => g.id === c.group_id))
    .sort((a, b) => a.display_order - b.display_order)
  if (ungrouped.length) rows.push({ group: null, criteria: ungrouped })

  return { rows, residenceTypes: cat.residenceTypes, cells }
}

const OP_SYMBOL: Record<RuleCondition['operator'], string> = {
  '>=': '≥', '<=': '≤', '>': '>', '<': '<', '=': '', '!=': '≠', in: '∈', contains: '⊇',
}

/** Человекочитаемая запись ячейки с учётом типа критерия. */
export function formatCell(cell: MatrixCell, criterion?: ResidenceCriterion): string {
  if (!cell) return '—'
  const { operator, value } = cell

  if (typeof value === 'boolean') return value ? 'да' : 'нет'

  if (Array.isArray(value)) {
    const sym = OP_SYMBOL[operator] || '∈'
    return `${sym} ${value.length} знач.`
  }

  if (criterion?.field_type === 'reference') {
    // value — id из справочника; имя не резолвим в матрице (MVP)
    return `${OP_SYMBOL[operator] || '='} …`.trim()
  }

  const sym = OP_SYMBOL[operator]
  return sym ? `${sym} ${value}` : `${value}`
}
