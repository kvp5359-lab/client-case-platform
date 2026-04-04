"use client"

/**
 * Хук для мутаций проекта (обновление, удаление)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProject } from '@/services/api/projectService'
import { useErrorHandler } from '@/hooks/shared'
import { projectKeys } from '@/hooks/queryKeys'
import type { ProjectUpdate } from '@/types/entities'

export function useProjectMutations(projectId: string | undefined) {
  const queryClient = useQueryClient()
  const { handleError } = useErrorHandler()

  // Мутация для обновления названия проекта
  const updateProjectName = useMutation({
    mutationFn: async (newName: string) => {
      if (!projectId) throw new Error('Project ID is required')
      return await updateProject(projectId, { name: newName })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId!) })
    },
    onError: (error) => {
      handleError(error, 'Не удалось обновить название проекта')
    },
  })

  // Мутация для обновления статуса проекта
  const updateProjectStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!projectId) throw new Error('Project ID is required')
      return await updateProject(projectId, { status })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId!) })
    },
    onError: (error) => {
      handleError(error, 'Не удалось обновить статус проекта')
    },
  })

  // Мутация для обновления дедлайна проекта
  const updateProjectDeadline = useMutation({
    mutationFn: async (deadline: Date | undefined) => {
      if (!projectId) throw new Error('Project ID is required')
      const newDeadline = deadline ? deadline.toISOString().split('T')[0] : null
      return await updateProject(projectId, { deadline: newDeadline })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId!) })
    },
    onError: (error) => {
      handleError(error, 'Не удалось обновить дедлайн проекта')
    },
  })

  // Мутация для обновления Google Drive ссылки
  const updateProjectGoogleDrive = useMutation({
    mutationFn: async (googleDriveLink: string | null) => {
      if (!projectId) throw new Error('Project ID is required')
      return await updateProject(projectId, {
        google_drive_folder_link: googleDriveLink,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId!) })
    },
    onError: (error) => {
      handleError(error, 'Не удалось обновить ссылку на Google Drive')
    },
  })

  // Общая мутация для обновления любых полей
  const updateProjectFields = useMutation({
    mutationFn: async (updates: ProjectUpdate) => {
      if (!projectId) throw new Error('Project ID is required')
      return await updateProject(projectId, updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId!) })
    },
    onError: (error) => {
      handleError(error, 'Не удалось обновить проект')
    },
  })

  return {
    updateProjectName,
    updateProjectStatus,
    updateProjectDeadline,
    updateProjectGoogleDrive,
    updateProjectFields,
  }
}
