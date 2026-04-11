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
