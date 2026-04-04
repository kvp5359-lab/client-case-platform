/**
 * Тесты для useFormKitFilter — фильтрация секций анкеты
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFormKitFilter } from './useFormKitFilter'

// Хелпер для быстрого создания структуры
function makeStructure(
  sections: Array<{
    id: string
    fields: Array<{ id: string; field_definition_id: string; field_type: string }>
  }>,
) {
  return {
    sections: sections.map((s) => ({
      id: s.id,
      name: `Section ${s.id}`,
      fields: s.fields.map((f) => ({
        id: f.id,
        field_definition_id: f.field_definition_id,
        name: 'Field',
        field_type: f.field_type,
      })),
    })),
  }
}

describe('useFormKitFilter', () => {
  it('должен вернуть все секции когда showOnlyUnfilled=false', () => {
    const structure = makeStructure([
      {
        id: 's1',
        fields: [
          { id: 'f1', field_definition_id: 'fd1', field_type: 'text' },
          { id: 'f2', field_definition_id: 'fd2', field_type: 'text' },
        ],
      },
    ])
    const formData = { fd1: 'filled', fd2: 'filled' }

    const { result } = renderHook(() =>
      useFormKitFilter({
        structure,
        formData,
        compositeItems: [],
        showOnlyUnfilled: false,
      }),
    )

    expect(result.current.filteredSections).toHaveLength(1)
    expect(result.current.filteredSections[0].fields).toHaveLength(2)
  })

  it('должен отфильтровать заполненные поля когда showOnlyUnfilled=true', () => {
    const structure = makeStructure([
      {
        id: 's1',
        fields: [
          { id: 'f1', field_definition_id: 'fd1', field_type: 'text' },
          { id: 'f2', field_definition_id: 'fd2', field_type: 'text' },
        ],
      },
    ])
    const formData = { fd1: 'filled' } // fd2 не заполнено

    const { result } = renderHook(() =>
      useFormKitFilter({
        structure,
        formData,
        compositeItems: [],
        showOnlyUnfilled: true,
      }),
    )

    expect(result.current.filteredSections).toHaveLength(1)
    expect(result.current.filteredSections[0].fields).toHaveLength(1)
    expect(result.current.filteredSections[0].fields[0].field_definition_id).toBe('fd2')
  })

  it('должен оставить composite поле если хотя бы одно вложенное пустое', () => {
    const structure = makeStructure([
      {
        id: 's1',
        fields: [
          { id: 'comp1', field_definition_id: 'comp1', field_type: 'composite' },
        ],
      },
    ])
    const compositeItems = [
      { composite_field_id: 'comp1', nested_field_id: 'n1', nested_field: { id: 'n1', name: 'N1', field_type: 'text' } },
      { composite_field_id: 'comp1', nested_field_id: 'n2', nested_field: { id: 'n2', name: 'N2', field_type: 'text' } },
    ]
    // Одно заполнено, одно нет
    const formData = { 'comp1:n1': 'val' }

    const { result } = renderHook(() =>
      useFormKitFilter({
        structure,
        formData,
        compositeItems,
        showOnlyUnfilled: true,
      }),
    )

    expect(result.current.filteredSections).toHaveLength(1)
    expect(result.current.filteredSections[0].fields).toHaveLength(1)
  })

  it('должен вернуть пустой массив для null структуры', () => {
    const { result } = renderHook(() =>
      useFormKitFilter({
        structure: null,
        formData: {},
        compositeItems: [],
        showOnlyUnfilled: false,
      }),
    )

    expect(result.current.filteredSections).toEqual([])
  })

  it('должен убрать секцию целиком если все её поля заполнены', () => {
    const structure = makeStructure([
      {
        id: 's1',
        fields: [
          { id: 'f1', field_definition_id: 'fd1', field_type: 'text' },
        ],
      },
      {
        id: 's2',
        fields: [
          { id: 'f2', field_definition_id: 'fd2', field_type: 'text' },
        ],
      },
    ])
    const formData = { fd1: 'filled' } // s1 заполнена, s2 нет

    const { result } = renderHook(() =>
      useFormKitFilter({
        structure,
        formData,
        compositeItems: [],
        showOnlyUnfilled: true,
      }),
    )

    expect(result.current.filteredSections).toHaveLength(1)
    expect(result.current.filteredSections[0].id).toBe('s2')
  })
})
