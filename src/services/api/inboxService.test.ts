/**
 * Тесты для inboxService — обёртки над RPC для входящих
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getInboxThreadsV2, getInboxThreadOne } from './inboxService'
import { ApiError } from '@/services/errors/AppError'
import { mockSupabaseRpc, setSupabaseRpcMock } from '@/test/supabaseMocks'

vi.mock('@/lib/supabase')

describe('inboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getInboxThreadsV2', () => {
    it('вызывает RPC get_inbox_threads_v2 с workspaceId и userId', async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null })
      setSupabaseRpcMock(rpcMock)
      await getInboxThreadsV2('ws-2', 'user-2')

      expect(rpcMock).toHaveBeenCalledWith('get_inbox_threads_v2', {
        p_workspace_id: 'ws-2',
        p_user_id: 'user-2',
      })
    })

    it('возвращает массив записей тредов', async () => {
      const mockData = [
        {
          thread_id: 't-1',
          thread_name: 'Чат',
          channel_type: 'web',
          unread_count: 2,
        },
      ]
      mockSupabaseRpc({ data: mockData, error: null })

      const result = await getInboxThreadsV2('ws-1', 'user-1')
      expect(result).toEqual(mockData)
    })

    it('возвращает пустой массив если data=null', async () => {
      mockSupabaseRpc({ data: null, error: null })

      const result = await getInboxThreadsV2('ws-1', 'user-1')
      expect(result).toEqual([])
    })

    it('выбрасывает ApiError при ошибке RPC', async () => {
      mockSupabaseRpc({ data: null, error: { message: 'fail' } })

      await expect(getInboxThreadsV2('ws-1', 'user-1')).rejects.toThrow(ApiError)
    })
  })

  describe('getInboxThreadOne', () => {
    it('вызывает RPC get_inbox_thread_one с workspaceId, userId и threadId', async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null })
      setSupabaseRpcMock(rpcMock)
      await getInboxThreadOne('ws-1', 'user-1', 'thr-1')

      expect(rpcMock).toHaveBeenCalledWith('get_inbox_thread_one', {
        p_workspace_id: 'ws-1',
        p_user_id: 'user-1',
        p_thread_id: 'thr-1',
      })
    })

    it('возвращает первую строку треда', async () => {
      const row = { thread_id: 'thr-1', last_read_at: '2026-05-28T21:13:30Z', unread_count: 0 }
      mockSupabaseRpc({ data: [row], error: null })

      const result = await getInboxThreadOne('ws-1', 'user-1', 'thr-1')
      expect(result).toEqual(row)
    })

    it('возвращает null если тред недоступен (пустой ответ)', async () => {
      mockSupabaseRpc({ data: [], error: null })

      const result = await getInboxThreadOne('ws-1', 'user-1', 'thr-1')
      expect(result).toBeNull()
    })

    it('выбрасывает ApiError при ошибке RPC', async () => {
      mockSupabaseRpc({ data: null, error: { message: 'fail' } })

      await expect(getInboxThreadOne('ws-1', 'user-1', 'thr-1')).rejects.toThrow(ApiError)
    })
  })
})
