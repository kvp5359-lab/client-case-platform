/**
 * Общие helpers для TemplateAccess* компонентов.
 * Маппинг entityType → table/fkColumn/queryKeys + загрузка qr-флагов.
 */

import { supabase } from '@/lib/supabase'
import { knowledgeBaseKeys, quickReplyKeys } from '@/hooks/queryKeys'

export type TemplateAccessEntityType = 'group' | 'article' | 'qr-group' | 'qr-reply'

export function getAccessConfig(entityType: TemplateAccessEntityType, entityId: string) {
  switch (entityType) {
    case 'group':
      return {
        table: 'knowledge_group_templates' as const,
        fkColumn: 'group_id',
        queryKey: [...knowledgeBaseKeys.groupAccess(entityId), 'ids'],
        badgeQueryKey: knowledgeBaseKeys.groupAccess(entityId),
      }
    case 'article':
      return {
        table: 'knowledge_article_templates' as const,
        fkColumn: 'article_id',
        queryKey: [...knowledgeBaseKeys.articleAccess(entityId), 'ids'],
        badgeQueryKey: knowledgeBaseKeys.articleAccess(entityId),
      }
    case 'qr-group':
      return {
        table: 'quick_reply_group_templates' as const,
        fkColumn: 'group_id',
        queryKey: [...quickReplyKeys.groupAccess(entityId), 'ids'],
        badgeQueryKey: quickReplyKeys.groupAccess(entityId),
      }
    case 'qr-reply':
      return {
        table: 'quick_reply_templates' as const,
        fkColumn: 'reply_id',
        queryKey: [...quickReplyKeys.replyAccess(entityId), 'ids'],
        badgeQueryKey: quickReplyKeys.replyAccess(entityId),
      }
  }
}

export function isQuickReply(t: TemplateAccessEntityType) {
  return t === 'qr-group' || t === 'qr-reply'
}

export type QrFlags = {
  personal_only: boolean
  access_inherits: boolean
  group_id: string | null
}

/** Единая загрузка флагов qr-* — общий queryKey + shape для Popover и Badge */
export async function fetchQrFlags(
  entityType: TemplateAccessEntityType,
  entityId: string,
): Promise<QrFlags | null> {
  if (entityType === 'qr-group') {
    const { data, error } = await supabase
      .from('quick_reply_groups')
      .select('personal_only')
      .eq('id', entityId)
      .single()
    if (error) throw error
    return { personal_only: data.personal_only, access_inherits: false, group_id: null }
  }
  if (entityType === 'qr-reply') {
    const { data, error } = await supabase
      .from('quick_replies')
      .select('personal_only, access_inherits, group_id')
      .eq('id', entityId)
      .single()
    if (error) throw error
    return data as QrFlags
  }
  return null
}
