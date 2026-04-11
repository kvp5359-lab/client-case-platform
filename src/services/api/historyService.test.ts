/**
 * Тесты для historyService — обёртки над RPC для аудит-логов проекта
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getProjectHistory,
  getHistoryUnreadCount,
  markHistoryAsRead,
} from './historyService'
import { supabase } from '@/lib/supabase'
import { ApiError } from '@/services/errors/AppError'

type SupabaseFrom = ReturnType<typeof supabase.from>

vi.mock('@/lib/supabase')

describe('historyService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getProjectHistory', () => {
    it('вызывает RPC get_project_history с обязательными параметрами', async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = rpcMock

      await getProjectHistory('p-1')

      expect(rpcMock).toHaveBeenCalledWith('get_project_history', {
        p_project_id: 'p-1',
        p_cursor: undefined,
        p_limit: 30,
        p_resource_types: undefined,
        p_actions: undefined,
        p_user_id: undefined,
      })
    })

    it('передаёт фильтры в RPC', async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = rpcMock

      await getProjectHistory('p-1', 'cursor-abc', 50, {
        resourceTypes: ['document'],
        actions: ['create', 'update'],
        userId: 'user-1',
      })

      expect(rpcMock).toHaveBeenCalledWith('get_project_history', {
        p_project_id: 'p-1',
        p_cursor: 'cursor-abc',
        p_limit: 50,
        p_resource_types: ['document'],
        p_actions: ['create', 'update'],
        p_user_id: 'user-1',
      })
    })

    it('возвращает данные при успехе', async () => {
      const mockData = [
        { id: 'log-1', action: 'create', resource_type: 'document' },
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: mockData, error: null })

      const result = await getProjectHistory('p-1')
      expect(result).toEqual(mockData)
    })

    it('возвращает пустой массив если data=null', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: null, error: null })

      const result = await getProjectHistory('p-1')
      expect(result).toEqual([])
    })

    it('выбрасывает ApiError при ошибке RPC', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'permission denied' } })

      await expect(getProjectHistory('p-1')).rejects.toThrow(ApiError)
      await expect(getProjectHistory('p-1')).rejects.toThrow(/permission denied/)
    })
  })

  describe('getHistoryUnreadCount', () => {
    it('вызывает RPC get_history_unread_count с project_id', async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: 5, error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = rpcMock

      const result = await getHistoryUnreadCount('p-1')

      expect(rpcMock).toHaveBeenCalledWith('get_history_unread_count', {
        p_project_id: 'p-1',
      })
      expect(result).toBe(5)
    })

    it('возвращает 0 если data=null', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: null, error: null })

      const result = await getHistoryUnreadCount('p-1')
      expect(result).toBe(0)
    })

    it('выбрасывает ApiError при ошибке RPC', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'fail' } })

      await expect(getHistoryUnreadCount('p-1')).rejects.toThrow(ApiError)
    })
  })

  describe('markHistoryAsRead', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase as any).auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      }
    })

    it('делает upsert с user_id, project_id, last_read_at и onConflict', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(supabase.from).mockReturnValue({ upsert } as unknown as SupabaseFrom)

      await markHistoryAsRead('p-1')

      expect(supabase.from).toHaveBeenCalledWith('history_read_status')
      expect(upsert).toHaveBeenCalledTimes(1)
      const [payload, options] = upsert.mock.calls[0]
      expect(payload.user_id).toBe('user-1')
      expect(payload.project_id).toBe('p-1')
      expect(typeof payload.last_read_at).toBe('string')
      expect(options).toEqual({ onConflict: 'user_id,project_id' })
    })

    it('тихо выходит без вызовов если пользователь не авторизован', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase as any).auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      }
      const fromMock = vi.fn()
      vi.mocked(supabase.from).mockImplementation(fromMock)

      await markHistoryAsRead('p-1')

      // Никаких запросов к БД не делается
      expect(fromMock).not.toHaveBeenCalled()
    })

    it('выбрасывает ApiError если upsert вернул ошибку', async () => {
      const upsert = vi
        .fn()
        .mockResolvedValue({ error: { message: 'constraint violation' } })
      vi.mocked(supabase.from).mockReturnValue({ upsert } as unknown as SupabaseFrom)

      await expect(markHistoryAsRead('p-1')).rejects.toThrow(ApiError)
    })
  })
})
