/**
 * Тесты для useTrash — хуков корзины (восстановление и окончательное удаление).
 *
 * Покрывают критичные сценарии:
 *  - restore проекта/треда снимает is_deleted и правильно инвалидирует кэш
 *  - hard delete действительно вызывает supabase.from('…').delete()
 *  - ошибка supabase пробрасывается наружу (не проглатывается)
 *
 * Главная цель — поймать регрессии в инвалидации кэша, чтобы после восстановления
 * элемента UI гарантированно обновился.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  useRestoreProject,
  useRestoreThread,
  useHardDeleteProject,
  useHardDeleteThread,
  useTrashedProjects,
  useTrashedThreads,
} from './useTrash'
import { supabase } from '@/lib/supabase'
import { createQueryWrapper } from '@/test/testUtils'

type SupabaseFrom = ReturnType<typeof supabase.from>

// Мокаем аудит-сервис, чтобы не дёргать реальный supabase
vi.mock('@/services/auditService', () => ({
  logAuditAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRestoreProject', () => {
  it('выставляет is_deleted=false и инвалидирует trash + projects', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    vi.mocked(supabase.from).mockReturnValue({
      update: updateMock,
    } as unknown as SupabaseFrom)

    const { wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRestoreProject('ws-1'), { wrapper })

    result.current.mutate({ id: 'project-1', name: 'Test Project' })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // update вызван с правильными полями сброса мягкого удаления
    expect(supabase.from).toHaveBeenCalledWith('projects')
    expect(updateMock).toHaveBeenCalledWith({
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
    })

    // Инвалидированы все нужные ключи, чтобы UI сразу подхватил восстановление
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ['trash', 'ws-1'],
        ['projects', 'ws-1'],
        ['sidebar', 'projects', 'ws-1'],
        ['boards', 'projects', 'ws-1'],
      ]),
    )
  })

  it('пробрасывает ошибку supabase наружу (не проглатывает)', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: 'RLS violation' } }),
      }),
    } as unknown as SupabaseFrom)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useRestoreProject('ws-1'), { wrapper })

    result.current.mutate({ id: 'project-1', name: 'Test' })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})

describe('useRestoreThread', () => {
  it('выставляет is_deleted=false и инвалидирует urgentCount c workspaceId', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as unknown as SupabaseFrom)

    const { wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRestoreThread('ws-1'), { wrapper })

    result.current.mutate({
      id: 'thread-1',
      name: 'Задача',
      type: 'task',
      project_id: 'project-1',
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // Инвалидация urgent-tasks-count должна идти с workspaceId — без него счётчик
    // в инбоксе не пересчитывается (регресс S2 в аудите 2026-04-11).
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ['trash', 'ws-1'],
        ['workspace-tasks', 'ws-1'],
        ['my-urgent-tasks-count', 'ws-1'],
      ]),
    )
  })
})

describe('useHardDeleteProject', () => {
  it('вызывает supabase.from("projects").delete() и инвалидирует корзину', async () => {
    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    vi.mocked(supabase.from).mockReturnValue({
      delete: deleteMock,
    } as unknown as SupabaseFrom)

    const { wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useHardDeleteProject('ws-1'), { wrapper })
    result.current.mutate({ id: 'project-1', name: 'Test' })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(supabase.from).toHaveBeenCalledWith('projects')
    expect(deleteMock).toHaveBeenCalled()
    expect(invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)).toEqual(
      expect.arrayContaining([['trash', 'ws-1']]),
    )
  })

  it('пробрасывает ошибку при провале delete', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: 'FK constraint' } }),
      }),
    } as unknown as SupabaseFrom)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useHardDeleteProject('ws-1'), { wrapper })
    result.current.mutate({ id: 'project-1', name: 'Test' })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})

describe('useHardDeleteThread', () => {
  it('вызывает delete на project_threads', async () => {
    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    vi.mocked(supabase.from).mockReturnValue({
      delete: deleteMock,
    } as unknown as SupabaseFrom)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useHardDeleteThread('ws-1'), { wrapper })
    result.current.mutate({
      id: 'thread-1',
      name: 'Test',
      type: 'chat',
      project_id: 'project-1',
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(supabase.from).toHaveBeenCalledWith('project_threads')
    expect(deleteMock).toHaveBeenCalled()
  })
})

// ============================================================
// Read-хуки корзины — критичные контрактные проверки
// ============================================================
// useTrashedProjects/Threads должны:
//  1. ВСЕГДА фильтровать is_deleted=true (без этого корзина покажет
//     живые проекты — обратная сторона той же безопасности).
//  2. Фильтровать по workspace_id (защита от утечки между ws).
//  3. Сортировать deleted_at по убыванию (свежеудалённые сверху).

describe('useTrashedProjects', () => {
  it('возвращает пустой массив если workspaceId не задан', async () => {
    const fromMock = vi.fn()
    vi.mocked(supabase.from).mockImplementation(fromMock)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useTrashedProjects(undefined), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Запросов к БД быть не должно
    expect(fromMock).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('фильтрует по workspace_id и is_deleted=true, сортирует deleted_at desc', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq2 = vi.fn().mockReturnValue({ order })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'projects') {
        return { select } as unknown as SupabaseFrom
      }
      // participants для подгрузки имён
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as unknown as SupabaseFrom
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useTrashedProjects('ws-42'), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(supabase.from).toHaveBeenCalledWith('projects')
    expect(eq1).toHaveBeenCalledWith('workspace_id', 'ws-42')
    // КРИТИЧНО: корзина показывает только удалённые
    expect(eq2).toHaveBeenCalledWith('is_deleted', true)
    expect(order).toHaveBeenCalledWith('deleted_at', { ascending: false, nullsFirst: false })
  })

  it('возвращает массив проектов с deleted_by_name=null если participants пусты', async () => {
    const trashedRows = [
      {
        id: 'p-1',
        name: 'Удалённый',
        description: null,
        deleted_at: '2026-04-10T12:00:00Z',
        deleted_by: 'user-x',
        created_at: '2026-04-01T00:00:00Z',
      },
    ]

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: trashedRows, error: null }),
              }),
            }),
          }),
        } as unknown as SupabaseFrom
      }
      // participants — пусто
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as unknown as SupabaseFrom
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useTrashedProjects('ws-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].id).toBe('p-1')
    expect(result.current.data?.[0].deleted_by_name).toBe(null)
  })

  it('подгружает имя автора удаления из participants', async () => {
    const trashedRows = [
      {
        id: 'p-1',
        name: 'X',
        description: null,
        deleted_at: '2026-04-10T12:00:00Z',
        deleted_by: 'user-1',
        created_at: '2026-04-01T00:00:00Z',
      },
    ]

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: trashedRows, error: null }),
              }),
            }),
          }),
        } as unknown as SupabaseFrom
      }
      // participants — есть Иван Петров
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ user_id: 'user-1', name: 'Иван', last_name: 'Петров' }],
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useTrashedProjects('ws-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.[0].deleted_by_name).toBe('Иван Петров')
  })

  it('пробрасывает ошибку supabase наружу', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'permission denied' },
            }),
          }),
        }),
      }),
    } as unknown as SupabaseFrom)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useTrashedProjects('ws-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})

describe('useTrashedThreads', () => {
  it('возвращает пустой массив если workspaceId не задан', async () => {
    const fromMock = vi.fn()
    vi.mocked(supabase.from).mockImplementation(fromMock)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useTrashedThreads(undefined), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(fromMock).not.toHaveBeenCalled()
  })

  it('фильтрует по workspace_id и is_deleted=true', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq2 = vi.fn().mockReturnValue({ order })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'project_threads') {
        return { select } as unknown as SupabaseFrom
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as unknown as SupabaseFrom
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useTrashedThreads('ws-42'), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(supabase.from).toHaveBeenCalledWith('project_threads')
    expect(eq1).toHaveBeenCalledWith('workspace_id', 'ws-42')
    expect(eq2).toHaveBeenCalledWith('is_deleted', true)
    expect(order).toHaveBeenCalledWith('deleted_at', { ascending: false, nullsFirst: false })
  })

  it('маппит вложенный projects.name в project_name', async () => {
    const trashedRows = [
      {
        id: 't-1',
        name: 'Чат',
        type: 'chat',
        project_id: 'p-1',
        deleted_at: '2026-04-10T12:00:00Z',
        deleted_by: null,
        created_at: '2026-04-01T00:00:00Z',
        projects: { name: 'Дело Иванова' },
      },
    ]

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'project_threads') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: trashedRows, error: null }),
              }),
            }),
          }),
        } as unknown as SupabaseFrom
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as unknown as SupabaseFrom
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useTrashedThreads('ws-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.[0].project_name).toBe('Дело Иванова')
  })

  it('обрабатывает workspace-level тред (project_id=null, projects=null)', async () => {
    const trashedRows = [
      {
        id: 't-2',
        name: 'WS чат',
        type: 'chat',
        project_id: null,
        deleted_at: null,
        deleted_by: null,
        created_at: '2026-04-01T00:00:00Z',
        projects: null,
      },
    ]

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'project_threads') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: trashedRows, error: null }),
              }),
            }),
          }),
        } as unknown as SupabaseFrom
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as unknown as SupabaseFrom
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useTrashedThreads('ws-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.[0].project_id).toBe(null)
    expect(result.current.data?.[0].project_name).toBe(null)
  })
})
