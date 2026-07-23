/**
 * Поиск по сообщениям внутри треда с фильтрами (файлы/картинки/ссылки).
 *
 * Двухшаговый: RPC `search_thread_messages` возвращает id подходящих сообщений
 * (под RLS вызывающего), затем гидрируем их полным MESSAGE_SELECT — вложения,
 * реакции, reply — тем же путём, что обычная лента. Чистое чтение, канальной
 * логики отправки не касается.
 */

import { supabase } from '@/lib/supabase'
import type { ProjectMessage } from './messengerService.types'
import {
  MESSAGE_SELECT,
  castToProjectMessages,
} from './messengerService.helpers'

export type ThreadSearchFilters = {
  wantFiles: boolean
  wantImages: boolean
  wantLinks: boolean
  wantAudio: boolean
  /** null = все отправители; иначе фильтр по конкретному participant_id. */
  senderParticipantId: string | null
}

export type ThreadSender = {
  participant_id: string
  name: string
  avatar_url: string | null
}

/** Список отправителей треда для селектора фильтра. */
export async function getThreadSenders(threadId: string): Promise<ThreadSender[]> {
  const { data, error } = await supabase.rpc('get_thread_senders', { p_thread_id: threadId })
  if (error) throw error
  return (data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function searchThreadMessages(
  threadId: string,
  query: string,
  filters: ThreadSearchFilters,
): Promise<ProjectMessage[]> {
  const { data: idRows, error: rpcError } = await supabase.rpc('search_thread_messages', {
    p_thread_id: threadId,
    p_query: query,
    p_want_files: filters.wantFiles,
    p_want_images: filters.wantImages,
    p_want_links: filters.wantLinks,
    p_want_audio: filters.wantAudio,
    p_sender_participant_id: filters.senderParticipantId ?? undefined,
    p_limit: 200,
  })
  if (rpcError) throw rpcError

  const ids = (idRows ?? []).map((r) => r.id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .in('id', ids)
  if (error) throw error

  const messages = castToProjectMessages((data ?? []) as unknown as Record<string, unknown>[])

  // RPC уже отсортировала (created_at desc); восстанавливаем этот порядок после
  // `.in()` (он не гарантирует порядок аргументов).
  const order = new Map(ids.map((id, i) => [id, i]))
  messages.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  return messages
}
