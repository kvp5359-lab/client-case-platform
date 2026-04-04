/**
 * Сервис Q&A (Вопросы-Ответы) базы знаний
 */

import { supabase } from '@/lib/supabase'
import { KnowledgeBaseError } from '../errors'
import { safeFetchOrThrow, safeDeleteOrThrow } from '../supabase/queryHelpers'

export interface KnowledgeQA {
  id: string
  workspace_id: string
  question: string
  answer: string
  source: string | null
  qa_date: string | null
  original_question: string | null
  original_answers: string | null
  is_published: boolean
  indexing_status: string
  indexed_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  // Joined relations
  knowledge_qa_tags?: Array<{
    tag_id: string
    knowledge_tags: { id: string; name: string; color: string }
  }>
  knowledge_qa_groups?: Array<{
    group_id: string
    knowledge_groups: { id: string; name: string; color: string | null }
  }>
}

const QA_SELECT =
  '*, knowledge_qa_tags(tag_id, knowledge_tags(*)), knowledge_qa_groups(group_id, knowledge_groups(*))'

export async function getQAItems(workspaceId: string): Promise<KnowledgeQA[]> {
  return (
    (await safeFetchOrThrow(
      supabase
        .from('knowledge_qa')
        .select(QA_SELECT)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
      'Не удалось загрузить Q&A',
      KnowledgeBaseError,
    )) ?? []
  )
}

export async function createQA(
  params: Pick<KnowledgeQA, 'workspace_id' | 'question' | 'answer'> &
    Partial<
      Pick<
        KnowledgeQA,
        | 'source'
        | 'qa_date'
        | 'is_published'
        | 'created_by'
        | 'original_question'
        | 'original_answers'
      >
    >,
): Promise<KnowledgeQA> {
  return safeFetchOrThrow(
    supabase.from('knowledge_qa').insert(params).select(QA_SELECT).single(),
    'Не удалось создать Q&A',
    KnowledgeBaseError,
  )
}

export async function updateQA(
  id: string,
  params: Partial<
    Pick<
      KnowledgeQA,
      | 'question'
      | 'answer'
      | 'source'
      | 'qa_date'
      | 'is_published'
      | 'original_question'
      | 'original_answers'
    >
  >,
): Promise<KnowledgeQA> {
  return safeFetchOrThrow(
    supabase
      .from('knowledge_qa')
      .update({ ...params, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(QA_SELECT)
      .single(),
    'Не удалось обновить Q&A',
    KnowledgeBaseError,
  )
}

export async function deleteQA(id: string): Promise<void> {
  await safeDeleteOrThrow(
    supabase.from('knowledge_qa').delete().eq('id', id),
    'Не удалось удалить Q&A',
  )
}

export async function indexQA(qaId: string, workspaceId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('knowledge-index', {
    body: { qa_id: qaId, workspace_id: workspaceId },
  })
  if (error) throw new KnowledgeBaseError('Не удалось запустить индексацию Q&A', error)
}

export async function bulkCreateQA(
  items: Array<
    Pick<KnowledgeQA, 'question' | 'answer'> &
      Partial<Pick<KnowledgeQA, 'original_question' | 'original_answers' | 'source' | 'qa_date'>>
  >,
  workspaceId: string,
  userId: string,
): Promise<{ created: number }> {
  const rows = items.map((item) => ({
    ...item,
    workspace_id: workspaceId,
    created_by: userId,
  }))
  const { data, error } = await supabase.from('knowledge_qa').insert(rows).select('id')
  if (error) throw new KnowledgeBaseError('Не удалось импортировать Q&A', error)
  return { created: data?.length ?? 0 }
}

export async function setQATags(qaId: string, tagIds: string[]): Promise<void> {
  // Z6-01: атомарное обновление через RPC
  const { error } = await supabase.rpc('update_qa_tags', {
    p_qa_id: qaId,
    p_tag_ids: tagIds,
  })
  if (error) throw new KnowledgeBaseError('Не удалось обновить теги Q&A', error)
}

export async function setQAGroups(qaId: string, groupIds: string[]): Promise<void> {
  // Z6-01: атомарное обновление через RPC
  const { error } = await supabase.rpc('update_qa_groups', {
    p_qa_id: qaId,
    p_group_ids: groupIds,
  })
  if (error) throw new KnowledgeBaseError('Не удалось обновить группы Q&A', error)
}
