"use client"

/**
 * Хук для CRUD операций с полями справочника
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { customDirectoryKeys, STALE_TIME } from '@/hooks/queryKeys'
import { safeFetchOrThrow, safeInsertOrThrow, safeUpdateVoidOrThrow, safeDeleteOrThrow } from '@/services/supabase/queryHelpers'
import type {
  CustomDirectoryField,
  CustomDirectoryFieldInsert,
  CustomDirectoryFieldUpdate,
  CustomDirectoryFieldType,
  DirectoryFieldOptions,
} from '@/types/customDirectories'

export function useDirectoryFields(directoryId: string | undefined) {
  const queryClient = useQueryClient()

  const {
    data: fields = [],
    isLoading,
    error,
  } = useQuery<CustomDirectoryField[]>({
    queryKey: customDirectoryKeys.fields(directoryId ?? ''),
    queryFn: () =>
      safeFetchOrThrow<CustomDirectoryField[]>(
        supabase.from('custom_directory_fields').select('*').eq('directory_id', directoryId!).order('order_index'),
        'Не удалось загрузить поля справочника',
      ),
    enabled: !!directoryId,
    staleTime: STALE_TIME.LONG,
  })

  const createFieldMutation = useMutation({
    mutationFn: async (input: {
      name: string
      field_type: CustomDirectoryFieldType
      is_primary?: boolean
      is_required?: boolean
      is_unique?: boolean
      is_visible_in_list?: boolean
      options?: DirectoryFieldOptions
    }) => {
      const insert: CustomDirectoryFieldInsert = {
        directory_id: directoryId!,
        name: input.name.trim(),
        field_type: input.field_type,
        is_primary: input.is_primary ?? false,
        is_required: input.is_required ?? false,
        is_unique: input.is_unique ?? false,
        is_visible_in_list: input.is_visible_in_list ?? true,
        options: (input.options ?? {}) as import('@/types/database').Json,
        order_index: fields.length,
      }
      return safeInsertOrThrow<CustomDirectoryField>(
        supabase.from('custom_directory_fields').insert(insert).select().single(),
        'Не удалось добавить поле',
      )
    },
    onSuccess: () => {
      toast.success('Поле добавлено')
      queryClient.invalidateQueries({ queryKey: customDirectoryKeys.fields(directoryId ?? '') })
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Не удалось добавить поле'
      if (msg.includes('idx_custom_directory_fields_one_primary')) {
        toast.error('Первичное поле уже задано. Справочник может иметь только одно первичное поле.')
      } else {
        toast.error(msg)
      }
    },
  })

  const updateFieldMutation = useMutation({
    mutationFn: async (params: { id: string; data: CustomDirectoryFieldUpdate }) => {
      await safeUpdateVoidOrThrow(
        supabase.from('custom_directory_fields').update(params.data).eq('id', params.id),
        'Не удалось обновить поле',
      )
    },
    onSuccess: () => {
      toast.success('Поле обновлено')
      queryClient.invalidateQueries({ queryKey: customDirectoryKeys.fields(directoryId ?? '') })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось обновить поле')
    },
  })

  const deleteFieldMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      await safeDeleteOrThrow(
        supabase.from('custom_directory_fields').delete().eq('id', fieldId),
        'Не удалось удалить поле',
      )
    },
    onSuccess: () => {
      toast.success('Поле удалено')
      queryClient.invalidateQueries({ queryKey: customDirectoryKeys.fields(directoryId ?? '') })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить поле')
    },
  })

  const reorderFieldsMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        supabase.from('custom_directory_fields').update({ order_index: index }).eq('id', id),
      )
      await Promise.all(updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customDirectoryKeys.fields(directoryId ?? '') })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить порядок полей')
    },
  })

  return {
    fields,
    isLoading,
    error,
    createField: createFieldMutation.mutateAsync,
    updateField: updateFieldMutation.mutate,
    deleteField: deleteFieldMutation.mutateAsync,
    reorderFields: reorderFieldsMutation.mutate,
    isCreatingField: createFieldMutation.isPending,
  }
}
