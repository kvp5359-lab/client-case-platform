/**
 * Тесты для sourceDocumentService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  getSourceDocumentsByProject,
  toggleSourceDocumentHidden,
  getGoogleDriveToken,
  refreshGoogleDriveTokenIfNeeded,
} from './sourceDocumentService'
import { DocumentError } from '../errors/AppError'

type SupabaseFrom = ReturnType<typeof supabase.from>

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}))

describe('sourceDocumentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSourceDocumentsByProject', () => {
    it('должен вернуть документы и usedSourceIds', async () => {
      const mockSourceDocs = [
        { id: 'sd-1', name: 'file1.pdf' },
        { id: 'sd-2', name: 'file2.pdf' },
      ]
      const mockKits = [{ id: 'kit-1' }]
      const mockUsedSources = [{ source_document_id: 'sd-1' }]

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'source_documents') {
          // .select('*').eq('project_id', ...).order().order()
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockSourceDocs, error: null }),
                }),
              }),
            }),
          } as unknown as SupabaseFrom
        }
        if (table === 'document_kits') {
          // .select('id').eq('project_id', ...)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockKits, error: null }),
            }),
          } as unknown as SupabaseFrom
        }
        if (table === 'documents') {
          // .select('source_document_id').in('document_kit_id', ...).not(...)
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: mockUsedSources, error: null }),
              }),
            }),
          } as unknown as SupabaseFrom
        }
        return {} as unknown as SupabaseFrom
      })

      const result = await getSourceDocumentsByProject('proj-1')

      expect(result.documents).toEqual(mockSourceDocs)
      expect(result.usedSourceIds.has('sd-1')).toBe(true)
      expect(result.usedSourceIds.has('sd-2')).toBe(false)
    })

    it('должен бросить DocumentError при ошибке загрузки источников', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Error' },
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(getSourceDocumentsByProject('proj-1')).rejects.toThrow(DocumentError)
    })
  })

  describe('toggleSourceDocumentHidden', () => {
    it('должен инвертировать is_hidden', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as SupabaseFrom)

      await expect(toggleSourceDocumentHidden('sd-1', false)).resolves.not.toThrow()
    })

    it('должен бросить DocumentError при ошибке', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'Error' } }),
        }),
      } as unknown as SupabaseFrom)

      await expect(toggleSourceDocumentHidden('sd-1', true)).rejects.toThrow(DocumentError)
    })
  })

  describe('getGoogleDriveToken', () => {
    it('должен вернуть токены', async () => {
      const mockTokens = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        expires_at: '2025-12-31T00:00:00Z',
      }

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTokens, error: null }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getGoogleDriveToken('user-1')

      expect(result).toEqual(mockTokens)
    })

    it('должен бросить ошибку если токены не найдены', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(getGoogleDriveToken('user-1')).rejects.toThrow(DocumentError)
    })
  })

  describe('refreshGoogleDriveTokenIfNeeded', () => {
    it('должен вернуть текущий token если он не истёк', async () => {
      const token = {
        access_token: 'valid-token',
        refresh_token: 'refresh-token',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // +1 час
      }

      const result = await refreshGoogleDriveTokenIfNeeded(token, 'user-1')

      expect(result).toBe('valid-token')
    })

    it('должен обновить token если он истёк', async () => {
      const token = {
        access_token: 'expired-token',
        refresh_token: 'refresh-token',
        expires_at: new Date(Date.now() - 60 * 1000).toISOString(), // уже истёк
      }

      // Мокаем supabase.functions.invoke
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { access_token: 'new-token' },
        error: null,
      })

      const result = await refreshGoogleDriveTokenIfNeeded(token, 'user-1')

      expect(result).toBe('new-token')
    })

    it('должен бросить ошибку если refresh не удался', async () => {
      const token = {
        access_token: 'expired-token',
        refresh_token: 'refresh-token',
        expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      }

      // Мокаем supabase.functions.invoke с ошибкой
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: null,
        error: new Error('Refresh failed'),
      })

      await expect(refreshGoogleDriveTokenIfNeeded(token, 'user-1')).rejects.toThrow(DocumentError)
    })
  })
})
