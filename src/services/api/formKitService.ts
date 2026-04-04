/**
 * Сервис для работы с наборами форм (Form Kits)
 * Инкапсулирует всю логику взаимодействия с Supabase для form kits
 */

import { supabase } from '@/lib/supabase'
import { Tables } from '@/types/database'
import { FormKitError, createServiceErrorHandler } from '../errors'
import { safeFetchOrThrow, safeDeleteOrThrow } from '../supabase/queryHelpers'

export type FormKit = Tables<'form_kits'>
export type FormKitInsert = Omit<FormKit, 'id' | 'created_at' | 'updated_at'>
export type FormKitUpdate = Partial<FormKitInsert>

const handleServiceError = createServiceErrorHandler(FormKitError)

/**
 * Получение списка наборов форм для проекта
 */
export async function getFormKitsByProject(projectId: string): Promise<FormKit[]> {
  const data = await safeFetchOrThrow<FormKit[] | null>(
    supabase
      .from('form_kits')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    'Не удалось загрузить наборы форм',
    FormKitError,
  )
  return data ?? []
}

/**
 * Создание нового набора форм
 */
export async function createFormKit(formKit: FormKitInsert): Promise<FormKit> {
  return safeFetchOrThrow(
    supabase.from('form_kits').insert(formKit).select().single(),
    'Не удалось создать набор форм',
    FormKitError,
  )
}

/**
 * Обновление набора форм
 */
export async function updateFormKit(formKitId: string, updates: FormKitUpdate): Promise<FormKit> {
  return safeFetchOrThrow(
    supabase.from('form_kits').update(updates).eq('id', formKitId).select().single(),
    'Не удалось обновить набор форм',
    FormKitError,
  )
}

/**
 * Удаление набора форм
 */
export async function deleteFormKit(formKitId: string): Promise<void> {
  return safeDeleteOrThrow(
    supabase.from('form_kits').delete().eq('id', formKitId),
    'Не удалось удалить набор форм',
    FormKitError,
  )
}

/**
 * Создание анкеты из шаблона (атомарная серверная RPC-транзакция).
 * Все операции (insert kit, sections, fields, initial values) в одной транзакции.
 * Возвращает ID созданной анкеты.
 */
export async function createFormKitFromTemplate(
  templateId: string,
  projectId: string,
  workspaceId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('create_form_kit_from_template', {
      p_template_id: templateId,
      p_project_id: projectId,
      p_workspace_id: workspaceId,
    })

    if (error) {
      throw new FormKitError(error.message || 'Не удалось создать анкету из шаблона')
    }

    if (!data) {
      throw new FormKitError('RPC не вернул ID анкеты')
    }

    return data as string
  } catch (error) {
    handleServiceError('Не удалось создать анкету из шаблона', error)
  }
}

/**
 * Синхронизация анкеты с шаблоном (пересоздание структуры, сохранение значений).
 * Атомарная серверная RPC-транзакция: delete + insert в одной транзакции.
 * Значения привязаны к field_definition_id и автоматически подхватываются.
 */
export async function syncFormKitStructure(kitId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('sync_form_kit_structure', {
      p_kit_id: kitId,
    })

    if (error) {
      throw new FormKitError(error.message || 'Не удалось синхронизировать структуру анкеты')
    }
  } catch (error) {
    handleServiceError('Не удалось синхронизировать структуру анкеты', error)
  }
}
