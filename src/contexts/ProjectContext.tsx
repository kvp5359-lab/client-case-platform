"use client"

/**
 * ProjectContext — контекст для управления данными текущего проекта
 * Устраняет prop drilling project data через компоненты
 *
 * Предоставляет:
 * - Данные текущего проекта
 * - Данные шаблона проекта
 * - Загрузочное состояние
 * - Методы для обновления проекта
 */

import { createContext, useContext, ReactNode, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { projectKeys } from '@/hooks/queryKeys'
import type { Database } from '@/types/database'

type Project = Database['public']['Tables']['projects']['Row']
type ProjectTemplate = Database['public']['Tables']['project_templates']['Row']

/** Тип данных, возвращаемых из SELECT с JOIN project_templates */
interface ProjectWithTemplate extends Project {
  project_templates: ProjectTemplate | null
}

// === ТИПЫ ===

interface ProjectContextValue {
  project: Project | null
  projectTemplate: ProjectTemplate | null
  projectId: string | null
  loading: boolean
  error: string | null
  refreshProject: () => Promise<void>
  updateProject: (updates: Partial<Project>) => Promise<void>
}

// === КОНТЕКСТ ===

const ProjectContext = createContext<ProjectContextValue | null>(null)

// === ПРОВАЙДЕР ===

interface ProjectProviderProps {
  children: ReactNode
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()

  const {
    data: projectData,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: projectKeys.detail(projectId ?? ''),
    queryFn: async (): Promise<ProjectWithTemplate> => {
      const { data, error } = await supabase
        .from('projects')
        .select(
          `
          *,
          project_templates (*)
        `,
        )
        .eq('id', projectId ?? '')
        .single()

      if (error) throw error
      return data as unknown as ProjectWithTemplate
    },
    enabled: !!projectId,
  })

  const project = projectData ?? null
  const projectTemplate = projectData?.project_templates ?? null

  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : 'Не удалось загрузить проект'
    : null

  // Public API для обновления проекта
  const refreshProject = useCallback(async () => {
    if (projectId) {
      await queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
    }
  }, [projectId, queryClient])

  // Public API для обновления полей проекта
  const updateProject = useCallback(
    async (updates: Partial<Project>) => {
      if (!projectId) return

      const { error: updateError } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId)

      if (updateError) {
        toast.error('Не удалось обновить проект')
        throw new Error(updateError.message)
      }

      // Обновляем кэш после успешной мутации
      await queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
    },
    [projectId, queryClient],
  )

  const value = useMemo<ProjectContextValue>(
    () => ({
      project,
      projectTemplate,
      projectId: projectId ?? null,
      loading,
      error,
      refreshProject,
      updateProject,
    }),
    [project, projectTemplate, projectId, loading, error, refreshProject, updateProject],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

// === ХУК ===

// eslint-disable-next-line react-refresh/only-export-components
export function useProject() {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject must be used within ProjectProvider')
  }
  return context
}

// === ЭКСПОРТ ТИПОВ ===

export type { Project, ProjectTemplate, ProjectContextValue }
