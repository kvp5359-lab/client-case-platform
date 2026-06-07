import { describe, it, expect } from 'vitest'
import { evaluateResidenceTypes, type Answers } from './ruleEvaluator'
import type { ResidenceCatalog, ResidenceType, ResidenceLink, ResidenceRule } from './types'

function rt(id: string): ResidenceType {
  return { id, name_en: id, name_ru: id, category: 'temporary', description_en: null, description_ru: null, country_id: 'c', is_active: true }
}
function link(id: string, typeId: string): ResidenceLink {
  return { id, country_id: 'c', residence_type_id: typeId, procedure_id: 'p', priority: 0, is_active: true }
}
function rule(id: string, linkId: string, json: ResidenceRule['rule_json']): ResidenceRule {
  return { id, link_id: linkId, name_en: 'r', name_ru: 'r', rule_json: json, is_active: true }
}

function cat(types: ResidenceType[], links: ResidenceLink[], rules: ResidenceRule[]): ResidenceCatalog {
  return { residenceTypes: types, groups: [], criteria: [], links, rules }
}

describe('evaluateResidenceTypes', () => {
  it('подходит, когда все критичные условия выполнены', () => {
    const c = cat(
      [rt('A')], [link('l', 'A')],
      [rule('r', 'l', { operator: 'AND', conditions: [
        { field: 'age', operator: '>=', value: 18, severity: 'critical' },
      ] })],
    )
    const res = evaluateResidenceTypes(c, { age: 20 })
    expect(res[0].status).toBe('eligible')
    expect(res[0].score).toBe(100)
  })

  it('не подходит, когда провалено критичное условие', () => {
    const c = cat(
      [rt('A')], [link('l', 'A')],
      [rule('r', 'l', { operator: 'AND', conditions: [
        { field: 'age', operator: '>=', value: 18, severity: 'critical' },
      ] })],
    )
    const res = evaluateResidenceTypes(c, { age: 16 })
    expect(res[0].status).toBe('ineligible')
    expect(res[0].failedCritical).toHaveLength(1)
  })

  it('частично, когда провалено только желательное условие', () => {
    const c = cat(
      [rt('A')], [link('l', 'A')],
      [rule('r', 'l', { operator: 'AND', conditions: [
        { field: 'age', operator: '>=', value: 18, severity: 'critical' },
        { field: 'edu', operator: '=', value: true, severity: 'important' },
      ] })],
    )
    const res = evaluateResidenceTypes(c, { age: 20, edu: false })
    expect(res[0].status).toBe('warning')
    expect(res[0].warnings).toHaveLength(1)
  })

  it('неотвеченное условие считается невыполненным', () => {
    const c = cat(
      [rt('A')], [link('l', 'A')],
      [rule('r', 'l', { operator: 'AND', conditions: [
        { field: 'age', operator: '>=', value: 18, severity: 'critical' },
      ] })],
    )
    const res = evaluateResidenceTypes(c, {} as Answers)
    expect(res[0].status).toBe('ineligible')
  })

  it('берёт ЛУЧШИЙ статус среди нескольких правил (процедур)', () => {
    const c = cat(
      [rt('A')], [link('l1', 'A'), link('l2', 'A')],
      [
        rule('r1', 'l1', { operator: 'AND', conditions: [{ field: 'x', operator: '=', value: true, severity: 'critical' }] }),
        rule('r2', 'l2', { operator: 'AND', conditions: [{ field: 'y', operator: '=', value: true, severity: 'critical' }] }),
      ],
    )
    // x провалено (ineligible), y выполнено (eligible) → ВНЖ берёт eligible
    const res = evaluateResidenceTypes(c, { y: true })
    expect(res[0].status).toBe('eligible')
  })

  it('фильтрует по visibleTypeIds', () => {
    const c = cat([rt('A'), rt('B')], [], [])
    const res = evaluateResidenceTypes(c, {}, ['B'])
    expect(res).toHaveLength(1)
    expect(res[0].residenceTypeId).toBe('B')
  })
})
