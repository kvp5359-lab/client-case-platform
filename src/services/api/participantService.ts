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
  // Один user_id может иметь несколько записей participants (юзер в нескольких
  // воркспейсах) — берём первую живую, иначе .maybeSingle() падает на 2+ строках.
  const data = await safeFetchOrThrow(
    supabase
      .from('participants')
      .select('name')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle(),
    'Не удалось получить имя участника',
    ParticipantError,
  )
  return (data as { name: string } | null)?.name ?? null
}

/** Участник проекта с заполненным email (для выдачи доступа к папке Drive). */
export type ProjectEmailParticipant = {
  id: string
  name: string
  email: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Участники проекта, у которых в карточке заполнен корректный email.
 * Дубли по адресу (без учёта регистра) схлопываются.
 */
export async function getProjectParticipantsWithEmail(
  projectId: string,
): Promise<ProjectEmailParticipant[]> {
  const data = await safeFetchOrThrow(
    supabase
      .from('project_participants')
      .select('participants!inner(id, name, last_name, email, is_deleted)')
      .eq('project_id', projectId),
    'Не удалось загрузить участников проекта',
    ParticipantError,
  )
  const seen = new Set<string>()
  const result: ProjectEmailParticipant[] = []
  for (const row of data ?? []) {
    // PostgREST отдаёт many-to-one embed объектом (типы иногда врут массивом).
    const p = row.participants as unknown as {
      id: string
      name: string | null
      last_name: string | null
      email: string | null
      is_deleted: boolean | null
    }
    const email = (p.email ?? '').trim()
    if (p.is_deleted || !EMAIL_RE.test(email)) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      id: p.id,
      name: [p.name, p.last_name].filter(Boolean).join(' ').trim() || email,
      email,
    })
  }
  return result
}
