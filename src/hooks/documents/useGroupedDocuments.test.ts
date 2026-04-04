/**
 * Тесты для useGroupedDocuments — группировка документов по папкам
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGroupedDocuments } from './useGroupedDocuments'
import type { DocumentWithFiles } from '@/components/documents/types'

// Хелпер для создания документа
function makeDoc(overrides: Partial<DocumentWithFiles> = {}): DocumentWithFiles {
  return {
    id: 'doc-1',
    name: 'Test Document',
    document_kit_id: 'dk-1',
    project_id: 'proj-1',
    workspace_id: 'ws-1',
    folder_id: null,
    sort_order: 0,
    status: null,
    is_deleted: false,
    description: null,
    ai_check_result: null,
    ai_checked_at: null,
    source_document_id: null,
    text_content: null,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('useGroupedDocuments', () => {
  it('должен группировать документы по folder_id', () => {
    const documents = [
      makeDoc({ id: 'd1', folder_id: 'f1' }),
      makeDoc({ id: 'd2', folder_id: 'f1' }),
      makeDoc({ id: 'd3', folder_id: 'f2' }),
    ]

    const { result } = renderHook(() =>
      useGroupedDocuments({
        documents,
        showOnlyUnverified: false,
      }),
    )

    expect(result.current.documentsByFolder.get('f1')).toHaveLength(2)
    expect(result.current.documentsByFolder.get('f2')).toHaveLength(1)
  })

  it('должен отделять удалённые документы (is_deleted: true)', () => {
    const documents = [
      makeDoc({ id: 'd1', is_deleted: false }),
      makeDoc({ id: 'd2', is_deleted: true }),
      makeDoc({ id: 'd3', is_deleted: true }),
    ]

    const { result } = renderHook(() =>
      useGroupedDocuments({
        documents,
        showOnlyUnverified: false,
      }),
    )

    expect(result.current.trashedDocuments).toHaveLength(2)
    expect(result.current.ungroupedDocuments).toHaveLength(1)
  })

  it('должен определять нераспределённые документы (без folder_id)', () => {
    const documents = [
      makeDoc({ id: 'd1', folder_id: null }),
      makeDoc({ id: 'd2', folder_id: 'f1' }),
      makeDoc({ id: 'd3', folder_id: null }),
    ]

    const { result } = renderHook(() =>
      useGroupedDocuments({
        documents,
        showOnlyUnverified: false,
      }),
    )

    expect(result.current.ungroupedDocuments).toHaveLength(2)
  })

  it('должен сортировать документы по sort_order', () => {
    const documents = [
      makeDoc({ id: 'd1', folder_id: 'f1', sort_order: 3 }),
      makeDoc({ id: 'd2', folder_id: 'f1', sort_order: 1 }),
      makeDoc({ id: 'd3', folder_id: 'f1', sort_order: 2 }),
    ]

    const { result } = renderHook(() =>
      useGroupedDocuments({
        documents,
        showOnlyUnverified: false,
      }),
    )

    const folderDocs = result.current.documentsByFolder.get('f1')
    expect(folderDocs).toBeDefined()
    expect(folderDocs?.[0].id).toBe('d2') // sort_order: 1
    expect(folderDocs?.[1].id).toBe('d3') // sort_order: 2
    expect(folderDocs?.[2].id).toBe('d1') // sort_order: 3
  })

  it('должен фильтровать документы с установленным статусом при showOnlyUnverified', () => {
    const documents = [
      makeDoc({ id: 'd1', folder_id: 'f1', status: null }), // без статуса — покажется
      makeDoc({ id: 'd2', folder_id: 'f1', status: 'approved' }), // со статусом — скроется
      makeDoc({ id: 'd3', folder_id: null, status: null }), // без статуса, нераспределённый
      makeDoc({ id: 'd4', folder_id: null, status: 'rejected' }), // со статусом, нераспределённый — скроется
    ]

    const { result } = renderHook(() =>
      useGroupedDocuments({
        documents,
        showOnlyUnverified: true,
      }),
    )

    const folderDocs = result.current.documentsByFolder.get('f1')
    expect(folderDocs).toHaveLength(1)
    expect(folderDocs?.[0].id).toBe('d1')

    expect(result.current.ungroupedDocuments).toHaveLength(1)
    expect(result.current.ungroupedDocuments[0].id).toBe('d3')
  })

  it('должен исключать slotDocumentIds из группировки по папкам', () => {
    const documents = [
      makeDoc({ id: 'd1', folder_id: 'f1' }),
      makeDoc({ id: 'd2', folder_id: 'f1' }),
    ]
    const slotDocumentIds = new Set(['d1'])

    const { result } = renderHook(() =>
      useGroupedDocuments({
        documents,
        showOnlyUnverified: false,
        slotDocumentIds,
      }),
    )

    const folderDocs = result.current.documentsByFolder.get('f1')
    expect(folderDocs).toHaveLength(1)
    expect(folderDocs?.[0].id).toBe('d2')
  })

  it('должен вернуть пустые результаты для пустого массива документов', () => {
    const { result } = renderHook(() =>
      useGroupedDocuments({
        documents: undefined,
        showOnlyUnverified: false,
      }),
    )

    expect(result.current.documentsByFolder.size).toBe(0)
    expect(result.current.ungroupedDocuments).toHaveLength(0)
    expect(result.current.trashedDocuments).toHaveLength(0)
    expect(result.current.allFilteredDocuments).toHaveLength(0)
  })
})
