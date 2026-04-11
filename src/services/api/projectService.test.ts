/**
 * Тесты для projectService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getProjectById,
  getProjectsByWorkspace,
  createProject,
  updateProject,
  deleteProject,
} from './projectService'
import { supabase } from '@/lib/supabase'
import { ProjectError } from '../errors/AppError'

type SupabaseFrom = ReturnType<typeof supabase.from>

// Мокаем Supabase
vi.mock('@/lib/supabase')

describe('projectService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getProjectById', () => {
    it('должен вернуть проект по ID', async () => {
      const mockProject = {
        id: 'project-1',
        name: 'Test Project',
        workspace_id: 'workspace-1',
        status: 'active',
        created_at: '2024-01-01',
      }

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockProject,
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getProjectById('project-1')

      expect(result).toEqual(mockProject)
      expect(supabase.from).toHaveBeenCalledWith('projects')
    })

    it('должен выбросить ProjectError при ошибке', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(getProjectById('invalid-id')).rejects.toThrow(ProjectError)
    })
  })

  describe('getProjectsByWorkspace', () => {
    // Цепочка: .select → .eq(workspace_id) → .eq(is_deleted, false) → .order → .limit
    const mockProjectsListChain = (data: unknown) =>
      ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data, error: null }),
              }),
            }),
          }),
        }),
      }) as unknown as SupabaseFrom

    it('должен вернуть список проектов workspace', async () => {
      const mockProjects = [
        { id: 'project-1', name: 'Project 1', workspace_id: 'workspace-1' },
        { id: 'project-2', name: 'Project 2', workspace_id: 'workspace-1' },
      ]

      vi.mocked(supabase.from).mockReturnValue(mockProjectsListChain(mockProjects))

      const result = await getProjectsByWorkspace('workspace-1')

      expect(result).toEqual(mockProjects)
      expect(result).toHaveLength(2)
    })

    it('должен вернуть пустой массив если нет проектов', async () => {
      vi.mocked(supabase.from).mockReturnValue(mockProjectsListChain([]))

      const result = await getProjectsByWorkspace('workspace-1')

      expect(result).toEqual([])
    })
  })

  describe('createProject', () => {
    it('должен создать новый проект', async () => {
      const newProject = {
        name: 'New Project',
        workspace_id: 'workspace-1',
        template_id: 'template-1',
      }

      const createdProject = {
        id: 'project-new',
        ...newProject,
        status: 'active',
        created_at: '2024-01-01',
      }

      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: createdProject,
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await createProject(
        newProject as unknown as Parameters<typeof createProject>[0],
      )

      expect(result).toEqual(createdProject)
      expect(supabase.from).toHaveBeenCalledWith('projects')
    })

    it('должен выбросить ProjectError при ошибке создания', async () => {
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
        createProject({ name: 'Test', workspace_id: 'ws-1' } as unknown as Parameters<
          typeof createProject
        >[0]),
      ).rejects.toThrow(ProjectError)
    })
  })

  describe('updateProject', () => {
    it('должен обновить проект', async () => {
      const updates = { name: 'Updated Name', status: 'completed' }
      const updatedProject = {
        id: 'project-1',
        ...updates,
        workspace_id: 'workspace-1',
        created_at: '2024-01-01',
      }

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: updatedProject,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await updateProject('project-1', updates)

      expect(result).toEqual(updatedProject)
      expect(supabase.from).toHaveBeenCalledWith('projects')
    })
  })

  describe('deleteProject', () => {
    beforeEach(() => {
      // deleteProject теперь делает мягкое удаление и читает текущего пользователя
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase as any).auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      }
    })

    it('должен пометить проект как удалённый (soft delete)', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: null,
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(deleteProject('project-1')).resolves.not.toThrow()
    })

    it('должен выбросить ProjectError при ошибке удаления', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: { message: 'Update failed' },
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(deleteProject('invalid-id')).rejects.toThrow(ProjectError)
    })
  })

  // ============================================================
  // Контрактные проверки фильтров безопасности
  // ============================================================
  // Эти тесты гарантируют, что запросы к БД содержат правильные
  // фильтры — особенно is_deleted=false (защита корзины) и
  // workspace_id (защита от утечки между воркспейсами).

  describe('фильтры запроса getProjectsByWorkspace', () => {
    it('фильтрует по workspace_id и исключает is_deleted=true', async () => {
      const limit = vi.fn().mockResolvedValue({ data: [], error: null })
      const order = vi.fn().mockReturnValue({ limit })
      const eq2 = vi.fn().mockReturnValue({ order })
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
      const select = vi.fn().mockReturnValue({ eq: eq1 })
      vi.mocked(supabase.from).mockReturnValue({ select } as unknown as SupabaseFrom)

      await getProjectsByWorkspace('workspace-42')

      expect(supabase.from).toHaveBeenCalledWith('projects')
      expect(eq1).toHaveBeenCalledWith('workspace_id', 'workspace-42')
      // КРИТИЧНО: исключение проектов в корзине
      expect(eq2).toHaveBeenCalledWith('is_deleted', false)
      expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
      // Лимит 200 — защита от случайной выгрузки гигантских воркспейсов
      expect(limit).toHaveBeenCalledWith(200)
    })
  })

  describe('фильтры запроса getProjectById', () => {
    it('фильтрует по id и использует single', async () => {
      const single = vi.fn().mockResolvedValue({
        data: { id: 'p-1', name: 'X' },
        error: null,
      })
      const eq = vi.fn().mockReturnValue({ single })
      const select = vi.fn().mockReturnValue({ eq })
      vi.mocked(supabase.from).mockReturnValue({ select } as unknown as SupabaseFrom)

      await getProjectById('p-1')

      expect(supabase.from).toHaveBeenCalledWith('projects')
      expect(select).toHaveBeenCalledWith('*')
      expect(eq).toHaveBeenCalledWith('id', 'p-1')
    })
  })

  describe('контракт deleteProject (soft delete)', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase as any).auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-42' } } }),
      }
    })

    it('выставляет is_deleted=true, deleted_at и deleted_by, фильтрует по id', async () => {
      const eq = vi.fn().mockResolvedValue({ error: null })
      const update = vi.fn().mockReturnValue({ eq })
      vi.mocked(supabase.from).mockReturnValue({ update } as unknown as SupabaseFrom)

      await deleteProject('p-99')

      expect(supabase.from).toHaveBeenCalledWith('projects')
      // КРИТИЧНО: проверяем что это именно soft delete, а не DELETE
      expect(update).toHaveBeenCalledTimes(1)
      const updatePayload = update.mock.calls[0][0]
      expect(updatePayload.is_deleted).toBe(true)
      expect(updatePayload.deleted_at).toBeDefined()
      expect(typeof updatePayload.deleted_at).toBe('string')
      // Записан текущий пользователь — для аудита
      expect(updatePayload.deleted_by).toBe('user-42')
      // Только конкретный проект, не вся таблица
      expect(eq).toHaveBeenCalledWith('id', 'p-99')
    })

    it('записывает deleted_by=null если нет авторизованного пользователя', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase as any).auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      }
      const eq = vi.fn().mockResolvedValue({ error: null })
      const update = vi.fn().mockReturnValue({ eq })
      vi.mocked(supabase.from).mockReturnValue({ update } as unknown as SupabaseFrom)

      await deleteProject('p-99')

      const updatePayload = update.mock.calls[0][0]
      expect(updatePayload.deleted_by).toBe(null)
    })
  })

  describe('контракт createProject', () => {
    it('передаёт переданные данные в insert и возвращает single result', async () => {
      const newProject = {
        name: 'Test',
        workspace_id: 'ws-1',
      } as unknown as Parameters<typeof createProject>[0]
      const single = vi.fn().mockResolvedValue({
        data: { id: 'new', ...newProject },
        error: null,
      })
      const select = vi.fn().mockReturnValue({ single })
      const insert = vi.fn().mockReturnValue({ select })
      vi.mocked(supabase.from).mockReturnValue({ insert } as unknown as SupabaseFrom)

      await createProject(newProject)

      expect(insert).toHaveBeenCalledWith(newProject)
    })
  })

  describe('контракт updateProject', () => {
    it('передаёт обновления в update и фильтрует по id', async () => {
      const updates = { name: 'New name', status: 'completed' }
      const single = vi.fn().mockResolvedValue({
        data: { id: 'p-1', ...updates },
        error: null,
      })
      const select = vi.fn().mockReturnValue({ single })
      const eq = vi.fn().mockReturnValue({ select })
      const update = vi.fn().mockReturnValue({ eq })
      vi.mocked(supabase.from).mockReturnValue({ update } as unknown as SupabaseFrom)

      await updateProject('p-1', updates as unknown as Parameters<typeof updateProject>[1])

      expect(update).toHaveBeenCalledWith(updates)
      expect(eq).toHaveBeenCalledWith('id', 'p-1')
    })
  })
})
