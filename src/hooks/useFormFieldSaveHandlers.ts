"use client"

/**
 * useFormFieldSaveHandlers — общая логика сохранения полей формы
 *
 * Устраняет дублирование между FormKitView и FormStepper:
 * - Инициализация originalValues при первой загрузке
 * - handleSaveField (по onBlur)
 * - handleSaveFieldWithValue (для date/checkbox)
 * - updateField (без сохранения)
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import type { FormData } from '@/components/forms/types'

interface UseFormFieldSaveHandlersParams {
  formKitId: string
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  saveField: (fieldId: string, value: string, onFieldSaved?: () => void) => void
  canFillForms: boolean
}

export function useFormFieldSaveHandlers({
  formKitId,
  formData,
  setFormData,
  saveField,
  canFillForms,
}: UseFormFieldSaveHandlersParams) {
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({})
  const isInitialized = useRef(false)

  // Актуальные значения для cleanup при размонтировании
  const formDataRef = useRef(formData)
  const originalValuesRef = useRef(originalValues)
  const saveFieldRef = useRef(saveField)
  const canFillFormsRef = useRef(canFillForms)

  useEffect(() => {
    formDataRef.current = formData
  }, [formData])
  useEffect(() => {
    originalValuesRef.current = originalValues
  }, [originalValues])
  useEffect(() => {
    saveFieldRef.current = saveField
  }, [saveField])
  useEffect(() => {
    canFillFormsRef.current = canFillForms
  }, [canFillForms])

  // Z2-10: Сброс при смене анкеты — иначе originalValues остаётся от предыдущей
  // Запоминаем исходные значения при первой загрузке formData
  /* eslint-disable react-hooks/set-state-in-effect -- Z2-10: сброс originalValues при смене formKitId необходим для корректной инициализации */
  useEffect(() => {
    isInitialized.current = false
    setOriginalValues({})
  }, [formKitId])
  useEffect(() => {
    if (Object.keys(formData).length > 0 && !isInitialized.current) {
      isInitialized.current = true
      setOriginalValues({ ...formData })
    }
  }, [formData])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Функция сохранения всех изменённых полей (используется в нескольких местах)
  const saveAllDirtyFields = useCallback(() => {
    if (!canFillFormsRef.current) return
    const current = formDataRef.current
    const original = originalValuesRef.current
    const dirty: Record<string, string> = {}
    Object.keys(current).forEach((fieldId) => {
      const value = current[fieldId] || ''
      const originalValue = original[fieldId] || ''
      if (value !== originalValue) {
        dirty[fieldId] = value
      }
    })
    if (Object.keys(dirty).length === 0) return
    Object.entries(dirty).forEach(([fieldId, value]) => {
      saveFieldRef.current(fieldId, value, () => {
        setOriginalValues((prev) => ({ ...prev, [fieldId]: value }))
      })
    })
  }, [])

  // Сохраняем все несохранённые изменения при размонтировании компонента
  // (например, при переключении вкладок страницы)
  useEffect(() => {
    return () => {
      saveAllDirtyFields()
    }
  }, [saveAllDirtyFields])

  // Z2-12: Автосохранение каждую минуту — страховка от закрытия вкладки.
  // formKitId в deps: при смене анкеты интервал пересоздаётся,
  // а cleanup сохраняет несохранённые данные предыдущей формы.
  useEffect(() => {
    const interval = setInterval(() => {
      saveAllDirtyFields()
    }, 60_000)
    return () => {
      clearInterval(interval)
      saveAllDirtyFields()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveAllDirtyFields, formKitId])

  // Z2-01: Сохранение при скрытии/закрытии вкладки
  // visibilitychange + 'hidden' надёжнее beforeunload: браузер не убивает fetch сразу,
  // а даёт время на завершение запросов при переключении/закрытии вкладки
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveAllDirtyFields()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [saveAllDirtyFields])

  // Обновление поля без сохранения
  const updateField = useCallback(
    (fieldId: string, value: string) => {
      setFormData((prev) => ({ ...prev, [fieldId]: value }))
    },
    [setFormData],
  )

  // Сохранение поля по onBlur — сравнивает с original
  // Используем refs вместо замыкания на formData/originalValues/saveField/canFillForms,
  // чтобы избежать stale closure (Z2-02) и лишних ре-рендеров FieldsGrid (Z2-06)
  const handleSaveField = useCallback((fieldId: string) => {
    if (!canFillFormsRef.current) {
      toast.error('Нет прав на заполнение анкет')
      return
    }
    const value = formDataRef.current[fieldId] || ''
    const originalValue = originalValuesRef.current[fieldId] || ''
    if (value !== originalValue) {
      saveFieldRef.current(fieldId, value, () => {
        setOriginalValues((prev) => ({ ...prev, [fieldId]: value }))
      })
    }
  }, [])

  // Сохранение поля с прямым значением (для date, checkbox)
  // Аналогично handleSaveField — используем refs для стабильной ссылки
  const handleSaveFieldWithValue = useCallback((fieldId: string, value: string) => {
    if (!canFillFormsRef.current) {
      toast.error('Нет прав на заполнение анкет')
      return
    }
    const originalValue = originalValuesRef.current[fieldId] || ''
    if (value !== originalValue) {
      saveFieldRef.current(fieldId, value, () => {
        setOriginalValues((prev) => ({ ...prev, [fieldId]: value }))
      })
    }
  }, [])

  return {
    originalValues,
    setOriginalValues,
    updateField,
    handleSaveField,
    handleSaveFieldWithValue,
  }
}
