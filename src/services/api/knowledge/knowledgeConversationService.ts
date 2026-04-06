/**
 * Сервис диалогов и сообщений базы знаний
 */

import { supabase } from '@/lib/supabase'
import { KnowledgeBaseError } from '../../errors'
import { safeFetchOrThrow, safeDeleteOrThrow } from '../../supabase/queryHelpers'
import type {
  ConversationType,
  KnowledgeConversation,
  KnowledgeMessage,
  SearchSource,
  ConversationSources,
} from './knowledgeSearchService.types'

// =====================================================
// Диалоги
// =====================================================

export async function getConversations(
  workspaceId: string,
  projectId?: string,
  type: ConversationType = 'knowledge',
): Promise<KnowledgeConversation[]> {
  let query = supabase
    .from('knowledge_conversations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('type', type)
    .order('updated_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  } else {
    query = query.is('project_id', null)
  }

  const rows = await safeFetchOrThrow(query, 'Не удалось загрузить диалоги', KnowledgeBaseError)
  return (rows ?? []) as unknown as KnowledgeConversation[]
}

export async function createConversation(params: {
  workspace_id: string
  project_id?: string
  user_id: string
  title?: string
  type?: ConversationType
  sources?: ConversationSources
}): Promise<KnowledgeConversation> {
  const row = await safeFetchOrThrow(
    supabase.from('knowledge_conversations').insert(params as never).select().single(),
    'Не удалось создать диалог',
    KnowledgeBaseError,
  )
  return row as unknown as KnowledgeConversation
}

export async function updateConversation(
  conversationId: string,
  updates: Partial<Pick<KnowledgeConversation, 'title' | 'sources'>>,
): Promise<KnowledgeConversation> {
  const row = await safeFetchOrThrow(
    supabase
      .from('knowledge_conversations')
      .update(updates as never)
      .eq('id', conversationId)
      .select()
      .single(),
    'Не удалось обновить диалог',
    KnowledgeBaseError,
  )
  return row as unknown as KnowledgeConversation
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await safeDeleteOrThrow(
    supabase.from('knowledge_conversations').delete().eq('id', conversationId),
    'Не удалось удалить диалог',
    KnowledgeBaseError,
  )
}

// =====================================================
// Сообщения
// =====================================================

export async function getMessages(conversationId: string): Promise<KnowledgeMessage[]> {
  const rows = await safeFetchOrThrow(
    supabase
      .from('knowledge_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
    'Не удалось загрузить сообщения',
    KnowledgeBaseError,
  )
  return (rows ?? []) as unknown as KnowledgeMessage[]
}

export async function addMessage(params: {
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SearchSource[]
}): Promise<KnowledgeMessage> {
  const row = await safeFetchOrThrow(
    supabase
      .from('knowledge_messages')
      .insert({ ...params, sources: params.sources ?? null } as never)
      .select()
      .single(),
    'Не удалось сохранить сообщение',
    KnowledgeBaseError,
  )
  return row as unknown as KnowledgeMessage
}
