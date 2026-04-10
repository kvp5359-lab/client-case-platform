/**
 * Сервис для работы с проектами
 * Инкапсулирует всю логику взаимодействия с Supabase для проектов
 */

import { supabase } from '@/lib/supabase'
import { Tables } from '@/types/database'
import { ProjectError } from '../errors'
import { safeFetchOrThrow } from '../supabase/queryHelpers'

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
 * Получение списка проектов для workspace (без удалённых — исключает корзину)
 */
export async function getProjectsByWorkspace(workspaceId: string): Promise<Project[]> {
  return (
    (await safeFetchOrThrow(
      supabase
        .from('projects')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
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
 * Мягкое удаление проекта — перемещает в корзину.
 * Окончательное удаление — только из раздела «Корзина» в настройках воркспейса.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('projects')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: userRes.user?.id ?? null,
    })
    .eq('id', projectId)
  if (error) throw new ProjectError('Не удалось удалить проект', error)
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
