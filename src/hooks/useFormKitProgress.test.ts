/**
 * Тесты для useFormKitProgress — расчёт прогресса заполнения анкеты
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  getSectionProgress,
  getSectionRequiredStatus,
  useFormKitProgress,
} from './useFormKitProgress'
import type {
  FormSectionWithFields,
  FormData,
  CompositeFieldItem,
  FieldType,
  FormTemplate,
} from '@/components/forms/types'

// Хелпер для создания секции с полями
function makeSection(
  fields: Array<{
    field_definition_id: string
    field_type: string
    is_required?: boolean
  }>,
): FormSectionWithFields {
  return {
    id: 'section-1',
    name: 'Test Section',
    description: null,
    sort_order: 0,
    fields: fields.map((f) => ({
      id: f.field_definition_id,
      field_definition_id: f.field_definition_id,
      field_type: f.field_type as FieldType,
      is_required: f.is_required ?? false,
      sort_order: 0,
      section_id: 'section-1',
      name: 'Field',
      created_at: '',
      updated_at: '',
      description: null,
      help_text: null,
      options: null,
      placeholder: null,
      validation: null,
    })),
  }
}

// Хелпер для создания composite items
function makeCompositeItem(
  compositeFieldId: string,
  nestedFieldId: string,
  isRequired = false,
): CompositeFieldItem {
  return {
    id: `ci-${nestedFieldId}`,
    composite_field_id: compositeFieldId,
    nested_field_id: nestedFieldId,
    order_index: 0,
    nested_field: {
      id: nestedFieldId,
      field_definition_id: nestedFieldId,
      field_type: 'text' as FieldType,
      is_required: isRequired,
      sort_order: 0,
      section_id: null,
      name: 'Nested Field',
      created_at: '',
      updated_at: '',
      description: null,
      help_text: null,
      options: null,
      placeholder: null,
      validation: null,
    },
  }
}

describe('getSectionProgress', () => {
  it('должен вернуть isComplete: true когда все обычные поля заполнены', () => {
    const section = makeSection([
      { field_definition_id: 'f1', field_type: 'text' },
      { field_definition_id: 'f2', field_type: 'text' },
    ])
    const formData: FormData = { f1: 'значение', f2: 'значение' }

    const result = getSectionProgress(section, formData)

    expect(result.isComplete).toBe(true)
    expect(result.total).toBe(2)
    expect(result.filled).toBe(2)
  })

  it('должен вернуть filled: 0 когда ни одно поле не заполнено', () => {
    const section = makeSection([
      { field_definition_id: 'f1', field_type: 'text' },
      { field_definition_id: 'f2', field_type: 'text' },
    ])
    const formData: FormData = {}

    const result = getSectionProgress(section, formData)

    expect(result.filled).toBe(0)
    expect(result.total).toBe(2)
    expect(result.isComplete).toBe(false)
  })

  it('должен учитывать вложенные поля composite fields', () => {
    const section = makeSection([{ field_definition_id: 'comp1', field_type: 'composite' }])
    const compositeItems: CompositeFieldItem[] = [
      makeCompositeItem('comp1', 'n1'),
      makeCompositeItem('comp1', 'n2'),
    ]
    const formData: FormData = { 'comp1:n1': 'val', 'comp1:n2': 'val' }

    const result = getSectionProgress(section, formData, compositeItems)

    expect(result.total).toBe(2)
    expect(result.filled).toBe(2)
    expect(result.isComplete).toBe(true)
  })

  it('должен считать whitespace-only значения пустыми', () => {
    const section = makeSection([
      { field_definition_id: 'f1', field_type: 'text' },
      { field_definition_id: 'f2', field_type: 'text' },
    ])
    const formData: FormData = { f1: '   ', f2: '\t\n' }

    const result = getSectionProgress(section, formData)

    expect(result.filled).toBe(0)
    expect(result.isComplete).toBe(false)
  })

  it('должен вернуть isComplete: false для пустой секции (total=0)', () => {
    const section = makeSection([])
    const formData: FormData = {}

    const result = getSectionProgress(section, formData)

    expect(result.total).toBe(0)
    expect(result.filled).toBe(0)
    expect(result.isComplete).toBe(false)
  })
})

describe('getSectionRequiredStatus', () => {
  it('должен вернуть "complete" когда все обязательные поля заполнены', () => {
    const section = makeSection([
      { field_definition_id: 'f1', field_type: 'text', is_required: true },
      { field_definition_id: 'f2', field_type: 'text', is_required: true },
    ])
    const formData: FormData = { f1: 'val', f2: 'val' }

    expect(getSectionRequiredStatus(section, formData)).toBe('complete')
  })

  it('должен вернуть "in_progress" когда часть обязательных заполнена', () => {
    const section = makeSection([
      { field_definition_id: 'f1', field_type: 'text', is_required: true },
      { field_definition_id: 'f2', field_type: 'text', is_required: true },
    ])
    const formData: FormData = { f1: 'val' }

    expect(getSectionRequiredStatus(section, formData)).toBe('in_progress')
  })

  it('должен вернуть "empty" когда ни одно обязательное не заполнено', () => {
    const section = makeSection([
      { field_definition_id: 'f1', field_type: 'text', is_required: true },
      { field_definition_id: 'f2', field_type: 'text', is_required: true },
    ])
    const formData: FormData = {}

    expect(getSectionRequiredStatus(section, formData)).toBe('empty')
  })

  it('должен считать по всем полям если обязательных нет, и все заполнены', () => {
    const section = makeSection([
      { field_definition_id: 'f1', field_type: 'text', is_required: false },
      { field_definition_id: 'f2', field_type: 'text', is_required: false },
    ])
    const formData: FormData = { f1: 'val', f2: 'val' }

    expect(getSectionRequiredStatus(section, formData)).toBe('complete')
  })

  it('должен вернуть "empty" если нет обязательных и ничего не заполнено', () => {
    const section = makeSection([
      { field_definition_id: 'f1', field_type: 'text', is_required: false },
    ])
    const formData: FormData = {}

    expect(getSectionRequiredStatus(section, formData)).toBe('empty')
  })

  it('должен учитывать обязательные composite nested fields', () => {
    const section = makeSection([{ field_definition_id: 'comp1', field_type: 'composite' }])
    const compositeItems: CompositeFieldItem[] = [
      makeCompositeItem('comp1', 'n1', true),
      makeCompositeItem('comp1', 'n2', true),
    ]
    const formData: FormData = { 'comp1:n1': 'val' }

    expect(getSectionRequiredStatus(section, formData, compositeItems)).toBe('in_progress')
  })
})

describe('useFormKitProgress', () => {
  it('должен вернуть нули для null structure', () => {
    const { result } = renderHook(() => useFormKitProgress({ structure: null, formData: {} }))

    expect(result.current).toEqual({
      total: 0,
      filled: 0,
      percentage: 0,
      requiredFilled: 0,
      requiredTotal: 0,
    })
  })

  it('должен рассчитать прогресс по всем секциям', () => {
    const structure = {
      template: {
        id: 'tpl-1',
        name: 'Test',
        created_at: '',
        updated_at: '',
        workspace_id: 'w1',
      } as unknown as FormTemplate,
      sections: [
        makeSection([
          { field_definition_id: 'f1', field_type: 'text', is_required: true },
          { field_definition_id: 'f2', field_type: 'text' },
        ]),
      ],
    }
    const formData: FormData = { f1: 'val' }

    const { result } = renderHook(() => useFormKitProgress({ structure, formData }))

    expect(result.current.total).toBe(2)
    expect(result.current.filled).toBe(1)
    expect(result.current.percentage).toBe(50)
    expect(result.current.requiredTotal).toBe(1)
    expect(result.current.requiredFilled).toBe(1)
  })
})
