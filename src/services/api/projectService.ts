/**
 * Сервис для работы с проектами
 * Инкапсулирует всю логику взаимодействия с Supabase для проектов
 */

import { supabase } from '@/lib/supabase'
import { Tables } from '@/types/database'
import { ProjectError } from '../errors'
import { safeFetchOrThrow, safeDeleteOrThrow } from '../supabase/queryHelpers'

export type Project = Tables<'projects'>
export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'updated_at'>
export type ProjectUpdate = Partial<ProjectInsert>

/**
 * Получение проекта по ID
 */
export async function getProjectById(projectId: string): Promise<Project> {
  return safeFetchOrThrow(
    supabase.from('projects').select('*').eq('id', projectId).single(),
    'Не удалось загрузить проект',
    ProjectError,
  )
}

/**
 * Получение списка проектов для workspace
 */
export async function getProjectsByWorkspace(workspaceId: string): Promise<Project[]> {
  return (
    (await safeFetchOrThrow(
      supabase
        .from('projects')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(200),
      'Не удалось загрузить проекты',
      ProjectError,
    )) ?? []
  )
}

/**
 * Создание нового проекта
 */
export async function createProject(project: ProjectInsert): Promise<Project> {
  return safeFetchOrThrow(
    supabase.from('projects').insert(project).select().single(),
    'Не удалось создать проект',
    ProjectError,
  )
}

/**
 * Обновление проекта
 */
export async function updateProject(projectId: string, updates: ProjectUpdate): Promise<Project> {
  return safeFetchOrThrow(
    supabase.from('projects').update(updates).eq('id', projectId).select().single(),
    'Не удалось обновить проект',
    ProjectError,
  )
}

/**
 * Удаление проекта
 */
export async function deleteProject(projectId: string): Promise<void> {
  return safeDeleteOrThrow(
    supabase.from('projects').delete().eq('id', projectId),
    'Не удалось удалить проект',
    ProjectError,
  )
}

/**
 * Обновление ссылки на Google Drive
 */
export async function updateProjectGoogleDrive(
  projectId: string,
  googleDriveFolderLink: string | null,
  googleDriveFolderName: string | null = null,
): Promise<Project> {
  return safeFetchOrThrow(
    supabase
      .from('projects')
      .update({
        google_drive_folder_link: googleDriveFolderLink,
        google_drive_folder_name: googleDriveFolderName,
      })
      .eq('id', projectId)
      .select()
      .single(),
    'Не удалось обновить ссылку на Google Drive',
    ProjectError,
  )
}
