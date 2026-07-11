/**
 * Общие helpers для TemplateAccess* компонентов.
 * Маппинг entityType → table/fkColumn/queryKeys + загрузка qr-флагов.
 */

import { supabase } from '@/lib/supabase'
import { knowledgeBaseKeys, quickReplyKeys } from '@/hooks/queryKeys'
import { Globe, CornerDownRight, ListChecks, EyeOff, type LucideIcon } from 'lucide-react'

export type TemplateAccessEntityType = 'group' | 'article' | 'qa' | 'qr-group' | 'qr-reply'

// Режимы доступа сущностей базы знаний (хранятся колонкой template_access_mode).
export type KbAccessMode = 'inherit' | 'everywhere' | 'selected' | 'nowhere'

// Визуальное представление режима для строки дерева и радиокнопок попапа.
export const KB_MODE_META: Record<
  KbAccessMode,
  { Icon: LucideIcon; color: string; label: string }
> = {
  everywhere: { Icon: Globe, color: 'text-emerald-600', label: 'Везде' },
  inherit: { Icon: CornerDownRight, color: 'text-muted-foreground/50', label: 'Наследует' },
  selected: { Icon: ListChecks, color: 'text-primary', label: 'Только в выбранных' },
  nowhere: { Icon: EyeOff, color: 'text-red-500/70', label: 'Нигде' },
}

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
    case 'qa':
      return {
        table: 'knowledge_qa_templates' as const,
        fkColumn: 'qa_id',
        queryKey: [...knowledgeBaseKeys.qaAccess(entityId), 'ids'],
        badgeQueryKey: knowledgeBaseKeys.qaAccess(entityId),
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

// Сущности базы знаний с колонкой template_access_mode (единая модель прав).
export type KbEntityType = 'group' | 'article' | 'qa'

export function isKnowledgeBase(t: TemplateAccessEntityType): t is KbEntityType {
  return t === 'group' || t === 'article' || t === 'qa'
}

const KB_ENTITY_TABLE: Record<KbEntityType, 'knowledge_groups' | 'knowledge_articles' | 'knowledge_qa'> =
  {
    group: 'knowledge_groups',
    article: 'knowledge_articles',
    qa: 'knowledge_qa',
  }

/** Конфиг базы знаний с определёнными полями режима (для попапа/иконки). */
export function getKbAccessConfig(entityType: KbEntityType, entityId: string) {
  return {
    entityTable: KB_ENTITY_TABLE[entityType],
    modeQueryKey: ['template-access-mode', entityType, entityId] as const,
    listInvalidateKey: (workspaceId: string) =>
      entityType === 'group'
        ? // Группа может быть статейной ИЛИ Q&A (одна таблица, разный kind) —
          // инвалидируем оба списка групп широким префиксом.
          knowledgeBaseKeys.all
        : entityType === 'qa'
          ? knowledgeBaseKeys.qa(workspaceId)
          : knowledgeBaseKeys.articles(workspaceId),
    inheritLabel:
      entityType === 'group' ? 'Наследовать от родителя' : 'Наследовать от групп',
    inheritHint:
      entityType === 'group'
        ? 'Как у родительской группы (корневая без родителя — нигде).'
        : entityType === 'qa'
          ? 'Виден там, где видны его группы.'
          : 'Видна там, где видны её группы.',
  }
}

/** Текущий режим доступа сущности базы знаний (колонка template_access_mode). */
export async function fetchKbMode(
  entityType: KbEntityType,
  entityId: string,
): Promise<KbAccessMode> {
  const { data, error } = await supabase
    .from(KB_ENTITY_TABLE[entityType])
    .select('template_access_mode')
    .eq('id', entityId)
    .single()
  if (error) throw error
  return (data.template_access_mode as KbAccessMode) ?? 'inherit'
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
