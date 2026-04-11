/**
 * Тесты для inboxService — обёртки над RPC для входящих
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getInboxThreads, getInboxThreadsV2 } from './inboxService'
import { supabase } from '@/lib/supabase'
import { ApiError } from '@/services/errors/AppError'

vi.mock('@/lib/supabase')

describe('inboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getInboxThreads (v1)', () => {
    it('вызывает RPC get_inbox_threads с workspaceId и userId', async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = rpcMock

      await getInboxThreads('ws-1', 'user-1')

      expect(rpcMock).toHaveBeenCalledWith('get_inbox_threads', {
        p_workspace_id: 'ws-1',
        p_user_id: 'user-1',
      })
    })

    it('возвращает массив тредов', async () => {
      const mockData = [
        { project_id: 'p-1', project_name: 'Test', unread_count: 3 },
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: mockData, error: null })

      const result = await getInboxThreads('ws-1', 'user-1')
      expect(result).toEqual(mockData)
    })

    it('возвращает пустой массив если data=null', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: null, error: null })

      const result = await getInboxThreads('ws-1', 'user-1')
      expect(result).toEqual([])
    })

    it('выбрасывает ApiError при ошибке RPC', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'no access' } })

      await expect(getInboxThreads('ws-1', 'user-1')).rejects.toThrow(ApiError)
      await expect(getInboxThreads('ws-1', 'user-1')).rejects.toThrow(/no access/)
    })
  })

  describe('getInboxThreadsV2', () => {
    it('вызывает RPC get_inbox_threads_v2 с workspaceId и userId', async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = rpcMock

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: mockData, error: null })

      const result = await getInboxThreadsV2('ws-1', 'user-1')
      expect(result).toEqual(mockData)
    })

    it('возвращает пустой массив если data=null', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: null, error: null })

      const result = await getInboxThreadsV2('ws-1', 'user-1')
      expect(result).toEqual([])
    })

    it('выбрасывает ApiError при ошибке RPC', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.rpc as any) = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'fail' } })

      await expect(getInboxThreadsV2('ws-1', 'user-1')).rejects.toThrow(ApiError)
    })
  })
})
