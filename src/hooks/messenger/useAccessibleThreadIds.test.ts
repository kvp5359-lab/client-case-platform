/**
 * Тесты для useAccessibleThreadIds — единая точка фильтрации тредов проекта
 * по правам доступа.
 *
 * Этот хук — клиентское зеркало серверной RPC `get_workspace_threads`.
 * Если он отработает неправильно, пользователю покажут чужой чат.
 * Поэтому критично проверить ВСЕ ветки доступа из `canAccessThread`:
 *  - workspace-level (project_id=null)
 *  - администратор проекта
 *  - создатель треда
 *  - исполнитель задачи
 *  - access_type=all для участника
 *  - access_type=roles + пересечение
 *  - access_type=custom + членство
 *  - отказ для не-участника
 *
 * Также проверяем:
 *  - is_deleted треды НЕ попадают в результат (фильтр корзины)
 *  - undefined projectId не валит хук
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAccessibleThreadIds } from './useAccessibleThreadIds'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectThreads } from './useProjectThreads'
import { useThreadMembersMap } from '@/components/tasks/useThreadMembersMap'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'
import { supabase } from '@/lib/supabase'
import { createQueryWrapper } from '@/test/testUtils'

type SupabaseFrom = ReturnType<typeof supabase.from>

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))
vi.mock('./useProjectThreads', () => ({
  useProjectThreads: vi.fn(),
}))
vi.mock('@/components/tasks/useThreadMembersMap', () => ({
  useThreadMembersMap: vi.fn(),
}))
vi.mock('@/components/tasks/useTaskAssignees', () => ({
  useTaskAssigneesMap: vi.fn(),
}))

// ─── Хелперы для построения тредов ───

interface ThreadStub {
  id: string
  type: 'chat' | 'task'
  project_id: string | null
  access_type: string
  access_roles: string[] | null
  created_by: string | null
  is_deleted: boolean
}

function thread(overrides: Partial<ThreadStub> = {}): ThreadStub {
  return {
    id: 't-default',
    type: 'chat',
    project_id: 'proj-1',
    access_type: 'all',
    access_roles: null,
    created_by: 'someone-else',
    is_deleted: false,
    ...overrides,
  }
}

/**
 * Настройка моков для конкретного сценария.
 *
 * @param threads — какие треды вернёт useProjectThreads
 * @param myProjectData — что вернёт supabase для запроса участия пользователя:
 *                        null = пользователь не участник проекта
 * @param userId — id текущего пользователя (по умолчанию 'user-1')
 * @param threadMembersMap — маппинг thread_id → массив участников custom-тредов
 * @param taskAssigneesMap — маппинг thread_id → массив исполнителей задач
 */
