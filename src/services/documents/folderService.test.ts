/**
 * Тесты для folderService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'
import { createFolder, updateFolder, deleteFolder, getFoldersByKitId } from './folderService'

type SupabaseFrom = ReturnType<typeof supabase.from>

vi.mock('@/lib/supabase')

describe('folderService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createFolder', () => {
    it('должен создать папку', async () => {
      const mockFolder = { id: 'folder-1', name: 'Test', description: '' }

      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockFolder, error: null }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await createFolder({
        name: 'Test',
        kitId: 'kit-1',
        workspaceId: 'ws-1',
      })

      expect(result).toEqual(mockFolder)
      expect(supabase.from).toHaveBeenCalledWith('folders')
    })

    it('должен бросить DocumentError при ошибке', async () => {
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

      await expect(
        createFolder({ name: 'Test', kitId: 'kit-1', workspaceId: 'ws-1' })
      ).rejects.toThrow()
    })
  })

  describe('updateFolder', () => {
    it('должен обновить name и description', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as SupabaseFrom)

      await expect(
        updateFolder({ folderId: 'folder-1', name: 'New Name', description: 'New Desc' })
      ).resolves.not.toThrow()
    })

    it('должен обновить только name', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as SupabaseFrom)

      await expect(
        updateFolder({ folderId: 'folder-1', name: 'New Name' })
      ).resolves.not.toThrow()
    })
  })

  describe('deleteFolder', () => {
    it('должен переместить документы и удалить папку', async () => {
      const callOrder: string[] = []

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'documents') {
          callOrder.push('documents')
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as unknown as SupabaseFrom
        }
        if (table === 'folders') {
          callOrder.push('folders')
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      await deleteFolder('folder-1')

      expect(callOrder).toEqual(['documents', 'folders'])
    })

    it('должен бросить ошибку если документы не удалось переместить', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
        }),
      } as unknown as SupabaseFrom)

      await expect(deleteFolder('folder-1')).rejects.toThrow()
    })
  })

  describe('getFoldersByKitId', () => {
    it('должен вернуть список папок', async () => {
      const mockFolders = [
        { id: 'f1', name: 'Folder 1' },
        { id: 'f2', name: 'Folder 2' },
      ]

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockFolders, error: null }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getFoldersByKitId('kit-1')

      expect(result).toEqual(mockFolders)
      expect(result).toHaveLength(2)
    })

    it('должен вернуть пустой массив при null data', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getFoldersByKitId('kit-1')

      expect(result).toEqual([])
    })
  })
})
