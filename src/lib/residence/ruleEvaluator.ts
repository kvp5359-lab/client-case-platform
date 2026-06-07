/**
 * Движок подбора ВНЖ (Контур 2). Портирован из relostart `rule-evaluator.ts`.
 * Чистые функции: ответы клиента + правила → статус по каждому виду ВНЖ.
 * Агрегация по ВНЖ (процедуры не различаем): ВНЖ берёт ЛУЧШИЙ статус среди своих правил.
 */

import type { ResidenceCatalog, RuleCondition, RuleGroup } from './types'

export type Answers = Record<string, string | number | boolean | undefined>
export type EvalStatus = 'eligible' | 'warning' | 'ineligible'

export type ResidenceEvaluation = {
  residenceTypeId: string
  status: EvalStatus
  score: number // % выполненных условий
  failedCritical: string[] // названия проваленных критичных правил
  warnings: string[] // названия проваленных желательных правил
}

function evaluateCondition(cond: RuleCondition, answers: Answers): boolean {
  const answer = answers[cond.field]
  if (answer === undefined || answer === null || answer === '') return false
  const { operator, value } = cond
  switch (operator) {
    case '=': return String(answer) === String(value)
    case '!=': return String(answer) !== String(value)
    case '>': return Number(answer) > Number(value)
    case '<': return Number(answer) < Number(value)
    case '>=': return Number(answer) >= Number(value)
    case '<=': return Number(answer) <= Number(value)
    case 'contains': return String(answer).toLowerCase().includes(String(value).toLowerCase())
    case 'in': {
      if (Array.isArray(value)) return value.map(String).includes(String(answer))
      return false
    }
    default: return false
  }
}

type GroupResult = { passed: boolean; failedConditions: RuleCondition[] }

function evaluateGroup(group: RuleGroup, answers: Answers): GroupResult {
  const failedConditions: RuleCondition[] = []
  const condResults = (group.conditions ?? []).map((c) => {
    const ok = evaluateCondition(c, answers)
    if (!ok) failedConditions.push(c)
    return ok
  })
  const groupResults = (group.groups ?? []).map((g) => {
    const r = evaluateGroup(g, answers)
    failedConditions.push(...r.failedConditions)
    return r.passed
  })
  const all = [...condResults, ...groupResults]
  if (all.length === 0) return { passed: true, failedConditions: [] }
  const passed = group.operator === 'AND' ? all.every(Boolean) : all.some(Boolean)
  return { passed, failedConditions: passed ? [] : failedConditions }
}

function flattenConditions(group: RuleGroup): RuleCondition[] {
  const out = [...(group.conditions ?? [])]
  for (const g of group.groups ?? []) out.push(...flattenConditions(g))
  return out
}

const STATUS_RANK: Record<EvalStatus, number> = { eligible: 2, warning: 1, ineligible: 0 }

/** Оценить виды ВНЖ страны по ответам клиента. */
export function evaluateResidenceTypes(
  catalog: Pick<ResidenceCatalog, 'residenceTypes' | 'links' | 'rules'>,
  answers: Answers,
  visibleTypeIds?: string[],
): ResidenceEvaluation[] {
  const types = visibleTypeIds
    ? catalog.residenceTypes.filter((t) => visibleTypeIds.includes(t.id))
    : catalog.residenceTypes

  return types.map((rt) => {
    const linkIds = catalog.links.filter((l) => l.residence_type_id === rt.id).map((l) => l.id)
    const rules = catalog.rules.filter((r) => linkIds.includes(r.link_id))

    // нет правил — нечего проверять, считаем подходящим
    if (rules.length === 0) {
      return { residenceTypeId: rt.id, status: 'eligible', score: 100, failedCritical: [], warnings: [] }
    }

    // оценить каждое правило (= процедуру), выбрать лучший статус
    let best: { status: EvalStatus; score: number; failedCritical: string[]; warnings: string[] } | null = null
    for (const rule of rules) {
      const result = evaluateGroup(rule.rule_json, answers)
      const all = flattenConditions(rule.rule_json)
      const passedCount = all.length - result.failedConditions.length
      const score = all.length > 0 ? Math.round((passedCount / all.length) * 100) : 100
      const failedCritical: string[] = []
      const warnings: string[] = []
      if (!result.passed) {
        const name = rule.name_ru || rule.name_en
        if (result.failedConditions.some((c) => c.severity === 'critical')) failedCritical.push(name)
        else warnings.push(name)
      }
      const status: EvalStatus =
        failedCritical.length > 0 ? 'ineligible' : warnings.length > 0 ? 'warning' : 'eligible'
      if (!best || STATUS_RANK[status] > STATUS_RANK[best.status]
        || (STATUS_RANK[status] === STATUS_RANK[best.status] && score > best.score)) {
        best = { status, score, failedCritical, warnings }
      }
    }

    return {
      residenceTypeId: rt.id,
      status: best!.status,
      score: best!.score,
      failedCritical: best!.failedCritical,
      warnings: best!.warnings,
    }
  })
}
