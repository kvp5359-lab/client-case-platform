/**
 * Тесты для useDocuments — хук для работы с документами (мутации)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { supabase } from '@/lib/supabase'
import { useDocuments } from './useDocuments'
import { createQueryWrapper } from '@/test/testUtils'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
}))

// Тип для мока supabase.from() и storage.from()
type SupabaseFrom = ReturnType<typeof supabase.from>
type StorageFrom = ReturnType<typeof supabase.storage.from>

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// --- Хелперы ---

/** Создаёт File с реальным содержимым (size > 0) */
function makeFile(name = 'test.pdf', type = 'application/pdf'): File {
  return new File(['file-content'], name, { type })
}

/** Создаёт File с размером 0 байт */
function makeEmptyFile(name = 'empty.pdf'): File {
  return new File([], name, { type: 'application/pdf' })
}

/** Стандартные параметры для uploadDocument */
function makeUploadParams(overrides: Record<string, unknown> = {}) {
  return {
    file: makeFile(),
    documentKitId: 'kit-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    ...overrides,
  }
}

/** Мок для цепочки supabase.from(table).insert().select().single() */
function mockInsertChain(resolvedValue: { data: unknown; error: unknown }) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(resolvedValue),
      }),
    }),
  }
}

/** Мок для цепочки supabase.from(table).update().eq() */
function mockUpdateChain(resolvedValue: { error: unknown }) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(resolvedValue),
    }),
  }
}

/** Мок для цепочки supabase.from(table).select().eq() */
function mockSelectChain(resolvedValue: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(resolvedValue),
    }),
  }
}

// --- Тесты ---

