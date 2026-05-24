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

import { createContext, useContext, ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { projectKeys } from '@/hooks/queryKeys'
import { useDocumentKitUIStore } from '@/store/documentKitUI/store'
import type { Database } from '@/types/database'

type Project = Database['public']['Tables']['projects']['Row']
type ProjectTemplate = Database['public']['Tables']['project_templates']['Row']

/** Тип данных, возвращаемых из SELECT с JOIN project_templates */
type ProjectWithTemplate = {
  project_templates: ProjectTemplate | null
} & Project

// === ТИПЫ ===

type ProjectContextValue = {
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

type ProjectProviderProps = {
  children: ReactNode
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()

  // При смене проекта сбрасываем UI-стор документного набора — иначе
  // возвращаясь на старый проект пользователь видит чужие открытые
  // диалоги/раскрытые папки/editForm из прошлого визита.
  const prevProjectIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevProjectIdRef.current && prevProjectIdRef.current !== projectId) {
      useDocumentKitUIStore.getState().resetState()
    }
    prevProjectIdRef.current = projectId ?? null
  }, [projectId])

  const {
    data: projectData,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: projectKeys.detail(projectId ?? ''),
    queryFn: async (): Promise<ProjectWithTemplate> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, project_templates (*)')
        .eq('id', projectId ?? '')
        .maybeSingle<ProjectWithTemplate>()

      if (error) throw error
      if (!data) throw new Error('Проект не найден или нет доступа')
      return data
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

export function useProject() {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject must be used within ProjectProvider')
  }
  return context
}

// === ЭКСПОРТ ТИПОВ ===

export type { Project, ProjectTemplate, ProjectContextValue }
