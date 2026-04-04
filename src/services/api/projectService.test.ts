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
    it('должен вернуть список проектов workspace', async () => {
      const mockProjects = [
        { id: 'project-1', name: 'Project 1', workspace_id: 'workspace-1' },
        { id: 'project-2', name: 'Project 2', workspace_id: 'workspace-1' },
      ]

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: mockProjects,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getProjectsByWorkspace('workspace-1')

      expect(result).toEqual(mockProjects)
      expect(result).toHaveLength(2)
    })

    it('должен вернуть пустой массив если нет проектов', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

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
    it('должен удалить проект', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: null,
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(deleteProject('project-1')).resolves.not.toThrow()
    })

    it('должен выбросить ProjectError при ошибке удаления', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: { message: 'Delete failed' },
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(deleteProject('invalid-id')).rejects.toThrow(ProjectError)
    })
  })
})
