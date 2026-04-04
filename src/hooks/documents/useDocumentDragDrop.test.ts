/**
 * Тесты для useDocumentDragDrop — drag & drop документов
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentDragDrop } from './useDocumentDragDrop'
import type { SourceDocument } from '@/components/documents/types'

// Хелпер для создания mock drag event
function makeDragEvent(overrides: Record<string, unknown> = {}): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      effectAllowed: '',
      setData: vi.fn(),
    },
    currentTarget: {
      getBoundingClientRect: () => ({ top: 0, height: 100 }),
    },
    clientY: 25,
    ...overrides,
  } as unknown as React.DragEvent
}

// Хелпер для создания source document
function makeSourceDoc(id = 'src-1'): SourceDocument {
  return {
    id,
    name: 'test-file.pdf',
    mimeType: 'application/pdf',
    sourceDocumentId: `source-${id}`,
  }
}

describe('useDocumentDragDrop', () => {
  it('должен иметь начальное состояние: всё null', () => {
    const { result } = renderHook(() => useDocumentDragDrop())

    expect(result.current.draggedDocId).toBeNull()
    expect(result.current.dragOverDocId).toBeNull()
    expect(result.current.dragOverFolderId).toBeNull()
    expect(result.current.draggedSourceDoc).toBeNull()
  })

  it('должен устанавливать draggedDocId при handleDocDragStart', () => {
    const { result } = renderHook(() => useDocumentDragDrop())
    const event = makeDragEvent()

    act(() => {
      result.current.handleDocDragStart(event, 'doc-123')
    })

    expect(result.current.draggedDocId).toBe('doc-123')
    expect(event.dataTransfer.effectAllowed).toBe('move')
    expect(event.dataTransfer.setData).toHaveBeenCalledWith('application/x-document-id', 'doc-123')
  })

  it('должен сбрасывать drag-состояние при handleDocDragEnd', () => {
    const { result } = renderHook(() => useDocumentDragDrop())
    const event = makeDragEvent()

    // Сначала начинаем drag
    act(() => {
      result.current.handleDocDragStart(event, 'doc-123')
    })
    expect(result.current.draggedDocId).toBe('doc-123')

    // Заканчиваем
    act(() => {
      result.current.handleDocDragEnd()
    })

    expect(result.current.draggedDocId).toBeNull()
    expect(result.current.dragOverDocId).toBeNull()
    expect(result.current.dragOverFolderId).toBeNull()
  })

  it('должен устанавливать dragOverFolderId при handleFolderDragOver (null -> "unassigned")', () => {
    const { result } = renderHook(() => useDocumentDragDrop())
    const event = makeDragEvent()

    act(() => {
      result.current.handleFolderDragOver(event, null)
    })

    expect(result.current.dragOverFolderId).toBe('unassigned')
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('должен очищать dragOverFolderId при handleFolderDragLeave', () => {
    const { result } = renderHook(() => useDocumentDragDrop())
    const event = makeDragEvent()

    // Устанавливаем
    act(() => {
      result.current.handleFolderDragOver(event, 'folder-1')
    })
    expect(result.current.dragOverFolderId).toBe('folder-1')

    // Очищаем
    act(() => {
      result.current.handleFolderDragLeave()
    })

    expect(result.current.dragOverFolderId).toBeNull()
  })

  it('должен устанавливать draggedSourceDoc при handleSourceDocDragStart', () => {
    const { result } = renderHook(() => useDocumentDragDrop())
    const event = makeDragEvent()
    const sourceDoc = makeSourceDoc()

    act(() => {
      result.current.handleSourceDocDragStart(event, sourceDoc)
    })

    expect(result.current.draggedSourceDoc).toEqual(sourceDoc)
    expect(event.dataTransfer.effectAllowed).toBe('copy')
  })

  it('должен очистить всё при resetDragState', () => {
    const { result } = renderHook(() => useDocumentDragDrop())
    const event = makeDragEvent()

    // Устанавливаем разное состояние
    act(() => {
      result.current.handleDocDragStart(event, 'doc-1')
      result.current.handleFolderDragOver(makeDragEvent(), 'folder-1')
    })

    // Сбрасываем
    act(() => {
      result.current.resetDragState()
    })

    expect(result.current.draggedDocId).toBeNull()
    expect(result.current.dragOverDocId).toBeNull()
    expect(result.current.dragOverFolderId).toBeNull()
    expect(result.current.draggedSourceDoc).toBeNull()
  })
})
