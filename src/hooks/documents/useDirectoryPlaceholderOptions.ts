"use client"

/**
 * useDirectoryPlaceholderOptions — записи справочников для плейсхолдеров,
 * привязанных напрямую к справочнику (source_directory_id).
 *
 * Для каждого такого плейсхолдера возвращает список записей: значение —
 * id записи (custom_directory_entries.id), который сохраняется в
 * placeholder_values, лейбл — «Название записи — значение колонки».
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { customDirectoryKeys } from '@/hooks/queryKeys'
import type { DocumentTemplatePlaceholder } from '@/services/api/documents/documentTemplateService'

export type DirectoryEntryOption = {
  entryId: string
  label: string
}

function columnRawValue(v: {
  value_text: string | null
  value_number: number | null
  value_date: string | null
  value_bool: boolean | null
  value_json: unknown
}): string | null {
  if (v.value_text != null) return v.value_text
  if (v.value_number != null) return String(v.value_number)
  if (v.value_date != null) return v.value_date
  if (v.value_bool != null) return v.value_bool ? 'Да' : 'Нет'
  if (v.value_json != null) {
    return Array.isArray(v.value_json)
      ? v.value_json.join(', ')
      : String(v.value_json).replace(/^"|"$/g, '')
  }
  return null
}

export function useDirectoryPlaceholderOptions(
  placeholders: DocumentTemplatePlaceholder[],
  enabled: boolean,
) {
  // Уникальные пары (directory_id, column) задействованные плейсхолдерами
  const dirPlaceholders = placeholders.filter((p) => p.source_directory_id)
  const directoryIds = Array.from(
    new Set(dirPlaceholders.map((p) => p.source_directory_id!)),
  ).sort()
  const columnIds = Array.from(
    new Set(dirPlaceholders.map((p) => p.directory_field_id).filter(Boolean) as string[]),
  ).sort()

  const cacheKey = `${directoryIds.join(',')}|${columnIds.join(',')}`

  const { data: byKey = {} } = useQuery({
    queryKey: [...customDirectoryKeys.all, 'placeholder-entries', cacheKey],
    queryFn: async () => {
      // Записи нужных справочников
      const { data: entries, error: eErr } = await supabase
        .from('custom_directory_entries')
        .select('id, directory_id, display_name, order_index')
        .in('directory_id', directoryIds)
        .eq('is_archived', false)
        .order('order_index', { ascending: true })
      if (eErr) throw eErr

      const entryIds = (entries ?? []).map((e) => e.id)

      // Значения выбранных колонок (если есть)
      const colValue = new Map<string, string>() // `${entryId}:${fieldId}` → value
      if (entryIds.length > 0 && columnIds.length > 0) {
        const { data: values, error: vErr } = await supabase
          .from('custom_directory_values')
          .select('entry_id, field_id, value_text, value_number, value_date, value_bool, value_json')
          .in('entry_id', entryIds)
          .in('field_id', columnIds)
        if (vErr) throw vErr
        for (const v of values ?? []) {
          const raw = columnRawValue(v)
          if (raw != null) colValue.set(`${v.entry_id}:${v.field_id}`, raw)
        }
      }

      // Для каждого плейсхолдера собираем опции
      const result: Record<string, DirectoryEntryOption[]> = {}
      for (const ph of dirPlaceholders) {
        const dirId = ph.source_directory_id!
        const colId = ph.directory_field_id ?? null
        const list = (entries ?? [])
          .filter((e) => e.directory_id === dirId)
          .map((e) => {
            const name = e.display_name || '(без названия)'
            if (!colId) return { entryId: e.id, label: name }
            const val = colValue.get(`${e.id}:${colId}`) ?? ''
            return { entryId: e.id, label: val ? `${name} — ${val}` : name }
          })
        result[ph.name] = list
      }
      return result
    },
    enabled: enabled && directoryIds.length > 0,
  })

  return byKey as Record<string, DirectoryEntryOption[]>
}
