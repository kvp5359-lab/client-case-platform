"use client"

/**
 * Hook для автозаполнения анкеты из документа
 * Обрабатывает извлечённые данные и применяет их к полям формы
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import type { FormStructure, CompositeFieldItem } from '@/components/forms/types'

interface UseFormKitAutoFillProps {
  structure: FormStructure | null | undefined
  formData: Record<string, string>
  compositeItems: CompositeFieldItem[]
  saveFieldAsync: (fieldId: string, value: string) => Promise<{ serverValue: string }>
  setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setOriginalValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

/**
 * Находит совпадающий ключ в извлечённых данных для вложенного поля
 */
function findMatchingKey(
  nestedFieldName: string,
  nestedValues: Record<string, string | number | boolean | null>,
): string | null {
  const nestedFieldNameLower = nestedFieldName.toLowerCase()

  // Точное совпадение
  if (nestedFieldName in nestedValues) {
    return nestedFieldName
  }

  // Ищем ключ с частичным совпадением или синонимами
  return (
    Object.keys(nestedValues).find((key) => {
      const keyLower = key.toLowerCase()

      // Частичное совпадение (игнорируя регистр)
      if (keyLower.includes(nestedFieldNameLower) || nestedFieldNameLower.includes(keyLower)) {
        return true
      }

      // Синонимы для распространённых полей:

      // Имена
      if (
        (keyLower === 'name' || keyLower === 'firstname' || keyLower === 'first_name') &&
        nestedFieldNameLower.includes('имя') &&
        !nestedFieldNameLower.includes('фамилия')
      ) {
        return true
      }
      if (
        (keyLower === 'surname' || keyLower === 'lastname' || keyLower === 'last_name') &&
        nestedFieldNameLower.includes('фамилия')
      ) {
        return true
      }

      // Адреса
      if (keyLower === 'address' && nestedFieldNameLower.includes('адрес')) return true
      if (keyLower === 'street' && nestedFieldNameLower.includes('улица')) return true
      if (keyLower === 'city' && nestedFieldNameLower.includes('город')) return true
      if (keyLower === 'country' && nestedFieldNameLower.includes('страна')) return true
      if (
        keyLower === 'region' &&
        (nestedFieldNameLower.includes('провинция') || nestedFieldNameLower.includes('регион'))
      ) {
        return true
      }
      if (keyLower === 'postal_code' && nestedFieldNameLower.includes('индекс')) return true

      // Контакты
      if (keyLower === 'phone' && nestedFieldNameLower.includes('телефон')) return true
      if (keyLower === 'email' && nestedFieldNameLower.includes('имейл')) return true

      // Номера документов
      if (
        (keyLower === 'number' || keyLower === 'value') &&
        nestedFieldNameLower.includes('номер')
      ) {
        return true
      }
      if (
        (keyLower === 'tie' || keyLower === 'nie') &&
        nestedFieldNameLower.includes('номер') &&
        (nestedFieldNameLower.includes('tie') || nestedFieldNameLower.includes('nie'))
      ) {
        return true
      }

      return false
    }) || null
  )
}

/**
 * Валидирует значение для типа поля
 */
function validateFieldValue(value: unknown, fieldType: string, fieldNameLower: string): boolean {
  const valueStr = String(value)

  // Для дат проверяем формат (YYYY-MM-DD или DD-MM-YYYY или DD/MM/YYYY)
  if (fieldType === 'date') {
    const datePattern = /^\d{2,4}[-/]\d{1,2}[-/]\d{2,4}$/
    return datePattern.test(valueStr)
  }

  // Для номеров (text поля с "номер" в названии) - не должны быть датами
  if (fieldType === 'text' && fieldNameLower.includes('номер')) {
    // Проверяем, что это не дата (не содержит - или /)
    return !/^\d{2,4}[-/]/.test(valueStr)
  }

  return true
}

