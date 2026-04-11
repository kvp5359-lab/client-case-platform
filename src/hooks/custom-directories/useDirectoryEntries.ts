"use client"

/**
 * Хук для CRUD операций с записями справочника
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { customDirectoryKeys, STALE_TIME } from '@/hooks/queryKeys'
import type {
  CustomDirectoryField,
  CustomDirectoryValue,
  CustomDirectoryFieldType,
  DirectoryEntryWithValues,
} from '@/types/customDirectories'

/** Определяет, в какую колонку записывать значение по типу поля */
function buildValueRow(
  entryId: string,
  fieldId: string,
  fieldType: CustomDirectoryFieldType,
  value: unknown,
) {
  const base = {
    entry_id: entryId,
    field_id: fieldId,
    value_text: null as string | null,
    value_number: null as number | null,
    value_date: null as string | null,
    value_bool: null as boolean | null,
    value_json: null as unknown as import('@/types/database').Json,
    value_ref: null as string | null,
  }

  switch (fieldType) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'phone':
    case 'url':
      base.value_text = value as string
      break
    case 'number':
      base.value_number = value as number
      break
    case 'date':
      base.value_date = value as string
      break
    case 'checkbox':
      base.value_bool = value as boolean
      break
    case 'select':
    case 'multi_select':
      base.value_json = value as import('@/types/database').Json
      break
    case 'directory_ref':
      base.value_ref = value as string
      break
  }

  return base
}

/** Извлекает значение из строки EAV по типу поля */
export function extractValue(
  val: CustomDirectoryValue,
  fieldType: CustomDirectoryFieldType,
): unknown {
  switch (fieldType) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'phone':
    case 'url':
      return val.value_text ?? ''
    case 'number':
      return val.value_number
    case 'date':
      return val.value_date
    case 'checkbox':
      return val.value_bool ?? false
    case 'select':
    case 'multi_select':
      return val.value_json
    case 'directory_ref':
      return val.value_ref
    default:
      return val.value_text
  }
}

export function useDirectoryEntries(directoryId: string | undefined) {
  const queryClient = useQueryClient()

  // Загружаем записи + их значения за 2 запроса
  const {
    data: entries = [],
    isLoading,
    error,
  } = useQuery<DirectoryEntryWithValues[]>({
    queryKey: customDirectoryKeys.entries(directoryId ?? ''),
    queryFn: async () => {
      // 1. Записи
      const { data: entriesData, error: entriesError } = await supabase
        .from('custom_directory_entries')
        .select('*')
        .eq('directory_id', directoryId!)
        .eq('is_archived', false)
        .order('order_index')
      if (entriesError) throw entriesError
      if (!entriesData?.length) return []

      // 2. Значения для всех записей
      const entryIds = entriesData.map((e) => e.id)
      const { data: valuesData, error: valuesError } = await supabase
        .from('custom_directory_values')
        .select('*')
        .in('entry_id', entryIds)
      if (valuesError) throw valuesError

      // Группируем значения по entry_id → field_id
      const valuesByEntry = new Map<string, Record<string, CustomDirectoryValue>>()
      for (const val of valuesData ?? []) {
        if (!valuesByEntry.has(val.entry_id)) {
          valuesByEntry.set(val.entry_id, {})
        }
        valuesByEntry.get(val.entry_id)![val.field_id] = val
      }

      return entriesData.map((entry) => ({
        ...entry,
        values: valuesByEntry.get(entry.id) ?? {},
      }))
    },
    enabled: !!directoryId,
    staleTime: STALE_TIME.MEDIUM,
  })

  const createEntryMutation = useMutation({
    mutationFn: async (params: {
      fields: CustomDirectoryField[]
      values: Record<string, unknown>
    }) => {
      const primaryField = params.fields.find((f) => f.is_primary)
      const displayName = primaryField ? String(params.values[primaryField.id] ?? '') : ''

      // 1. Создаём запись
      const { data: entry, error: entryError } = await supabase
        .from('custom_directory_entries')
        .insert({
          directory_id: directoryId!,
          display_name: displayName,
          order_index: entries.length,
        })
        .select()
        .single()
      if (entryError) throw entryError

      // 2. Создаём значения полей
      const valueRows = params.fields
        .filter((f) => params.values[f.id] !== undefined && params.values[f.id] !== '')
        .map((f) => buildValueRow(entry.id, f.id, f.field_type, params.values[f.id]))

      if (valueRows.length > 0) {
        const { error: valuesError } = await supabase
          .from('custom_directory_values')
          .insert(valueRows)
        if (valuesError) throw valuesError
      }

      return entry
    },
    onSuccess: () => {
      toast.success('Запись добавлена')
      queryClient.invalidateQueries({ queryKey: customDirectoryKeys.entries(directoryId ?? '') })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать запись')
    },
  })

  const updateEntryMutation = useMutation({
    mutationFn: async (params: {
      entryId: string
      fields: CustomDirectoryField[]
      values: Record<string, unknown>
    }) => {
      const primaryField = params.fields.find((f) => f.is_primary)
      const displayName = primaryField ? String(params.values[primaryField.id] ?? '') : undefined

      // 1. Обновляем display_name
      if (displayName !== undefined) {
        const { error } = await supabase
          .from('custom_directory_entries')
          .update({ display_name: displayName })
          .eq('id', params.entryId)
        if (error) throw error
      }

      // 2. Upsert значений: удаляем старые + вставляем новые
      const { error: deleteError } = await supabase
        .from('custom_directory_values')
        .delete()
        .eq('entry_id', params.entryId)
      if (deleteError) throw deleteError

      const valueRows = params.fields
        .filter((f) => params.values[f.id] !== undefined && params.values[f.id] !== '')
        .map((f) => buildValueRow(params.entryId, f.id, f.field_type, params.values[f.id]))

      if (valueRows.length > 0) {
        const { error: insertError } = await supabase
          .from('custom_directory_values')
          .insert(valueRows)
        if (insertError) throw insertError
      }
    },
    onSuccess: () => {
      toast.success('Запись обновлена')
      queryClient.invalidateQueries({ queryKey: customDirectoryKeys.entries(directoryId ?? '') })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось обновить запись')
    },
  })

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from('custom_directory_entries').delete().eq('id', entryId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Запись удалена')
      queryClient.invalidateQueries({ queryKey: customDirectoryKeys.entries(directoryId ?? '') })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить запись')
    },
  })

  const archiveEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase
        .from('custom_directory_entries')
        .update({ is_archived: true })
        .eq('id', entryId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Запись архивирована')
      queryClient.invalidateQueries({ queryKey: customDirectoryKeys.entries(directoryId ?? '') })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось архивировать запись')
    },
  })

  return {
    entries,
    isLoading,
    error,
    createEntry: createEntryMutation.mutateAsync,
    updateEntry: updateEntryMutation.mutateAsync,
    deleteEntry: deleteEntryMutation.mutateAsync,
    archiveEntry: archiveEntryMutation.mutate,
    isCreating: createEntryMutation.isPending,
    isUpdating: updateEntryMutation.isPending,
  }
}
