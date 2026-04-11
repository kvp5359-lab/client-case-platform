/**
 * Тесты для participantService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getParticipantsByWorkspace, getParticipantName } from './participantService'
import { supabase } from '@/lib/supabase'
import { ParticipantError } from '../errors'

type SupabaseFrom = ReturnType<typeof supabase.from>

// Мокаем Supabase
vi.mock('@/lib/supabase')

describe('participantService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================
  // getParticipantsByWorkspace
  // ============================================================

  describe('getParticipantsByWorkspace', () => {
    it('должен вернуть список участников workspace', async () => {
      const mockParticipants = [
        { id: 'p-1', name: 'Алексей', email: 'alexey@example.com' },
        { id: 'p-2', name: 'Мария', email: 'maria@example.com' },
      ]

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockParticipants,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getParticipantsByWorkspace('workspace-1')

      expect(result).toEqual(mockParticipants)
      expect(result).toHaveLength(2)
      expect(supabase.from).toHaveBeenCalledWith('participants')
    })

    it('должен вернуть пустой массив если нет участников', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getParticipantsByWorkspace('workspace-1')

      expect(result).toEqual([])
    })

    it('должен вернуть пустой массив если data = null', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getParticipantsByWorkspace('workspace-1')

      expect(result).toEqual([])
    })

    it('должен выбросить ParticipantError при ошибке запроса', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Query failed' },
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(getParticipantsByWorkspace('workspace-1')).rejects.toThrow(ParticipantError)
    })
  })

  // ============================================================
  // getParticipantName
  // ============================================================

  describe('getParticipantName', () => {
    it('должен вернуть имя участника по user_id', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { name: 'Иван Петров' },
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getParticipantName('user-1')

      expect(result).toBe('Иван Петров')
      expect(supabase.from).toHaveBeenCalledWith('participants')
    })

    it('должен вернуть null если участник не найден', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getParticipantName('unknown-user')

      expect(result).toBeNull()
    })

    it('должен вернуть null если имя не задано (name = null)', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { name: null },
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getParticipantName('user-no-name')

      expect(result).toBeNull()
    })

    it('должен выбросить ParticipantError при ошибке запроса', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Query failed' },
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(getParticipantName('user-1')).rejects.toThrow(ParticipantError)
    })
  })

  // ============================================================
  // Контрактные проверки фильтров безопасности
  // ============================================================
  // Эти тесты гарантируют, что запросы к БД содержат правильные
  // фильтры. Если кто-то случайно уберёт .eq('is_deleted', false)
  // или .eq('workspace_id', ...) — тест упадёт.

  describe('фильтры запроса getParticipantsByWorkspace', () => {
    it('фильтрует по workspace_id и исключает удалённых', async () => {
      const eq2 = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
      const select = vi.fn().mockReturnValue({ eq: eq1 })
      vi.mocked(supabase.from).mockReturnValue({ select } as unknown as SupabaseFrom)

      await getParticipantsByWorkspace('workspace-42')

      expect(supabase.from).toHaveBeenCalledWith('participants')
      // Запрос только нужных колонок (не SELECT *)
      expect(select).toHaveBeenCalledWith('id, name, email')
      // Первый фильтр — workspace_id
      expect(eq1).toHaveBeenCalledWith('workspace_id', 'workspace-42')
      // Второй фильтр — обязательно is_deleted=false (защита от утечки удалённых)
      expect(eq2).toHaveBeenCalledWith('is_deleted', false)
    })

    it('сортирует по name по возрастанию', async () => {
      const order = vi.fn().mockResolvedValue({ data: [], error: null })
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ order }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await getParticipantsByWorkspace('ws-1')

      expect(order).toHaveBeenCalledWith('name', { ascending: true })
    })
  })

  describe('фильтры запроса getParticipantName', () => {
    it('фильтрует по user_id и использует maybeSingle', async () => {
      const eq = vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })
      const select = vi.fn().mockReturnValue({ eq })
      vi.mocked(supabase.from).mockReturnValue({ select } as unknown as SupabaseFrom)

      await getParticipantName('user-42')

      expect(supabase.from).toHaveBeenCalledWith('participants')
      // Запрос только колонки name
      expect(select).toHaveBeenCalledWith('name')
      // Фильтр по user_id
      expect(eq).toHaveBeenCalledWith('user_id', 'user-42')
    })
  })
})
