/**
 * Хук для работы с полями шаблона анкеты
 */

import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { FormFieldWithDefinition, FieldDefinition } from '../types'

export function useFormFields(templateId: string | undefined) {
  const queryClient = useQueryClient()

  // Загрузка полей шаблона
  const fieldsQuery = useQuery({
    queryKey: ['form-template-fields', templateId],
    queryFn: async () => {
      if (!templateId) return []

      const { data: fields, error } = await supabase
        .from('form_template_fields')
        .select(
          `
          id,
          created_at,
          field_definition_id,
          form_template_id,
          is_required,
          options,
          description,
          form_template_section_id,
          sort_order,
          field_definition:field_definitions(*)
        `,
        )
        .eq('form_template_id', templateId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      // PostgREST join workaround — nested select returns looser type (B-44)
      return (fields || []) as unknown as FormFieldWithDefinition[]
    },
    enabled: !!templateId,
  })

  // Загрузка всех доступных полей
  const availableFieldsQuery = useQuery({
    queryKey: ['field-definitions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_definitions')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      return data as FieldDefinition[]
    },
  })

  // Добавление полей
  const addFieldsMutation = useMutation({
    mutationFn: async ({
      fieldIds,
      targetSectionId,
    }: {
      fieldIds: string[]
      targetSectionId: string | null
    }) => {
      if (!templateId) return

      // Получаем данные полей для копирования description
      const { data: fieldDefinitions } = await supabase
        .from('field_definitions')
        .select('id, description')
        .in('id', fieldIds)

      const fieldDescMap = new Map((fieldDefinitions || []).map((f) => [f.id, f.description]))

      const fields = fieldsQuery.data || []
      const sectionId = typeof targetSectionId === 'string' ? targetSectionId : null
      const fieldsInTargetSection = sectionId
        ? fields.filter((f) => f.form_template_section_id === sectionId)
        : fields.filter((f) => !f.form_template_section_id)

      const maxOrder =
        fieldsInTargetSection.length > 0
          ? Math.max(...fieldsInTargetSection.map((f) => f.sort_order))
          : -1

      const rowsToInsert = fieldIds.map((fieldId, index) => ({
        form_template_id: templateId,
        field_definition_id: fieldId,
        form_template_section_id: sectionId,
        sort_order: maxOrder + 1 + index,
        is_required: false,
        description: fieldDescMap.get(fieldId) || null,
      }))

      const { error } = await supabase.from('form_template_fields').insert(rowsToInsert)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-template-fields', templateId] })
    },
    onError: (error) => {
      logger.error('Ошибка добавления полей:', error)
      toast.error('Не удалось добавить поля')
    },
  })

  // Добавление разделителя
  const addDividerMutation = useMutation({
    mutationFn: async (targetSectionId: string | null) => {
      if (!templateId) return

      // Создаём field_definition типа divider
      const { data: fieldDef, error: defError } = await supabase
        .from('field_definitions')
        .insert({ name: 'Разделитель', field_type: 'divider' as const })
        .select('id')
        .single()
      if (defError) throw defError

      const fields = fieldsQuery.data || []
      const sectionId = typeof targetSectionId === 'string' ? targetSectionId : null
      const fieldsInSection = sectionId
        ? fields.filter((f) => f.form_template_section_id === sectionId)
        : fields.filter((f) => !f.form_template_section_id)
      const maxOrder =
        fieldsInSection.length > 0 ? Math.max(...fieldsInSection.map((f) => f.sort_order)) : -1

      const { error } = await supabase.from('form_template_fields').insert({
        form_template_id: templateId,
        field_definition_id: fieldDef.id,
        form_template_section_id: sectionId,
        sort_order: maxOrder + 1,
        is_required: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-template-fields', templateId] })
      toast.success('Разделитель добавлен')
    },
    onError: (error) => {
      logger.error('Ошибка добавления разделителя:', error)
      toast.error('Не удалось добавить разделитель')
    },
  })

  // Удаление поля
  const removeFieldMutation = useMutation({
    mutationFn: async (formFieldId: string) => {
      const { error } = await supabase.from('form_template_fields').delete().eq('id', formFieldId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-template-fields', templateId] })
    },
    onError: (error) => {
      logger.error('Ошибка удаления поля:', error)
      toast.error('Не удалось удалить поле')
    },
  })

  // Обновление поля
  const updateFieldMutation = useMutation({
    mutationFn: async ({
      fieldId,
      isRequired,
      sectionId,
      description,
      options,
      dividerName,
    }: {
      fieldId: string
      isRequired: boolean
      sectionId: string | null
      description?: string | null
      options?: Record<string, unknown>
      dividerName?: string
    }) => {
      const updateData: Record<string, unknown> = {
        is_required: isRequired,
        form_template_section_id: sectionId,
      }

      if (description !== undefined) {
        updateData.description = description
      }

      if (options !== undefined) {
        updateData.options = options
      }

      const { error } = await supabase
        .from('form_template_fields')
        .update(updateData)
        .eq('id', fieldId)

      if (error) throw error

      // Обновление названия разделителя в field_definitions
      if (dividerName !== undefined) {
        const { data: templateField } = await supabase
          .from('form_template_fields')
          .select('field_definition_id')
          .eq('id', fieldId)
          .single()
        if (templateField) {
          await supabase
            .from('field_definitions')
            .update({ name: dividerName })
            .eq('id', templateField.field_definition_id)
        }
      }

      // Каскадное обновление options в существующих анкетах (form_kit_fields)
      // Best-effort: ошибка каскада не должна провалить основной update
      if (options !== undefined && templateId) {
        try {
          const { data: templateField } = await supabase
            .from('form_template_fields')
            .select('field_definition_id')
            .eq('id', fieldId)
            .single()

          if (templateField) {
            const { data: fieldDef } = await supabase
              .from('field_definitions')
              .select('options')
              .eq('id', templateField.field_definition_id)
              .single()

            const { defaultRows: _defaultRows, ...templateOverrides } = options as Record<
              string,
              unknown
            >
            const baseOptions = (fieldDef?.options ?? {}) as Record<string, unknown>
            const mergedOptions =
              Object.keys(templateOverrides).length > 0
                ? { ...baseOptions, ...templateOverrides }
                : fieldDef?.options

            const { data: formKits } = await supabase
              .from('form_kits')
              .select('id')
              .eq('template_id', templateId)

            if (formKits && formKits.length > 0) {
              const formKitIds = formKits.map((fk) => fk.id)
              await supabase
                .from('form_kit_fields')
                .update({ options: mergedOptions })
                .in('form_kit_id', formKitIds)
                .eq('field_definition_id', templateField.field_definition_id)
            }
          }
        } catch (cascadeErr) {
          logger.error('Ошибка каскадного обновления options в анкетах:', cascadeErr)
          toast.warning('Поле обновлено, но не удалось обновить существующие анкеты')
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-template-fields', templateId] })
    },
    onError: (error) => {
      logger.error('Ошибка обновления поля:', error)
      toast.error('Не удалось обновить поле')
    },
  })

  // Перемещение поля (drag & drop)
  const moveFieldMutation = useMutation({
    mutationFn: async ({
      fieldId,
      newSectionId,
      newSortOrder,
    }: {
      fieldId: string
      newSectionId: string | null
      newSortOrder: number
    }) => {
      const { error } = await supabase
        .from('form_template_fields')
        .update({
          form_template_section_id: newSectionId,
          sort_order: newSortOrder,
        })
        .eq('id', fieldId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-template-fields', templateId] })
    },
    onError: (error) => {
      logger.error('Ошибка перемещения поля:', error)
      toast.error('Не удалось переместить поле')
    },
  })

  // Поля, которые ещё не добавлены
  const fieldsToAdd = useMemo(() => {
    const existingFieldIds = (fieldsQuery.data || []).map((f) => f.field_definition_id)
    return (availableFieldsQuery.data || []).filter((f) => !existingFieldIds.includes(f.id))
  }, [fieldsQuery.data, availableFieldsQuery.data])

  // Группировка полей по секциям
  const groupedFields = useMemo(
    () =>
      (fieldsQuery.data || []).reduce(
        (acc, field) => {
          const sectionId = field.form_template_section_id || 'no-section'
          if (!acc[sectionId]) {
            acc[sectionId] = []
          }
          acc[sectionId].push(field)
          return acc
        },
        {} as Record<string, FormFieldWithDefinition[]>,
      ),
    [fieldsQuery.data],
  )

  return {
    fields: fieldsQuery.data || [],
    isLoading: fieldsQuery.isLoading,
    availableFields: availableFieldsQuery.data || [],
    fieldsToAdd,
    groupedFields,
    addFields: addFieldsMutation.mutate,
    isAddingFields: addFieldsMutation.isPending,
    addDivider: addDividerMutation.mutate,
    removeField: removeFieldMutation.mutate,
    updateField: updateFieldMutation.mutate,
    isUpdatingField: updateFieldMutation.isPending,
    moveField: moveFieldMutation.mutate,
  }
}
