/**
 * Хук формы создания/редактирования определения поля
 *
 * Вся логика состояния и мутаций, вынесенная из FieldDefinitionDialog
 * для соблюдения SRP (B-69)
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FieldType } from '@/components/forms/types'
import type { FieldDefinition, FieldOptions, FieldValidation } from '@/types/formKit'
import { prepareFieldPayload, DEFAULT_TABLE_COLUMNS, type TableColumn } from './field-definition'
import { fromSupabaseJson } from '@/utils/supabaseJson'

interface UseFieldDefinitionFormParams {
  open: boolean
  field: FieldDefinition | null
  onOpenChange: (open: boolean) => void
}

export function useFieldDefinitionForm({
  open,
  field,
  onOpenChange,
}: UseFieldDefinitionFormParams) {
  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [description, setDescription] = useState('')
  const [activeTab, setActiveTab] = useState('description')

  // Для select
  const [selectOptions, setSelectOptions] = useState('')

  // Для валидации
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [step, setStep] = useState('')
  const [minLength, setMinLength] = useState('')
  const [maxLength, setMaxLength] = useState('')
  const [hasUnsavedCompositeChanges, setHasUnsavedCompositeChanges] = useState(false)
  const [savedField, setSavedField] = useState<FieldDefinition | null>(field)

  // Для key-value-table
  const [tableColumns, setTableColumns] = useState<TableColumn[]>(DEFAULT_TABLE_COLUMNS)

  const queryClient = useQueryClient()

  const resetForm = () => {
    setName('')
    setFieldType('text')
    setDescription('')
    setSelectOptions('')
    setMinValue('')
    setMaxValue('')
    setStep('')
    setMinLength('')
    setMaxLength('')
    setTableColumns(DEFAULT_TABLE_COLUMNS)
  }

  // Заполнение формы при открытии или смене field
  useEffect(() => {
    if (!open) return

    if (field) {
      setName(field.name)
      setFieldType(field.field_type)
      setDescription(field.description || '')

      // Если это select, загружаем опции
      if (field.field_type === 'select' && field.options) {
        const opts = fromSupabaseJson<FieldOptions | null>(field.options)
        setSelectOptions(opts?.values?.join('\n') || '')
      }

      // Если это key-value-table, загружаем колонки
      if (field.field_type === 'key-value-table' && field.options) {
        const opts = fromSupabaseJson<FieldOptions | null>(field.options)
        if (opts?.columns && opts.columns.length > 0) {
          setTableColumns(opts.columns)
        }
      }

      // Загружаем валидацию
      if (field.validation) {
        const validation = fromSupabaseJson<FieldValidation>(field.validation)
        setMinValue(validation.min?.toString() || '')
        setMaxValue(validation.max?.toString() || '')
        setStep(validation.step?.toString() || '')
        setMinLength(validation.minLength?.toString() || '')
        setMaxLength(validation.maxLength?.toString() || '')
      }

      setSavedField(null)
    } else {
      // Сброс формы для создания нового поля
      resetForm()
      setSavedField(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при открытии или смене field
  }, [field, open])

  // Мутация создания/обновления
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = prepareFieldPayload({
        name,
        fieldType,
        description,
        selectOptions,
        tableColumns,
        minValue,
        maxValue,
        step,
        minLength,
        maxLength,
      })

      const existingField = field || savedField
      if (existingField) {
        const { error } = await supabase
          .from('field_definitions')
          .update(payload)
          .eq('id', existingField.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('field_definitions').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field-definitions'] })
      onOpenChange(false)
    },
    onError: (error) => {
      logger.error('Ошибка сохранения поля:', error)
      toast.error('Не удалось сохранить поле')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.warning('Введите название поля')
      return
    }

    if (fieldType === 'select' && !savedField && !field) {
      toast.info(
        'Сначала сохраните поле с помощью кнопки "Сохранить", затем добавьте значения списка',
      )
      return
    }

    saveMutation.mutate()
  }

  const handleSaveWithoutClose = async () => {
    if (!name.trim()) {
      toast.warning('Введите название поля')
      return
    }

    const payload = prepareFieldPayload({
      name,
      fieldType,
      description,
      selectOptions,
      tableColumns,
      minValue,
      maxValue,
      step,
      minLength,
      maxLength,
    })

    try {
      const existingField = field || savedField
      if (existingField) {
        const { error } = await supabase
          .from('field_definitions')
          .update(payload)
          .eq('id', existingField.id)
        if (error) throw error
        await queryClient.invalidateQueries({ queryKey: ['field-definitions'] })
      } else {
        const { data, error } = await supabase.from('field_definitions').insert(payload).select()
        if (error) throw error
        if (data && data.length > 0) {
          setSavedField(data[0] as FieldDefinition)
          await queryClient.invalidateQueries({ queryKey: ['field-definitions'] })
        }
      }
      setHasUnsavedCompositeChanges(false)
    } catch {
      toast.error('Ошибка при сохранении поля')
    }
  }

  const handleClose = () => {
    setSavedField(null)
    onOpenChange(false)
  }

  const existingField = field || savedField

  return {
    name,
    setName,
    fieldType,
    setFieldType,
    description,
    setDescription,
    activeTab,
    setActiveTab,
    selectOptions,
    setSelectOptions,
    minValue,
    setMinValue,
    maxValue,
    setMaxValue,
    step,
    setStep,
    minLength,
    setMinLength,
    maxLength,
    setMaxLength,
    tableColumns,
    setTableColumns,
    hasUnsavedCompositeChanges,
    setHasUnsavedCompositeChanges,
    existingField,
    handleSubmit,
    handleSaveWithoutClose,
    handleClose,
    isSaving: saveMutation.isPending,
  }
}
