/**
 * Тесты для inboxService — обёртки над RPC для входящих
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getInboxThreadsV2 } from './inboxService'
import { supabase } from '@/lib/supabase'
import { ApiError } from '@/services/errors/AppError'

vi.mock('@/lib/supabase')

describe('inboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