export function useFormKitAutoFill({
  structure,
  formData,
  compositeItems,
  saveFieldAsync,
  setFormData,
  setOriginalValues,
}: UseFormKitAutoFillProps) {
  /**
   * Обработка автозаполнения из документа
   */
  const handleAutoFillApply = useCallback(
    async (extractedData: Record<string, string>) => {
      if (!structure) return

      const updates: Array<{ fieldId: string; value: string; fieldName: string }> = []

      // Собираем все поля из всех секций
      structure.sections.forEach((section) => {
        section.fields.forEach((field) => {
          if (!field.field_definition_id) return
          const rawValue = extractedData[field.field_definition_id]

          if (!rawValue) return

          // Если это составное поле И значение - JSON объект
          if (
            field.field_type === 'composite' &&
            typeof rawValue === 'string' &&
            rawValue.startsWith('{')
          ) {
            try {
              const parsed = JSON.parse(rawValue)
              if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return
              const nestedValues = parsed as Record<string, string | number | boolean | null>

              // Ищем compositeItems для этого поля
              const items =
                compositeItems?.filter(
                  (ci) => ci.composite_field_id === field.field_definition_id,
                ) || []

              // Для каждого вложенного поля ищем значение по имени в nestedValues
              items.forEach((item) => {
                const nestedFieldName = item.nested_field.name
                const nestedFieldNameLower = nestedFieldName.toLowerCase()

                // Ищем значение по точному совпадению, затем по синонимам
                const matchingKey = findMatchingKey(nestedFieldName, nestedValues)
                const nestedValue = matchingKey ? nestedValues[matchingKey] : null

                if (nestedValue !== null && nestedValue !== undefined) {
                  // Валидация типа поля
                  const isValid = validateFieldValue(
                    nestedValue,
                    item.nested_field.field_type,
                    nestedFieldNameLower,
                  )

                  if (!isValid) {
                    return // Пропускаем
                  }

                  // Формируем составной ключ: compositeFieldId:nestedFieldDefinitionId
                  const compositeKey = `${field.field_definition_id}:${item.nested_field.id}`
                  const currentValue = formData[compositeKey]

                  // Пропускаем уже заполненные поля
                  if (!currentValue || currentValue.trim() === '') {
                    updates.push({
                      fieldId: compositeKey,
                      value: String(nestedValue),
                      fieldName: `${field.name} → ${nestedFieldName}`,
                    })
                  }
                }
              })
            } catch {
              logger.warn('Failed to parse composite field value:', field.name)
            }
          } else {
            // Обычное поле
            const currentValue = formData[field.field_definition_id]

            // Пропускаем уже заполненные поля
            if (!currentValue || currentValue.trim() === '') {
              updates.push({
                fieldId: field.field_definition_id,
                value: String(rawValue),
                fieldName: field.name,
              })
            }
          }
        })
      })

      // Применяем обновления батчем — сначала обновляем состояние, потом сохраняем
      if (updates.length === 0) return

      const dataUpdates: Record<string, string> = {}
      for (const { fieldId, value } of updates) {
        dataUpdates[fieldId] = value
      }

      // Обновляем UI-состояние один раз (батч)
      setFormData((prev) => ({ ...prev, ...dataUpdates }))

      // Z2-13: Сохраняем в БД параллельно для ускорения
      const results = await Promise.allSettled(
        updates.map(({ fieldId, value }) => saveFieldAsync(fieldId, value)),
      )
      let savedCount = 0
      const errors: string[] = []
      const savedUpdates: Record<string, string> = {}
      results.forEach((result, i) => {
        const { fieldId, value, fieldName } = updates[i]
        if (result.status === 'fulfilled') {
          savedCount++
          savedUpdates[fieldId] = value
        } else {
          logger.error(`AutoFill: failed to save field ${fieldName}:`, result.reason)
          errors.push(fieldName)
        }
      })

      // Обновляем originalValues только для успешно сохранённых полей
      if (savedCount > 0) {
        setOriginalValues((prev) => ({ ...prev, ...savedUpdates }))
      }

      if (errors.length > 0) {
        toast.warning(
          `Сохранено ${savedCount} из ${updates.length} полей. Не удалось: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? ` и ещё ${errors.length - 3}` : ''}`,
        )
      }
    },
    [structure, formData, compositeItems, saveFieldAsync, setFormData, setOriginalValues],
  )

  return {
    handleAutoFillApply,
  }
}
