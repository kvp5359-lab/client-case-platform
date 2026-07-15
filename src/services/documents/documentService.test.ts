/**
 * Тесты для documentService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'
import { createStorageSignedUrl } from '@/lib/storage'
import {
  uploadDocument,
  moveDocument,
  updateDocumentStatus,
  softDeleteDocument,
  restoreDocument,
  hardDeleteDocument,
  reorderDocuments,
  getDocumentPublicUrl,
  downloadDocumentBlob,
  openDocumentInNewTab,
  updateDocument,
} from './documentService'
import { DocumentError } from '../errors/AppError'

type SupabaseFrom = ReturnType<typeof supabase.from>
type StorageFrom = ReturnType<typeof supabase.storage.from>

vi.mock('@/lib/supabase')

// Слой хранилища оставляем настоящим (его ветвление по бэкенду — часть
// поведения), но `createStorageSignedUrl` оборачиваем, чтобы в тестах можно
// было сыграть и R2-ветку (она зависит от env, читаемого при импорте модуля).
vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>()
  return { ...actual, createStorageSignedUrl: vi.fn(actual.createStorageSignedUrl) }
})

describe('documentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('uploadDocument', () => {
    const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    const params = {
      file: mockFile,
      kitId: 'kit-1',
      folderId: 'folder-1',
      status: null,
      projectId: 'proj-1',
      workspaceId: 'ws-1',
    }

    it('должен загрузить документ успешно', async () => {
      const mockDocument = { id: 'doc-1', name: 'test.pdf' }
      const mockFileRecord = { id: 'files-1' }
      const mockDocFile = { id: 'file-1', file_name: 'test.pdf', file_path: 'path' }

      // Mock crypto.randomUUID
      vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' })

      // uploadDocument теперь делает три .from() вызова:
      //   1. documents.insert → создание записи документа
      //   2. files.insert     → запись в реестре файлов (единый file registry)
      //   3. document_files.insert → запись о версии с file_id
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'documents') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockDocument, error: null }),
              }),
            }),
          } as unknown as SupabaseFrom
        }
        if (table === 'files') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockFileRecord, error: null }),
              }),
            }),
          } as unknown as SupabaseFrom
        }
        if (table === 'document_files') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockDocFile, error: null }),
              }),
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
      } as unknown as StorageFrom)

      const result = await uploadDocument(params)

      expect(result.document).toEqual(mockDocument)
      expect(result.file).toEqual(mockDocFile)
      expect(supabase.from).toHaveBeenCalledWith('files')
    })

    it('должен бросить DocumentError при ошибке создания документа', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Insert failed' },
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(uploadDocument(params)).rejects.toThrow(DocumentError)
    })

    it('должен откатить документ при ошибке загрузки в storage', async () => {
      const mockDocument = { id: 'doc-1', name: 'test.pdf' }
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })

      vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' })

      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockDocument, error: null }),
          }),
        }),
        delete: mockDelete,
      } as unknown as SupabaseFrom)

      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: { message: 'Storage error' } }),
      } as unknown as StorageFrom)

      await expect(uploadDocument(params)).rejects.toThrow(DocumentError)
    })
  })

  describe('moveDocument', () => {
    it('должен переместить документ в папку', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as SupabaseFrom)

      await expect(
        moveDocument({ documentId: 'doc-1', folderId: 'folder-1' })
      ).resolves.not.toThrow()
    })
  })

  describe('updateDocumentStatus', () => {
    it('должен обновить статус документа', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as SupabaseFrom)

      await expect(
        updateDocumentStatus({ documentId: 'doc-1', status: 'approved' })
      ).resolves.not.toThrow()
    })
  })

  describe('softDeleteDocument', () => {
    it('должен пометить документ как удалённый', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as SupabaseFrom)

      await expect(softDeleteDocument('doc-1')).resolves.not.toThrow()
    })
  })

  describe('restoreDocument', () => {
    it('должен восстановить документ из корзины', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as SupabaseFrom)

      await expect(restoreDocument('doc-1')).resolves.not.toThrow()
    })
  })

  describe('hardDeleteDocument', () => {
    it('должен полностью удалить документ с файлами', async () => {
      const mockFiles = [{ file_path: 'path/file1.pdf' }, { file_path: 'path/file2.pdf' }]

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'document_files') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockFiles, error: null }),
            }),
          } as unknown as SupabaseFrom
        }
        if (table === 'documents') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      vi.mocked(supabase.storage.from).mockReturnValue({
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as StorageFrom)

      await expect(hardDeleteDocument('doc-1')).resolves.not.toThrow()
      expect(supabase.storage.from).toHaveBeenCalledWith('document-files')
    })

    it('должен удалить документ даже без файлов', async () => {
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'document_files') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          } as unknown as SupabaseFrom
        }
        if (table === 'documents') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      vi.mocked(supabase.storage.from).mockReturnValue({
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as StorageFrom)

      await expect(hardDeleteDocument('doc-1')).resolves.not.toThrow()
    })
  })

  describe('reorderDocuments', () => {
    it('должен обновить sort_order', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as SupabaseFrom)

      await expect(
        reorderDocuments({ documentId: 'doc-1', newSortOrder: 3 })
      ).resolves.not.toThrow()
    })
  })

  describe('getDocumentPublicUrl', () => {
    it('должен вернуть signedUrl', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        createSignedUrl: vi
          .fn()
          .mockResolvedValue({ data: { signedUrl: 'https://signed.url' }, error: null }),
      } as unknown as StorageFrom)

      const url = await getDocumentPublicUrl('path/file.pdf')

      expect(url).toBe('https://signed.url')
    })

    it('должен вернуть null при ошибке', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        createSignedUrl: vi
          .fn()
          .mockResolvedValue({ data: null, error: { message: 'Error' } }),
      } as unknown as StorageFrom)

      const url = await getDocumentPublicUrl('path/file.pdf')

      expect(url).toBeNull()
    })
  })

  describe('downloadDocumentBlob', () => {
    it('должен скачать blob', async () => {
      const mockBlob = new Blob(['content'])

      vi.mocked(supabase.storage.from).mockReturnValue({
        download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
      } as unknown as StorageFrom)

      const blob = await downloadDocumentBlob('path/file.pdf')

      expect(blob).toEqual(mockBlob)
    })

    it('должен бросить DocumentError при ошибке', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        download: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
      } as unknown as StorageFrom)

      await expect(downloadDocumentBlob('path/file.pdf')).rejects.toThrow(DocumentError)
    })
  })

  describe('openDocumentInNewTab', () => {
    const openSpy = vi.fn()

    beforeEach(() => {
      openSpy.mockClear()
      vi.stubGlobal('open', openSpy)
    })

    it('открывает подписанную ссылку с именем файла, не скачивая его', async () => {
      vi.mocked(createStorageSignedUrl).mockResolvedValueOnce({
        data: { signedUrl: 'https://r2.example/signed' },
        error: null,
      })
      const download = vi.fn()
      vi.mocked(supabase.storage.from).mockReturnValue({ download } as unknown as StorageFrom)

      await openDocumentInNewTab('path/file.pdf', null, 'Договор.pdf')

      expect(createStorageSignedUrl).toHaveBeenCalledWith(
        expect.any(String),
        'path/file.pdf',
        expect.any(Number),
        { inline: 'Договор.pdf' },
      )
      expect(openSpy).toHaveBeenCalledWith('https://r2.example/signed', '_blank', 'noopener')
      // Файл не качаем — в этом и смысл: вкладка открывается сразу.
      expect(download).not.toHaveBeenCalled()
    })

    it('падает на blob, если хранилище не умеет inline-имя', async () => {
      vi.mocked(createStorageSignedUrl).mockResolvedValueOnce({
        data: null,
        error: { message: 'inline_not_supported' },
      })
      const mockBlob = new Blob(['content'])
      vi.mocked(supabase.storage.from).mockReturnValue({
        download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
      } as unknown as StorageFrom)
      vi.stubGlobal('URL', { createObjectURL: () => 'blob:local', revokeObjectURL: vi.fn() })

      await openDocumentInNewTab('path/file.pdf', null, 'Договор.pdf')

      expect(openSpy).toHaveBeenCalledWith('blob:local', '_blank', 'noopener')
    })

    it('без имени файла подписанную ссылку не запрашивает', async () => {
      const mockBlob = new Blob(['content'])
      vi.mocked(supabase.storage.from).mockReturnValue({
        download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
      } as unknown as StorageFrom)
      vi.stubGlobal('URL', { createObjectURL: () => 'blob:local', revokeObjectURL: vi.fn() })

      await openDocumentInNewTab('path/file.pdf')

      expect(createStorageSignedUrl).not.toHaveBeenCalled()
      expect(openSpy).toHaveBeenCalledWith('blob:local', '_blank', 'noopener')
    })
  })

  describe('updateDocument', () => {
    it('должен обновить поля документа', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as SupabaseFrom)

      await expect(
        updateDocument('doc-1', { name: 'New name', description: 'New desc' })
      ).resolves.not.toThrow()
    })
  })
})
