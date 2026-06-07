'use client'

/**
 * Мутации справочника ВНЖ (Контур 1, Шаг 3) — запись во внешнюю базу `mod_choice`.
 * Пишем напрямую через anon-клиент (RLS внешней базы открыта на запись, как в
 * relostart-админке). ТЕХДОЛГ: перенести запись в Edge + закрыть RLS внешней базы.
 * Гейт на фронте — только владелец воркспейса (useWorkspacePermissions().isOwner).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getResidenceModuleClient } from './moduleClient'
import type { FieldType } from './types'

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
