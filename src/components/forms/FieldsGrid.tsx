"use client"

/**
 * FieldsGrid — сетка полей формы для FormStepper
 * Раскладывает composite поля на отдельные вложенные поля в одну строку
 * Обычные поля рендерятся в адаптивной сетке (1-3 колонки)
 */

import { memo } from 'react'
import { HelpCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FloatingField } from './FloatingField'
import { SimpleInput } from './SimpleInput'
import { KeyValueTableField } from './KeyValueTableField'
import type { FormField, FormData, CompositeFieldItem, FieldDefinitionSelectOption } from './types'
import type { FieldOptions } from '@/types/formKit'
import { fromSupabaseJson } from '@/utils/supabaseJson'

// Единый стиль заголовков подгрупп (composite, divider, key-value-table)
// Единый wrapper для заголовков подгрупп — всегда отдельный grid-элемент
const SUBHEADING_WRAPPER = 'col-span-full pt-1.5 -mb-1'
const SUBHEADING_TEXT = 'text-sm font-medium text-muted-foreground/70'

// Z2-02: вынесена стабильная функция
const isFilled = (v: string) => v.trim() !== ''

// Z2-06: стабильная ссылка, не создаётся на каждый рендер
const DEFAULT_TABLE_COLUMNS = [
  { name: 'Ключ', type: 'text' as const },
  { name: 'Значение', type: 'text' as const },
]

export interface FieldsGridProps {
  fields: FormField[]
  formData: FormData
  compositeItems: CompositeFieldItem[]
  selectOptionsMap: Record<string, FieldDefinitionSelectOption[]>
  disabled: boolean
  updateField: (fieldId: string, value: string) => void
  saveField: (fieldId: string) => void
  saveFieldWithValue: (fieldId: string, value: string) => void
}

