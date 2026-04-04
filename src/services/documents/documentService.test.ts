/**
 * Тесты для documentService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'
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
  updateDocument,
} from './documentService'
import { DocumentError } from '../errors/AppError'

type SupabaseFrom = ReturnType<typeof supabase.from>
type StorageFrom = ReturnType<typeof supabase.storage.from>

vi.mock('@/lib/supabase')

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
      const mockDocFile = { id: 'file-1', file_name: 'test.pdf', file_path: 'path' }

      // Mock crypto.randomUUID
      vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' })

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