function setupHookMocks(opts: {
  threads: ThreadStub[]
  myProjectData?: { participant_id: string; project_roles: string[] } | null
  userId?: string
  threadMembersMap?: Record<string, Array<{ id: string }>>
  taskAssigneesMap?: Record<string, Array<{ id: string }>>
}) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: opts.userId ?? 'user-1' },
  } as unknown as ReturnType<typeof useAuth>)

  vi.mocked(useProjectThreads).mockReturnValue({
    data: opts.threads,
    isLoading: false,
  } as unknown as ReturnType<typeof useProjectThreads>)

  vi.mocked(useThreadMembersMap).mockReturnValue({
    data: opts.threadMembersMap ?? {},
  } as unknown as ReturnType<typeof useThreadMembersMap>)

  vi.mocked(useTaskAssigneesMap).mockReturnValue({
    data: opts.taskAssigneesMap ?? {},
  } as unknown as ReturnType<typeof useTaskAssigneesMap>)

  // useMyProjectData делает прямой supabase-запрос к project_participants
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'project_participants') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: opts.myProjectData ?? null, error: null }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom
    }
    return {} as unknown as SupabaseFrom
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAccessibleThreadIds', () => {
  it('возвращает пустые структуры для undefined projectId', async () => {
    setupHookMocks({ threads: [], myProjectData: null })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useAccessibleThreadIds(undefined), { wrapper })

    await waitFor(() => {
      expect(result.current.accessibleThreadIds.size).toBe(0)
    })
    expect(result.current.accessibleChats).toEqual([])
  })

  it('исключает is_deleted треды из результата', async () => {
    const liveThread = thread({ id: 't-live', is_deleted: false })
    const deletedThread = thread({ id: 't-deleted', is_deleted: true })

    setupHookMocks({
      threads: [liveThread, deletedThread],
      myProjectData: { participant_id: 'p-1', project_roles: ['Член'] },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.accessibleThreadIds.has('t-live')).toBe(true)
    })

    expect(result.current.accessibleThreadIds.has('t-deleted')).toBe(false)
    expect(result.current.accessibleChats.map((t) => t.id)).toEqual(['t-live'])
  })

  describe('правила доступа', () => {
    it('workspace-level тред (project_id=null) доступен всем', async () => {
      const wsThread = thread({
        id: 't-ws',
        project_id: null,
        access_type: 'custom',
      })

      setupHookMocks({
        threads: [wsThread],
        myProjectData: null, // даже не участник
      })

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      await waitFor(() => {
        expect(result.current.accessibleThreadIds.has('t-ws')).toBe(true)
      })
    })

    it('администратор проекта видит всё, даже custom-треды', async () => {
      const customThread = thread({
        id: 't-custom',
        access_type: 'custom',
      })

      setupHookMocks({
        threads: [customThread],
        myProjectData: { participant_id: 'p-1', project_roles: ['Администратор'] },
      })

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      await waitFor(() => {
        expect(result.current.accessibleThreadIds.has('t-custom')).toBe(true)
      })
    })

    it('создатель треда видит свой custom-тред', async () => {
      const myThread = thread({
        id: 't-mine',
        access_type: 'custom',
        created_by: 'user-1',
      })

      setupHookMocks({
        threads: [myThread],
        myProjectData: { participant_id: 'p-1', project_roles: ['Член'] },
        userId: 'user-1',
      })

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      await waitFor(() => {
        expect(result.current.accessibleThreadIds.has('t-mine')).toBe(true)
      })
    })

    it('исполнитель задачи видит её', async () => {
      const task = thread({
        id: 't-task',
        type: 'task',
        access_type: 'custom',
        created_by: 'someone-else',
      })

      setupHookMocks({
        threads: [task],
        myProjectData: { participant_id: 'me', project_roles: ['Член'] },
        taskAssigneesMap: { 't-task': [{ id: 'me' }] },
      })

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      await waitFor(() => {
        expect(result.current.accessibleThreadIds.has('t-task')).toBe(true)
      })
    })

    it('access_type=all даёт доступ участнику проекта', async () => {
      const allThread = thread({ id: 't-all', access_type: 'all' })

      setupHookMocks({
        threads: [allThread],
        myProjectData: { participant_id: 'p-1', project_roles: ['Член'] },
      })

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      await waitFor(() => {
        expect(result.current.accessibleThreadIds.has('t-all')).toBe(true)
      })
    })

    it('access_type=all НЕ даёт доступ не-участнику проекта', async () => {
      const allThread = thread({ id: 't-all', access_type: 'all' })

      setupHookMocks({
        threads: [allThread],
        myProjectData: null, // не участник
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      // Дождёмся пока запрос участника отстреляется
      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
      })

      expect(result.current.accessibleThreadIds.has('t-all')).toBe(false)
    })

    it('access_type=roles даёт доступ при пересечении ролей', async () => {
      const rolesThread = thread({
        id: 't-roles',
        access_type: 'roles',
        access_roles: ['Юрист', 'Координатор'],
      })

      setupHookMocks({
        threads: [rolesThread],
        myProjectData: { participant_id: 'p-1', project_roles: ['Юрист'] },
      })

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      await waitFor(() => {
        expect(result.current.accessibleThreadIds.has('t-roles')).toBe(true)
      })
    })

    it('access_type=roles НЕ даёт доступ при отсутствии пересечения', async () => {
      const rolesThread = thread({
        id: 't-roles',
        access_type: 'roles',
        access_roles: ['Юрист'],
      })

      setupHookMocks({
        threads: [rolesThread],
        myProjectData: { participant_id: 'p-1', project_roles: ['Стажёр'] },
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
      })

      expect(result.current.accessibleThreadIds.has('t-roles')).toBe(false)
    })

    it('access_type=custom даёт доступ члену треда', async () => {
      const customThread = thread({ id: 't-custom', access_type: 'custom' })

      setupHookMocks({
        threads: [customThread],
        myProjectData: { participant_id: 'me', project_roles: ['Член'] },
        threadMembersMap: { 't-custom': [{ id: 'me' }] },
      })

      const { wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      await waitFor(() => {
        expect(result.current.accessibleThreadIds.has('t-custom')).toBe(true)
      })
    })

    it('access_type=custom НЕ даёт доступ не-члену треда', async () => {
      const customThread = thread({ id: 't-custom', access_type: 'custom' })

      setupHookMocks({
        threads: [customThread],
        myProjectData: { participant_id: 'me', project_roles: ['Член'] },
        threadMembersMap: { 't-custom': [{ id: 'someone-else' }] },
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
      })

      expect(result.current.accessibleThreadIds.has('t-custom')).toBe(false)
    })
  })

  describe('фильтрация смешанных списков', () => {
    it('возвращает только доступные треды из большого набора', async () => {
      const threads: ThreadStub[] = [
        // Доступен — workspace-level
        thread({ id: 't-ws', project_id: null, access_type: 'custom' }),
        // Доступен — access_type=all и я участник
        thread({ id: 't-all', access_type: 'all' }),
        // НЕ доступен — custom без членства
        thread({ id: 't-custom-no', access_type: 'custom' }),
        // Доступен — custom с членством
        thread({ id: 't-custom-yes', access_type: 'custom' }),
        // Удалённый — пропускаем независимо от прав
        thread({
          id: 't-deleted',
          access_type: 'all',
          is_deleted: true,
        }),
        // Доступен — я создатель
        thread({
          id: 't-mine',
          access_type: 'custom',
          created_by: 'user-1',
        }),
        // НЕ доступен — roles без пересечения
        thread({
          id: 't-other-role',
          access_type: 'roles',
          access_roles: ['Босс'],
        }),
      ]

      setupHookMocks({
        threads,
        myProjectData: { participant_id: 'me', project_roles: ['Член'] },
        userId: 'user-1',
        threadMembersMap: { 't-custom-yes': [{ id: 'me' }] },
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

      // Ждём пока запрос участника проекта завершится, иначе t-all/t-roles
      // не успеют применить правила (требуется myData)
      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
        expect(result.current.accessibleThreadIds.has('t-all')).toBe(true)
      })

      // Должны быть доступны
      expect(result.current.accessibleThreadIds.has('t-ws')).toBe(true)
      expect(result.current.accessibleThreadIds.has('t-all')).toBe(true)
      expect(result.current.accessibleThreadIds.has('t-custom-yes')).toBe(true)
      expect(result.current.accessibleThreadIds.has('t-mine')).toBe(true)

      // Не должны
      expect(result.current.accessibleThreadIds.has('t-custom-no')).toBe(false)
      expect(result.current.accessibleThreadIds.has('t-deleted')).toBe(false)
      expect(result.current.accessibleThreadIds.has('t-other-role')).toBe(false)

      // accessibleChats не содержит удалённый и недоступные
      const chatIds = result.current.accessibleChats.map((t) => t.id)
      expect(chatIds).not.toContain('t-deleted')
      expect(chatIds).not.toContain('t-custom-no')
      expect(chatIds).not.toContain('t-other-role')
    })
  })

  it('возвращает allThreads без фильтрации (включая удалённые)', async () => {
    // allThreads — это «сырой» список из useProjectThreads,
    // компонент использует его для построения статистики/счётчиков.
    const threads: ThreadStub[] = [
      thread({ id: 't-1' }),
      thread({ id: 't-2', is_deleted: true }),
    ]

    setupHookMocks({
      threads,
      myProjectData: { participant_id: 'me', project_roles: ['Член'] },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useAccessibleThreadIds('proj-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.allThreads).toHaveLength(2)
    })

    expect(result.current.allThreads.map((t) => t.id)).toEqual(['t-1', 't-2'])
  })
})