export const FieldsGrid = memo(function FieldsGrid({
  fields,
  formData,
  compositeItems,
  selectOptionsMap,
  disabled,
  updateField,
  saveField,
  saveFieldWithValue,
}: FieldsGridProps) {
  const filteredFields = fields

  // Строим плоский список элементов с метаданными для группировки textarea
  type FieldElement = { type: 'textarea' | 'other'; field: FormField; node: React.ReactNode }
  const fieldElements: FieldElement[] = []

  for (const field of filteredFields) {
    if (field.field_type === 'composite') {
      // Composite — раскладываем на отдельные вложенные поля в одну строку
      const allItems = compositeItems
        .filter((ci) => ci.composite_field_id === field.field_definition_id)
        .sort((a, b) => a.order_index - b.order_index)

      const items = allItems

      if (items.length === 0) continue

      // Заголовок composite — отдельный grid-элемент
      fieldElements.push({
        type: 'other',
        field,
        node: (
          <div key={`${field.id}-heading`} className={SUBHEADING_WRAPPER}>
            <h4 className={SUBHEADING_TEXT}>{field.description || field.name}</h4>
          </div>
        ),
      })
      // Вложенные поля composite — следующий grid-элемент
      fieldElements.push({
        type: 'other',
        field,
        node: (
          <div key={field.id} className="col-span-full flex flex-wrap gap-2">
            {items.map((item) => {
              const nf = item.nested_field
              if (!nf) return null
              const compositeKey = `${field.field_definition_id ?? ''}:${nf.id}`
              const value = formData[compositeKey] || ''

              return (
                <FloatingField
                  key={compositeKey}
                  label={nf.name}
                  isRequired={nf.is_required}
                  description={nf.description}
                  isFilled={isFilled(value)}
                  labelInset={nf.field_type === 'date' ? 24 : undefined}
                  className="flex-1 min-w-[180px]"
                  onClear={
                    nf.field_type !== 'select'
                      ? () => {
                          updateField(compositeKey, '')
                          saveFieldWithValue(compositeKey, '')
                        }
                      : undefined
                  }
                >
                  {() => (
                    <SimpleInput
                      fieldType={nf.field_type}
                      value={value}
                      disabled={disabled}
                      onChange={(v) => updateField(compositeKey, v)}
                      onBlur={() => saveField(compositeKey)}
                      onSaveWithValue={(v) => saveFieldWithValue(compositeKey, v)}
                      selectOptions={selectOptionsMap[nf.id] || []}
                    />
                  )}
                </FloatingField>
              )
            })}
          </div>
        ),
      })
    } else if (field.field_type === 'key-value-table') {
      // Табличное поле — рендерим без FloatingField (таблица не влезает в h-12)
      const fieldKey = field.field_definition_id ?? ''
      const value = formData[fieldKey] || ''
      const fieldOptions = fromSupabaseJson<FieldOptions | null>(field.options)
      const tableColumns = fieldOptions?.columns || DEFAULT_TABLE_COLUMNS
      const tableHeaderColor = fieldOptions?.headerColor

      // Заголовок таблицы — отдельный grid-элемент
      fieldElements.push({
        type: 'other',
        field,
        node: (
          <div key={`${field.id}-heading`} className={SUBHEADING_WRAPPER}>
            <div className="flex items-center gap-1.5">
              <span className={SUBHEADING_TEXT}>{field.name}</span>
              {field.is_required && <span className="text-destructive text-sm">*</span>}
              {field.description && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      aria-label={`Описание поля «${field.name}»`}
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto max-w-sm" align="start">
                    <p className="text-sm text-muted-foreground">{field.description}</p>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        ),
      })
      // Таблица — следующий grid-элемент
      fieldElements.push({
        type: 'other',
        field,
        node: (
          <div key={field.id} className="col-span-full">
            <KeyValueTableField
              value={value}
              onChange={(v) => updateField(fieldKey, v)}
              onBlur={() => saveField(fieldKey)}
              columns={tableColumns}
              headerColor={tableHeaderColor}
              disabled={disabled}
            />
          </div>
        ),
      })
    } else if (field.field_type === 'divider') {
      // Разделитель — визуальный заголовок подгруппы, без данных
      fieldElements.push({
        type: 'other',
        field,
        node: (
          <div key={field.id} className={SUBHEADING_WRAPPER}>
            <h4 className={SUBHEADING_TEXT}>{field.name}</h4>
          </div>
        ),
      })
    } else {
      // Обычное поле — используем field_definition_id как ключ (совпадает с ключами в formData)
      const fieldKey = field.field_definition_id ?? ''
      const value = formData[fieldKey] || ''
      const isTextarea = field.field_type === 'textarea'

      fieldElements.push({
        type: isTextarea ? 'textarea' : 'other',
        field,
        node: (
          <FloatingField
            key={field.id}
            label={field.name}
            isRequired={field.is_required}
            description={field.description}
            isFilled={isFilled(value)}
            multiline={isTextarea}
            labelInset={field.field_type === 'date' ? 24 : undefined}
            onClear={
              field.field_type !== 'select'
                ? () => {
                    updateField(fieldKey, '')
                    saveFieldWithValue(fieldKey, '')
                  }
                : undefined
            }
          >
            {() => (
              <SimpleInput
                fieldType={field.field_type}
                value={value}
                disabled={disabled}
                onChange={(v) => updateField(fieldKey, v)}
                onBlur={() => saveField(fieldKey)}
                onSaveWithValue={(v) => saveFieldWithValue(fieldKey, v)}
                selectOptions={selectOptionsMap[fieldKey] || []}
              />
            )}
          </FloatingField>
        ),
      })
    }
  }

  // Группируем подряд идущие textarea в двухколоночные блоки
  const elements: React.ReactNode[] = []
  let i = 0
  while (i < fieldElements.length) {
    const el = fieldElements[i]
    if (el.type === 'textarea') {
      // Собираем подряд идущие textarea
      const group: FieldElement[] = []
      while (i < fieldElements.length && fieldElements[i].type === 'textarea') {
        group.push(fieldElements[i])
        i++
      }
      // Оборачиваем группу в двухколоночную сетку
      elements.push(
        <div
          key={`textarea-group-${group[0].field.id}`}
          className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-2"
        >
          {group.map((g) => g.node)}
        </div>,
      )
    } else {
      elements.push(el.node)
      i++
    }
  }

  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">{elements}</div>
})
