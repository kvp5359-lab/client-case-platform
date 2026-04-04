/**
 * Сервис для работы с папками документов
 *
 * Сервис НЕ вызывает toast — ошибки выбрасываются для обработки в UI-слое.
 */

import { supabase } from '@/lib/supabase'
import { DocumentError } from '../errors'
import { Folder } from './types'
import { safeFetchOrThrow, safeDeleteOrThrow, safeUpdateOrThrow } from '../supabase/queryHelpers'

export interface CreateFolderParams {
  name: string
  description?: string
  knowledgeArticleId?: string | null
  kitId: string
  workspaceId: string
}

export interface UpdateFolderParams {
  folderId: string
  name?: string
  description?: string
  knowledgeArticleId?: string | null
}

/**
 * Создание папки
 */
export async function createFolder({
  name,
  description = '',
  knowledgeArticleId,
  kitId,
  workspaceId,
}: CreateFolderParams): Promise<Folder> {
  return safeFetchOrThrow(
    supabase
      .from('folders')
      .insert({
        name,
        description,
        knowledge_article_id: knowledgeArticleId ?? null,
        document_kit_id: kitId,
        workspace_id: workspaceId,
      })
      .select()
      .single(),
    'Не удалось создать папку',
    DocumentError,
  )
}

/**
 * Обновление папки
 */
export async function updateFolder({
  folderId,
  name,
  description,
  knowledgeArticleId,
}: UpdateFolderParams): Promise<void> {
  const updates: Partial<Folder> = {}
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description
  if (knowledgeArticleId !== undefined) updates.knowledge_article_id = knowledgeArticleId

  await safeUpdateOrThrow(
    supabase.from('folders').update(updates).eq('id', folderId),
    'Не удалось обновить папку',
    DocumentError,
  )
}

/**
 * Удаление папки
 * При удалении папки все документы из неё перемещаются в нераспределённые (folder_id = null)
 */
export async function deleteFolder(folderId: string): Promise<void> {
  // Перемещаем все документы из папки в нераспределённые (folder_id = null)
  await safeUpdateOrThrow(
    supabase.from('documents').update({ folder_id: null }).eq('folder_id', folderId),
    'Не удалось переместить документы',
    DocumentError,
  )

  // Удаляем папку
  await safeDeleteOrThrow(
    supabase.from('folders').delete().eq('id', folderId),
    'Не удалось удалить папку',
    DocumentError,
  )
}

/**
 * Получение папок по kit_id
 */
export async function getFoldersByKitId(kitId: string): Promise<Folder[]> {
  const data = await safeFetchOrThrow<Folder[] | null>(
    supabase.from('folders').select('*').eq('document_kit_id', kitId).order('name'),
    'Не удалось получить папки',
    DocumentError,
  )
  return data ?? []
}
