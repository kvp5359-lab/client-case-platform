/**
 * Типы внешней базы ВНЖ (схема `mod_choice`).
 * Портировано из relostart `types/database.ts` (блок «MigChoice Types»).
 * Берём только то, что нужно client-case (без sessions/selections — это аналитика migchoice.com).
 */

export type FieldType = 'number' | 'boolean' | 'reference' | 'text'
export type ResidenceTypeCategory = 'temporary' | 'permanent' | 'citizenship'

export type ResidenceCountry = {
  id: string
  name_en: string
  name_ru: string
  code: string
  slug: string
  flag_url: string | null
  is_active: boolean
}

export type ResidenceType = {
  id: string
  name_en: string
  name_ru: string
  category: ResidenceTypeCategory
  description_en: string | null
  description_ru: string | null
  country_id: string
  is_active: boolean
}

export type ResidenceCriteriaGroup = {
  id: string
  name_en: string
  name_ru: string
  display_order: number
  country_id: string | null
  is_active: boolean
}

export type ResidenceCriterion = {
  id: string
  title_en: string
  title_ru: string
  field_type: FieldType
  field_key: string
  options: string[] | null
  reference_type: string | null
  hint_en: string | null
  hint_ru: string | null
  is_required: boolean
  display_order: number
  group_id: string | null
  country_id: string
  is_active: boolean
}

export type ResidenceLink = {
  id: string
  country_id: string
  residence_type_id: string
  procedure_id: string
  priority: number
  is_active: boolean
}

export type RuleCondition = {
  field: string
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'in'
  value: string | number | boolean | string[]
  severity?: 'critical' | 'important'
}

export type RuleGroup = {
  operator: 'AND' | 'OR'
  conditions?: RuleCondition[]
  groups?: RuleGroup[]
}

export type ResidenceRule = {
  id: string
  link_id: string
  name_en: string
  name_ru: string
  rule_json: RuleGroup
  is_active: boolean
}

/** Всё, что грузим для одной страны (Контур 1 — матрица). */
export type ResidenceCatalog = {
  residenceTypes: ResidenceType[]
  groups: ResidenceCriteriaGroup[]
  criteria: ResidenceCriterion[]
  links: ResidenceLink[]
  rules: ResidenceRule[]
}