describe('useDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==============================
  // uploadDocument
  // ==============================
  describe('uploadDocument', () => {
    it('должен выбросить ошибку при файле с размером 0 байт', async () => {
      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      await act(async () => {
        await expect(
          result.current.uploadDocument(makeUploadParams({ file: makeEmptyFile() })),
        ).rejects.toThrow('размер 0 байт')
      })
    })

    it('должен успешно загрузить документ: создать запись, загрузить файл, вызвать rpc, обновить статус', async () => {
      const mockDoc = { id: 'doc-1', name: 'test.pdf' }
      const mockFilesRecord = { id: 'files-1' }
      const mockFileId = 'file-record-1'

      // Порядок вызовов from() в uploadDocument:
      //   1. documents.insert().select().single()      — создание документа
      //   2. files.insert().select('id').single()      — запись в реестре файлов
      //   3. documents.update().eq()                   — обновление статуса
      const fromCalls: Array<{ table: string }> = []
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        fromCalls.push({ table })
        if (table === 'documents') {
          const callIndex = fromCalls.filter((c) => c.table === 'documents').length
          if (callIndex === 1) {
            return mockInsertChain({ data: mockDoc, error: null }) as unknown as SupabaseFrom
          }
          return mockUpdateChain({ error: null }) as unknown as SupabaseFrom
        }
        if (table === 'files') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockFilesRecord, error: null }),
              }),
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      // storage.from('files').upload() — после рефакторинга бакет называется 'files',
      // а не 'document-files'
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
      } as unknown as StorageFrom)

      // rpc('add_document_version')
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: mockFileId,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      let uploadResult: { document: unknown; fileId: unknown } | undefined
      await act(async () => {
        uploadResult = await result.current.uploadDocument(makeUploadParams())
      })

      expect(uploadResult?.document).toEqual(mockDoc)
      expect(uploadResult?.fileId).toBe(mockFileId)

      expect(supabase.from).toHaveBeenCalledWith('documents')
      expect(supabase.from).toHaveBeenCalledWith('files')
      expect(supabase.storage.from).toHaveBeenCalledWith('files')

      expect(supabase.rpc).toHaveBeenCalledWith(
        'add_document_version',
        expect.objectContaining({
          p_document_id: 'doc-1',
          p_file_name: 'test.pdf',
          p_mime_type: 'application/pdf',
          p_file_id: 'files-1',
        }),
      )
    })

    it('должен откатить документ при ошибке загрузки в storage', async () => {
      const mockDoc = { id: 'doc-1', name: 'test.pdf' }
      const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'documents') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: mockDeleteEq,
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      // storage upload проваливается
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: { message: 'Storage error' } }),
      } as unknown as StorageFrom)

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      await act(async () => {
        await expect(result.current.uploadDocument(makeUploadParams())).rejects.toThrow(
          'Ошибка загрузки файла',
        )
      })

      // Проверяем, что документ был откатан (удалён)
      expect(mockDeleteEq).toHaveBeenCalledWith('id', 'doc-1')
    })

    it('должен откатить документ и файл из storage при ошибке rpc', async () => {
      const mockDoc = { id: 'doc-1', name: 'test.pdf' }
      const mockFilesRecord = { id: 'files-1' }
      const mockDocDeleteEq = vi.fn().mockResolvedValue({ error: null })
      const mockFilesDeleteEq = vi.fn().mockResolvedValue({ error: null })
      const mockStorageRemove = vi.fn().mockResolvedValue({ error: null })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'documents') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: mockDocDeleteEq,
            }),
          } as unknown as SupabaseFrom
        }
        if (table === 'files') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockFilesRecord, error: null }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: mockFilesDeleteEq,
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      // storage upload — успех
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        remove: mockStorageRemove,
      } as unknown as StorageFrom)

      // rpc проваливается
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      await act(async () => {
        await expect(result.current.uploadDocument(makeUploadParams())).rejects.toThrow(
          'Ошибка сохранения метаданных файла',
        )
      })

      // Проверяем откат: файл удалён из storage
      expect(mockStorageRemove).toHaveBeenCalledWith([expect.stringContaining('ws-1/doc-1/')])

      // Проверяем откат: и documents, и files-запись удалены из БД
      expect(mockDocDeleteEq).toHaveBeenCalledWith('id', 'doc-1')
      expect(mockFilesDeleteEq).toHaveBeenCalledWith('id', 'files-1')
    })

    it('должен определить MIME-тип по расширению файла если file.type пустой', async () => {
      const mockDoc = { id: 'doc-1', name: 'report.docx' }
      const mockFilesRecord = { id: 'files-1' }
      const mockFileId = 'file-record-1'

      // Файл без MIME-типа
      const fileWithoutType = new File(['content'], 'report.docx', { type: '' })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'documents') {
          const callCount = vi
            .mocked(supabase.from)
            .mock.calls.filter((c) => c[0] === 'documents').length
          if (callCount === 1) {
            return mockInsertChain({ data: mockDoc, error: null }) as unknown as SupabaseFrom
          }
          return mockUpdateChain({ error: null }) as unknown as SupabaseFrom
        }
        if (table === 'files') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockFilesRecord, error: null }),
              }),
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
      } as unknown as StorageFrom)

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: mockFileId,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      await act(async () => {
        await result.current.uploadDocument(makeUploadParams({ file: fileWithoutType }))
      })

      // rpc должен получить правильный MIME-тип определённый по расширению
      expect(supabase.rpc).toHaveBeenCalledWith(
        'add_document_version',
        expect.objectContaining({
          p_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      )
    })
  })

  // ==============================
  // softDeleteDocument
  // ==============================
  describe('softDeleteDocument', () => {
    it('должен установить is_deleted=true и deleted_at', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
      } as unknown as SupabaseFrom)

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      await act(async () => {
        await result.current.softDeleteDocument('doc-1')
      })

      expect(supabase.from).toHaveBeenCalledWith('documents')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          is_deleted: true,
          deleted_at: expect.any(String),
        }),
      )
    })
  })

  // ==============================
  // hardDeleteDocument
  // ==============================
  describe('hardDeleteDocument', () => {
    it('должен получить файлы, удалить их из storage и удалить документ', async () => {
      const mockFiles = [{ file_path: 'ws-1/doc-1/v1.pdf' }, { file_path: 'ws-1/doc-1/v2.pdf' }]
      const mockStorageRemove = vi.fn().mockResolvedValue({ error: null })
      const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'document_files') {
          return mockSelectChain({ data: mockFiles, error: null }) as unknown as SupabaseFrom
        }
        if (table === 'documents') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: mockDeleteEq,
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      vi.mocked(supabase.storage.from).mockReturnValue({
        remove: mockStorageRemove,
      } as unknown as StorageFrom)

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      await act(async () => {
        await result.current.hardDeleteDocument('doc-1')
      })

      // Проверяем получение файлов
      expect(supabase.from).toHaveBeenCalledWith('document_files')

      // Проверяем удаление из storage
      expect(mockStorageRemove).toHaveBeenCalledWith(['ws-1/doc-1/v1.pdf', 'ws-1/doc-1/v2.pdf'])

      // Проверяем удаление документа
      expect(supabase.from).toHaveBeenCalledWith('documents')
      expect(mockDeleteEq).toHaveBeenCalledWith('id', 'doc-1')
    })

    it('должен удалить документ даже если файлов нет', async () => {
      const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'document_files') {
          return mockSelectChain({ data: [], error: null }) as unknown as SupabaseFrom
        }
        if (table === 'documents') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: mockDeleteEq,
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      await act(async () => {
        await result.current.hardDeleteDocument('doc-1')
      })

      // Storage.remove НЕ вызывается, так как файлов нет
      expect(supabase.storage.from).not.toHaveBeenCalled()

      // Документ всё равно удаляется
      expect(mockDeleteEq).toHaveBeenCalledWith('id', 'doc-1')
    })
  })

  // ==============================
  // restoreDocument
  // ==============================
  describe('restoreDocument', () => {
    it('должен установить is_deleted=false и deleted_at=null', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
      } as unknown as SupabaseFrom)

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      await act(async () => {
        await result.current.restoreDocument('doc-1')
      })

      expect(supabase.from).toHaveBeenCalledWith('documents')
      expect(mockUpdate).toHaveBeenCalledWith({
        is_deleted: false,
        deleted_at: null,
      })
    })
  })

  // ==============================
  // moveDocument
  // ==============================
  describe('moveDocument', () => {
    it('должен обновить folder_id и подтянуть document_kit_id из целевой папки', async () => {
      // При folderId != null хук сначала делает
      // folders.select('document_kit_id').eq().single(),
      // затем documents.update({ folder_id, document_kit_id }).eq()
      const mockDocUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'folders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi
                  .fn()
                  .mockResolvedValue({ data: { document_kit_id: 'kit-42' }, error: null }),
              }),
            }),
          } as unknown as SupabaseFrom
        }
        if (table === 'documents') {
          return { update: mockDocUpdate } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      await act(async () => {
        await result.current.moveDocument({
          documentId: 'doc-1',
          folderId: 'folder-2',
        })
      })

      expect(supabase.from).toHaveBeenCalledWith('folders')
      expect(supabase.from).toHaveBeenCalledWith('documents')
      expect(mockDocUpdate).toHaveBeenCalledWith({
        folder_id: 'folder-2',
        document_kit_id: 'kit-42',
      })
    })
  })

  // ==============================
  // reorderDocuments
  // ==============================
  describe('reorderDocuments', () => {
    it('должен вызвать rpc reorder_documents с батчем обновлений', async () => {
      // После рефакторинга хук делает один rpc-вызов вместо N отдельных update'ов
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      const updates = [
        { id: 'doc-1', sort_order: 0 },
        { id: 'doc-2', sort_order: 1 },
        { id: 'doc-3', sort_order: 2 },
      ]

      await act(async () => {
        await result.current.reorderDocuments(updates)
      })

      expect(supabase.rpc).toHaveBeenCalledWith('reorder_documents', {
        p_updates: updates,
      })
    })

    it('должен передать folder_id в rpc когда он есть в обновлении', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useDocuments(), { wrapper })

      const updates = [
        { id: 'doc-1', sort_order: 0, folder_id: 'folder-A' },
        { id: 'doc-2', sort_order: 1 },
      ]

      await act(async () => {
        await result.current.reorderDocuments(updates)
      })

      expect(supabase.rpc).toHaveBeenCalledWith('reorder_documents', {
        p_updates: updates,
      })
    })
  })
})
