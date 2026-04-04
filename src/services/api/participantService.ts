/**
 * Сервис для работы с участниками
 * Инкапсулирует всю логику взаимодействия с Supabase для участников
 */

import { supabase } from '@/lib/supabase'
import { Tables } from '@/types/database'
import { ParticipantError } from '../errors'
import { safeFetchOrThrow } from '../supabase/queryHelpers'

export type Participant = Tables<'participants'>

/**
 * Получение списка участников для workspace
 */
export async function getParticipantsByWorkspace(
  workspaceId: string,
): Promise<Pick<Participant, 'id' | 'name' | 'email'>[]> {
  const data = await safeFetchOrThrow(
    supabase
      .from('participants')
      .select('id, name, email')
      .eq('workspace_id', workspaceId)
      .eq('is_deleted', false)
      .order('name', { ascending: true }),
    'Не удалось загрузить участников',
    ParticipantError,
  )
  return data || []
}

/**
 * Получение имени участника по user_id
 */
export async function getParticipantName(userId: string): Promise<string | null> {
  const data = await safeFetchOrThrow(
    supabase.from('participants').select('name').eq('user_id', userId).maybeSingle(),
    'Не удалось получить имя участника',
    ParticipantError,
  )
  return data?.name ?? null
}
