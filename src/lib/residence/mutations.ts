'use client'

/**
 * Мутации справочника ВНЖ (Контур 1, Шаг 3) — запись во внешнюю базу `mod_choice`.
 * Пишем напрямую через anon-клиент (RLS внешней базы открыта на запись, как в
 * relostart-админке). ТЕХДОЛГ: перенести запись в Edge + закрыть RLS внешней базы.
 * Гейт на фронте — только владелец воркспейса (useWorkspacePermissions().isOwner).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getResidenceModuleClient } from './moduleClient'
import { treeHasField, updateConditionInTree, addConditionToTree } from './matrix'
import type { FieldType, RuleCondition, ResidenceCatalog } from './types'

const SCHEMA = 'mod_choice'

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

/** Сгенерировать field_key (snake_case латиницей) из русского названия. */
export function toFieldKey(title: string): string {
  const t = title.toLowerCase().trim()
  let out = ''
  for (const ch of t) {
    if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch]
    else if (/[a-z0-9]/.test(ch)) out += ch
    else out += '_'
  }
  return out.replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'kriterij'
}

function useInvalidate(countryId: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['residence', 'catalog', countryId] })
}

export type NewCriterion = {
  title_ru: string
  field_type: FieldType
  group_id: string | null
  options: string[] | null
  is_required: boolean
  is_askable: boolean
  question_ru: string | null
}

export function useCreateCriterion(countryId: string) {
  const invalidate = useInvalidate(countryId)
  return useMutation({
    mutationFn: async (input: NewCriterion) => {
      const sb = getResidenceModuleClient()
      const { error } = await sb.schema(SCHEMA).from('criteria').insert({
        country_id: countryId,
        group_id: input.group_id,
        title_ru: input.title_ru,
        title_en: input.title_ru,
        field_type: input.field_type,
        field_key: toFieldKey(input.title_ru),
        options: input.options,
        reference_type: null,
        hint_ru: '',
        hint_en: '',
        is_required: input.is_required,
        is_askable: input.is_askable,
        question_ru: input.is_askable ? input.question_ru : null,
        question_en: null,
        display_order: 999,
        is_active: true,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/**
 * Обновление критерия. `field_key` НЕ меняем — по нему правила матчатся в rule_json,
 * смена ключа отвяжет критерий от существующих правил.
 */
export function useUpdateCriterion(countryId: string) {
  const invalidate = useInvalidate(countryId)
  return useMutation({
    mutationFn: async (input: NewCriterion & { id: string }) => {
      const sb = getResidenceModuleClient()
      const { error } = await sb.schema(SCHEMA).from('criteria').update({
        title_ru: input.title_ru,
        title_en: input.title_ru,
        field_type: input.field_type,
        group_id: input.group_id,
        options: input.options,
        is_required: input.is_required,
        is_askable: input.is_askable,
        question_ru: input.is_askable ? input.question_ru : null,
      }).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/**
 * Правка условия критерия для конкретного ВНЖ. Обновляет condition во ВСЕХ правилах
 * этого ВНЖ (по всем процедурам — мы их не различаем), где критерий встречается.
 * Новые условия не добавляет — только меняет существующие.
 */
export function useUpdateCondition(countryId: string, catalog: ResidenceCatalog | undefined) {
  const invalidate = useInvalidate(countryId)
  return useMutation({
    mutationFn: async (input: {
      residenceTypeId: string
      field: string
      operator: RuleCondition['operator']
      value: RuleCondition['value']
      severity: RuleCondition['severity']
    }) => {
      if (!catalog) throw new Error('Справочник не загружен')
      const linkIds = catalog.links
        .filter((l) => l.residence_type_id === input.residenceTypeId)
        .map((l) => l.id)
      const rules = catalog.rules.filter((r) => linkIds.includes(r.link_id))
      const patch = { operator: input.operator, value: input.value, severity: input.severity }

      const sb = getResidenceModuleClient()
      let touched = 0
      for (const rule of rules) {
        if (!treeHasField(rule.rule_json, input.field)) continue
        const newJson = updateConditionInTree(rule.rule_json, input.field, patch)
        const { error } = await sb
          .schema(SCHEMA)
          .from('rules')
          .update({ rule_json: newJson })
          .eq('id', rule.id)
        if (error) throw error
        touched++
      }
      if (touched === 0) throw new Error('Условие не найдено в правилах этого ВНЖ')
    },
    onSuccess: invalidate,
  })
}

/**
 * Добавить новое условие критерия для ВНЖ. Кладём в ОСНОВНОЕ правило ВНЖ
 * (первый link по priority), в корневую группу условий. Процедуры не различаем.
 */
export function useAddCondition(countryId: string, catalog: ResidenceCatalog | undefined) {
  const invalidate = useInvalidate(countryId)
  return useMutation({
    mutationFn: async (input: {
      residenceTypeId: string
      field: string
      operator: RuleCondition['operator']
      value: RuleCondition['value']
      severity: RuleCondition['severity']
    }) => {
      if (!catalog) throw new Error('Справочник не загружен')
      const link = catalog.links
        .filter((l) => l.residence_type_id === input.residenceTypeId)
        .sort((a, b) => a.priority - b.priority)[0]
      if (!link) throw new Error('У этого ВНЖ нет связки/правила — добавление пока невозможно')
      const rule = catalog.rules.find((r) => r.link_id === link.id)
      if (!rule) throw new Error('У этого ВНЖ нет правила — добавление пока невозможно')
      if (treeHasField(rule.rule_json, input.field)) {
        throw new Error('Это условие уже есть у ВНЖ — отредактируйте существующее')
      }
      const newJson = addConditionToTree(rule.rule_json, {
        field: input.field,
        operator: input.operator,
        value: input.value,
        severity: input.severity,
      })
      const sb = getResidenceModuleClient()
      const { error } = await sb.schema(SCHEMA).from('rules').update({ rule_json: newJson }).eq('id', rule.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useCreateGroup(countryId: string) {
  const invalidate = useInvalidate(countryId)
  return useMutation({
    mutationFn: async (name_ru: string) => {
      const sb = getResidenceModuleClient()
      const { data, error } = await sb.schema(SCHEMA).from('criteria_groups').insert({
        country_id: countryId,
        name_ru,
        name_en: name_ru,
        display_order: 999,
        is_active: true,
      }).select('id').single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: invalidate,
  })
}

export type NewResidenceType = {
  name_ru: string
  category: 'temporary' | 'permanent' | 'citizenship'
  description_ru: string
}

export function useCreateResidenceType(countryId: string) {
  const invalidate = useInvalidate(countryId)
  return useMutation({
    mutationFn: async (input: NewResidenceType) => {
      const sb = getResidenceModuleClient()
      const { error } = await sb.schema(SCHEMA).from('residence_types').insert({
        country_id: countryId,
        name_ru: input.name_ru,
        name_en: input.name_ru,
        category: input.category,
        description_ru: input.description_ru || null,
        description_en: null,
        is_active: true,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
