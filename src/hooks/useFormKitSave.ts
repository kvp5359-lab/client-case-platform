"use client"

/**
 * useFormKitSave — хук для сохранения данных анкеты
 *
 * Поддерживает составные ключи для вложенных полей:
 * - Обычные поля: fieldId = "uuid"
 * - Вложенные поля: fieldId = "compositeFieldId:nestedFieldId"
 */

import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { formKitKeys } from './queryKeys'

interface UseFormKitSaveParams {
  formKitId: string
}

/**
 * Парсит ключ поля и возвращает field_definition_id и composite_field_id
 * Формат составного ключа: "compositeFieldId:nestedFieldId"
 */
function parseFieldKey(fieldKey: string): {
  fieldDefinitionId: string
  compositeFieldId: string | null
} {
  if (fieldKey.includes(':')) {
    const [compositeFieldId, nestedFieldId] = fieldKey.split(':')
    return {
      fieldDefinitionId: nestedFieldId,
      compositeFieldId: compositeFieldId,
    }
  }
  return {
    fieldDefinitionId: fieldKey,
    compositeFieldId: null,
  }
}

/**
 * Строит update-запрос для form_kit_field_values с учётом composite_field_id
 */
function buildFieldUpdateQuery(
  formKitId: string,
  fieldDefinitionId: string,
  compositeFieldId: string | null,
  value: string,
) {
  let query = supabase
    .from('form_kit_field_values')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('form_kit_id', formKitId)
    .eq('field_definition_id', fieldDefinitionId)

  if (compositeFieldId) {
    query = query.eq('composite_field_id', compositeFieldId)
  } else {
    query = query.is('composite_field_id', null)
  }

  return query
}

export function useFormKitSave({ formKitId }: UseFormKitSaveParams) {
  const [saveError, setSaveError] = useState<Error | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const queryClient = useQueryClient()

  // Мутация для сохранения поля
  const saveMutation = useMutation({
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    mutationFn: async ({ fieldId, value }: { fieldId: string; value: string }) => {
      const { fieldDefinitionId, compositeFieldId } = parseFieldKey(fieldId)

      // Стратегия: update-first, insert-on-miss.
      // Сначала пытаемся обновить существующую запись (не генерирует 409 в консоли).
      // Если запись не найдена (0 строк) — вставляем новую.
      const { data: updated, error: updateError } = await buildFieldUpdateQuery(
        formKitId,
        fieldDefinitionId,
        compositeFieldId,
        value,
      ).select('value')
      if (updateError) throw updateError

      if (updated && updated.length > 0) {
        return { serverValue: updated[0].value }
      }

      // Запись не существует — вставляем
      const { data: inserted, error: insertError } = await supabase
        .from('form_kit_field_values')
        .insert({
          form_kit_id: formKitId,
          field_definition_id: fieldDefinitionId,
          composite_field_id: compositeFieldId,
          value,
        })
        .select('value')
        .maybeSingle()

      if (insertError) {
        // Race condition: между update и insert кто-то вставил запись — повторяем update
        if (insertError.code === '23505') {
          const { data: retried, error: retryError } = await buildFieldUpdateQuery(
            formKitId,
            fieldDefinitionId,
            compositeFieldId,
            value,
          ).select('value')
          if (retryError) throw retryError
          return { serverValue: retried?.[0]?.value ?? value }
        }
        throw insertError
      }

      return { serverValue: inserted?.value ?? value }
    },
    onSuccess: (data, variables) => {
      // Оптимистичное обновление кэша fieldValues вместо полной инвалидации (Z2-04).
      // setQueryData обновляет конкретное значение без рефетча всей таблицы.
      // Z2-28: Используем значение из ответа сервера, а не из переданных параметров
      const { fieldId } = variables
      const value = data.serverValue
      const { fieldDefinitionId, compositeFieldId } = parseFieldKey(fieldId)

      type FieldValueRow = {
        field_definition_id: string
        composite_field_id: string | null
        value: string
      }
      queryClient.setQueryData<FieldValueRow[]>(formKitKeys.fieldValues(formKitId), (old) => {
        if (!old) return old
        const idx = old.findIndex(
          (fv) =>
            fv.field_definition_id === fieldDefinitionId &&
            fv.composite_field_id === compositeFieldId,
        )
        if (idx >= 0) {
          const updated = [...old]
          updated[idx] = { ...updated[idx], value }
          return updated
        }
        // Новое значение — добавляем в кэш
        return [
          ...old,
          {
            field_definition_id: fieldDefinitionId,
            composite_field_id: compositeFieldId,
            value,
          },
        ]
      })
      setSaveError(null)
      setLastSaved(new Date())
    },
    onError: (error: Error) => {
      // При ошибке — инвалидируем кэш, чтобы загрузить актуальные данные из БД
      queryClient.invalidateQueries({
        queryKey: formKitKeys.fieldValues(formKitId),
      })
      setSaveError(error)
      toast.error('Ошибка сохранения поля', {
        description: error.message,
      })
    },
  })

  // Дедупликация — не отправляем повторный запрос если значение не изменилось
  const lastSavedValuesRef = useRef<Map<string, string>>(new Map())

  // Сброс при смене formKitId (Z2-30: предотвращает ложную блокировку при copy-анкете)
  useEffect(() => {
    lastSavedValuesRef.current.clear()
  }, [formKitId])

  const saveField = (fieldId: string, value: string, onFieldSaved?: () => void) => {
    // Пропускаем если значение уже сохранено (защита от двойного onBlur / network retry)
    if (lastSavedValuesRef.current.get(fieldId) === value) {
      onFieldSaved?.()
      return
    }
    // Z2-05: записываем в ref только после успешного сохранения, чтобы retry не блокировался
    saveMutation.mutate(
      { fieldId, value },
      {
        onSuccess: () => {
          lastSavedValuesRef.current.set(fieldId, value)
          onFieldSaved?.()
        },
      },
    )
  }

  /** Асинхронная версия — ждёт завершения мутации (для батчевого автозаполнения) */
  const saveFieldAsync = async (fieldId: string, value: string) => {
    const result = await saveMutation.mutateAsync({ fieldId, value })
    lastSavedValuesRef.current.set(fieldId, value)
    return result
  }

  return {
    saveField,
    saveFieldAsync,
    isSaving: saveMutation.isPending,
    saveError,
    lastSaved,
  }
}
