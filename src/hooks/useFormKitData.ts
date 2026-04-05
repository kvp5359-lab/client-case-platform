"use client"

/**
 * useFormKitData — хук для загрузки структуры и данных анкеты
 *
 * ВАЖНО: Теперь читает структуру из form_kit_sections и form_kit_fields,
 * а не напрямую из шаблона. Это позволяет анкете быть независимой копией.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type {
  FormKit,
  FormStructure,
  FormData,
  FormSectionWithFields,
  FormField,
  CompositeFieldItem,
  FieldDefinitionSelectOption,
} from '@/components/forms/types'
import { logger } from '@/utils/logger'
import { formKitKeys } from './queryKeys'

type FieldType = Database['public']['Enums']['field_type']

interface UseFormKitDataParams {
  formKitId: string
  /** Загружать ли структуру, значения и compositeItems. Detail (заголовок) грузится всегда. */
  enabled?: boolean
}

export function useFormKitData({ formKitId, enabled: enabledProp = true }: UseFormKitDataParams) {
  const [formData, setFormData] = useState<FormData>({})
  const isFormDataInitialized = useRef(false)

  // Сброс флага инициализации при смене анкеты (Z2-03)
  // Без этого при переключении formKitId данные предыдущей анкеты останутся в formData
  useEffect(() => {
    isFormDataInitialized.current = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on formKitId change
    setFormData({})
  }, [formKitId])

  // Загрузка самой анкеты
  const {
    data: formKit,
    isLoading: formKitLoading,
    error: formKitError,
  } = useQuery({
    queryKey: formKitKeys.detail(formKitId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_kits')
        .select('*')
        .eq('id', formKitId)
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('Анкета не найдена')
      return data as FormKit
    },
    enabled: !!formKitId,
  })

  // Загрузка структуры формы из form_kit_sections и form_kit_fields
  // Оптимизация: template загружается параллельно с sections (через Promise.all),
  // а sections используют nested select для fields вместо 2 отдельных запросов
  const {
    data: structure,
    isLoading: structureLoading,
    error: structureError,
  } = useQuery({
    // Z2-01: включаем template_id в ключ — при смене шаблона структура перезагрузится
    queryKey: [...formKitKeys.structure(formKitId), formKit?.template_id ?? null],
    queryFn: async () => {
      if (!formKit) return null

      // Запускаем загрузку шаблона, секций+полей, шаблонных options и orphan-полей параллельно
      const [templateResult, sectionsResult, templateFieldsResult, orphanFieldsResult] =
        await Promise.all([
          // 1. Загружаем шаблон (для метаданных)
          formKit.template_id
            ? supabase.from('form_templates').select('*').eq('id', formKit.template_id).single()
            : Promise.resolve({ data: null, error: null }),
          // 2. Загружаем секции со статусами и вложенными полями в одном запросе
          supabase
            .from('form_kit_sections')
            .select(
              `
            *,
            status_data:statuses(*),
            form_kit_fields(*)
          `,
            )
            .eq('form_kit_id', formKitId)
            .order('sort_order', { ascending: true })
            .order('sort_order', { ascending: true, referencedTable: 'form_kit_fields' }),
          // 3. Загружаем options из шаблонных полей (headerColor и т.д.)
          formKit.template_id
            ? supabase
                .from('form_template_fields')
                .select('field_definition_id, options')
                .eq('form_template_id', formKit.template_id)
            : Promise.resolve({ data: null, error: null }),
          // 4. Загружаем поля без секции (form_kit_section_id IS NULL)
          supabase
            .from('form_kit_fields')
            .select('*')
            .eq('form_kit_id', formKitId)
            .is('form_kit_section_id', null)
            .order('sort_order', { ascending: true }),
        ])

      // Обработка шаблона
      let template = templateResult.data
      if (!template) {
        logger.warn('Шаблон не найден для анкеты, используется фиктивный объект', {
          formKitId,
          templateId: formKit.template_id,
        })
        template = {
          id: formKit.template_id || formKitId,
          workspace_id: formKit.workspace_id,
          name: formKit.name,
          description: formKit.description,
          slug: null,
          order_index: 0,
          created_at: formKit.created_at || new Date().toISOString(),
          updated_at: formKit.updated_at || new Date().toISOString(),
        }
      }

      // Обработка секций
      if (sectionsResult.error) throw sectionsResult.error
      const kitSections = sectionsResult.data || []

      // Маппинг шаблонных options по field_definition_id (headerColor, defaultRows и т.д.)
      // Используем для дополнения form_kit_fields.options актуальными данными из шаблона
      const templateFieldOptionsMap: Record<string, Record<string, unknown>> = {}
      if (templateFieldsResult.data) {
        for (const tf of templateFieldsResult.data) {
          if (tf.options && typeof tf.options === 'object' && !Array.isArray(tf.options)) {
            const overrides = tf.options as Record<string, unknown>
            if (Object.keys(overrides).length > 0) {
              templateFieldOptionsMap[tf.field_definition_id] = overrides
            }
          }
        }
      }

      // Результат загрузки полей без секции (из Promise.all выше)
      const orphanFieldsRaw = orphanFieldsResult.data

      // Маппинг полей
      // Мержим options: из form_kit_fields + актуальные из шаблона (headerColor и т.д.)
      const mapField = (
        f: (typeof kitSections)[0]['form_kit_fields'][0],
        sectionId: string | null,
      ) => {
        const baseOptions = (f.options ?? {}) as Record<string, unknown>
        const templateOverrides = templateFieldOptionsMap[f.field_definition_id] || {}
        const mergedOptions =
          Object.keys(templateOverrides).length > 0
            ? { ...baseOptions, ...templateOverrides }
            : f.options

        return {
          id: f.id,
          field_definition_id: f.field_definition_id,
          name: f.name,
          field_type: f.field_type as FieldType,
          description: f.description,
          options: mergedOptions,
          placeholder: f.placeholder,
          help_text: f.help_text,
          validation: f.validation,
          created_at: f.created_at || new Date().toISOString(),
          updated_at: f.updated_at || new Date().toISOString(),
          is_required: f.is_required ?? false,
          sort_order: f.sort_order,
          section_id: sectionId,
        } as FormField
      }

      // 3. Группируем поля по секциям (поля уже внутри секций из nested select)
      const sectionsWithFields: FormSectionWithFields[] = kitSections.map((section) => {
        const sectionFields = (
          (section as { form_kit_fields: (typeof kitSections)[0]['form_kit_fields'] })
            .form_kit_fields || []
        ).map((f: (typeof kitSections)[0]['form_kit_fields'][0]) => mapField(f, section.id))

        return {
          id: section.id,
          name: section.name,
          description: section.description,
          fields: sectionFields,
          sort_order: section.sort_order,
          status: section.status,
          status_data:
            'status_data' in section
              ? (section as { status_data: unknown }).status_data || null
              : null,
        } as FormSectionWithFields
      })

      // 4. Добавляем поля без секции (если есть)
      const orphanFields = (orphanFieldsRaw || []).map((f) => mapField(f, null))

      if (orphanFields.length > 0) {
        sectionsWithFields.unshift({
          id: '__no_section__',
          name: 'Общие поля',
          description: null,
          fields: orphanFields,
          sort_order: -1,
        } as FormSectionWithFields)
      }

      return {
        template,
        sections: sectionsWithFields,
      } as FormStructure
    },
    enabled: !!formKit && enabledProp,
  })

  // Загрузка сохранённых значений полей
  // Теперь включаем composite_field_id для составных ключей
  const { data: fieldValues, isLoading: valuesLoading } = useQuery({
    queryKey: formKitKeys.fieldValues(formKitId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_kit_field_values')
        .select('field_definition_id, composite_field_id, value')
        .eq('form_kit_id', formKitId)

      if (error) throw error
      return data || []
    },
    enabled: !!formKitId && enabledProp,
  })

  // Стабильный ключ для поля definition IDs (не пересчитывается при каждом рендере)
  const fieldDefIdsKey = useMemo(
    () =>
      structure?.sections
        .flatMap((s) => s.fields.map((f) => f.field_definition_id))
        .sort()
        .join(',') ?? '',
    [structure],
  )

  // Загрузка composite items и select options параллельно (вместо 2 последовательных запросов)
  const { data: compositeAndOptions, isLoading: compositeAndOptionsLoading } = useQuery({
    queryKey: [...formKitKeys.compositeItems(formKitId), 'with-options', fieldDefIdsKey],
    queryFn: async () => {
      if (!structure)
        return {
          compositeItems: [] as CompositeFieldItem[],
          selectOptionsMap: {} as Record<string, FieldDefinitionSelectOption[]>,
        }

      // Собираем все field_definition_id
      const allFieldDefinitionIds = structure.sections.flatMap((s) =>
        s.fields.map((f) => f.field_definition_id).filter(Boolean),
      )

      if (allFieldDefinitionIds.length === 0) {
        return {
          compositeItems: [] as CompositeFieldItem[],
          selectOptionsMap: {} as Record<string, FieldDefinitionSelectOption[]>,
        }
      }

      // Запускаем оба запроса параллельно
      const [compositeResult, selectResult] = await Promise.all([
        supabase
          .from('field_definition_composite_items')
          .select(
            `
            *,
            nested_field:field_definitions!nested_field_id(*)
          `,
          )
          .in('composite_field_id', allFieldDefinitionIds)
          .order('order_index', { ascending: true }),
        supabase
          .from('field_definition_select_options')
          .select('*')
          .in('field_definition_id', allFieldDefinitionIds)
          .order('order_index', { ascending: true }),
      ])

      if (compositeResult.error) throw compositeResult.error
      const compositeItems = (compositeResult.data || []) as CompositeFieldItem[]

      // Если есть nested fields, нужно дозагрузить select options для них
      const nestedFieldIds = compositeItems.map((item) => item.nested_field_id)
      const missingIds = nestedFieldIds.filter((id) => !allFieldDefinitionIds.includes(id))

      let allSelectOptions = selectResult.data || []
      if (missingIds.length > 0) {
        const { data: nestedOptions } = await supabase
          .from('field_definition_select_options')
          .select('*')
          .in('field_definition_id', missingIds)
          .order('order_index', { ascending: true })
        if (nestedOptions) {
          allSelectOptions = [...allSelectOptions, ...nestedOptions]
        }
      }

      // Группируем по field_definition_id
      const selectOptionsMap: Record<string, FieldDefinitionSelectOption[]> = {}
      allSelectOptions.forEach((option) => {
        if (!selectOptionsMap[option.field_definition_id]) {
          selectOptionsMap[option.field_definition_id] = []
        }
        selectOptionsMap[option.field_definition_id].push(option)
      })

      return { compositeItems, selectOptionsMap }
    },
    enabled: !!structure && enabledProp,
  })

  const compositeItems = compositeAndOptions?.compositeItems ?? []
  const selectOptionsMap = compositeAndOptions?.selectOptionsMap ?? {}

  // Инициализация formData из загруженных значений — только один раз.
  // Повторная инициализация перезаписала бы несохранённые локальные изменения
  // (например, при рефетче React Query после переключения вкладок).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (fieldValues && !isFormDataInitialized.current) {
      isFormDataInitialized.current = true
      const dataMap: FormData = {}
      fieldValues.forEach((fv) => {
        // Если есть composite_field_id — это вложенное поле, используем составной ключ
        if (fv.composite_field_id) {
          const compositeKey = `${fv.composite_field_id}:${fv.field_definition_id}`
          dataMap[compositeKey] = fv.value || ''
        } else {
          // Обычное поле — используем field_definition_id как ключ
          dataMap[fv.field_definition_id] = fv.value || ''
        }
      })
      setFormData(dataMap)
    }
  }, [fieldValues, formKitId])
  /* eslint-enable react-hooks/set-state-in-effect */

  const isLoading =
    formKitLoading || structureLoading || valuesLoading || compositeAndOptionsLoading
  const error = formKitError || structureError

  return {
    formKit,
    structure,
    formData,
    setFormData,
    compositeItems,
    selectOptionsMap,
    isLoading,
    /** Загружается ли сам formKit (detail). Для ленивой загрузки — отделяет от structure/values. */
    formKitLoading,
    error,
  }
}
