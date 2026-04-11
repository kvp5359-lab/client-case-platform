"use client"

/**
 * Хуки для работы с быстрыми ответами (Quick Replies).
 * Новый формат: группы (quick_reply_groups) вместо папок,
 * доступ через quick_reply_group_templates (на уровне группы).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { quickReplyKeys } from '@/hooks/queryKeys'
import { toast } from 'sonner'
import type { Database } from '@/types/database'

export type QuickReply = Database['public']['Tables']['quick_replies']['Row']
type QuickReplyInsert = Database['public']['Tables']['quick_replies']['Insert']

// ─── Быстрые ответы ──────────────────────────────────

export function useQuickReplies(workspaceId: string | undefined) {
  return useQuery({
    queryKey: quickReplyKeys.list(workspaceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quick_replies')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('order_index')
      if (error) throw error
      return (data || []) as QuickReply[]
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateQuickReply(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      content,
      groupId,
    }: {
      name: string
      content?: string
      groupId?: string
    }) => {
      const payload: QuickReplyInsert = {
        workspace_id: workspaceId!,
        name: name.trim(),
        content: content ?? '',
        group_id: groupId || null,
      }
      const { data, error } = await supabase
        .from('quick_replies')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.list(workspaceId ?? '') })
      toast.success('Шаблон создан')
    },
    onError: () => {
      toast.error('Не удалось создать шаблон')
    },
  })
}

export function useUpdateQuickReply(_workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      name,
      content,
      groupId,
    }: {
      id: string
      name?: string
      content?: string
      groupId?: string | null
    }) => {
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name.trim()
      if (content !== undefined) updates.content = content
      if (groupId !== undefined) updates.group_id = groupId
      const { error } = await supabase.from('quick_replies').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.all })
    },
    onError: () => {
      toast.error('Не удалось обновить шаблон')
    },
  })
}

export function useDeleteQuickReply(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (replyId: string) => {
      const { error } = await supabase.from('quick_replies').delete().eq('id', replyId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Шаблон удалён')
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.list(workspaceId ?? '') })
    },
    onError: () => {
      toast.error('Не удалось удалить шаблон')
    },
  })
}

export function useReorderQuickReplies(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId: _groupId, replyIds }: { groupId: string; replyIds: string[] }) => {
      const updates = replyIds.map((id, index) =>
        supabase.from('quick_replies').update({ order_index: index }).eq('id', id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.list(workspaceId ?? '') })
    },
    onError: () => {
      toast.error('Не удалось сохранить порядок')
    },
  })
}

// ─── Пикер для мессенджера ───────────────────────────

/**
 * Загрузка быстрых ответов, доступных в конкретном проекте.
 *
 * Логика доступа:
 * - Шаблон виден, если у него нет привязок (ни на группе, ни индивидуальных)
 * - ИЛИ его группа привязана к шаблону проекта (quick_reply_group_templates)
 * - ИЛИ он сам привязан к шаблону проекта (quick_reply_templates)
 */
export function useQuickRepliesForPicker(
  workspaceId: string | undefined,
  projectTemplateId: string | null | undefined,
) {
  return useQuery({
    queryKey: quickReplyKeys.forPicker(workspaceId ?? '', projectTemplateId),
    queryFn: async (): Promise<(QuickReply & { group_name?: string })[]> => {
      // Загружаем все ответы workspace
      const { data: replies, error } = await supabase
        .from('quick_replies')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('order_index')

      if (error) throw error
      if (!replies?.length) return []

      // Загружаем группы для отображения
      const { data: groups } = await supabase
        .from('quick_reply_groups')
        .select('id, name')
        .eq('workspace_id', workspaceId!)

      const groupMap = new Map((groups ?? []).map((g) => [g.id, g.name]))

      // Загружаем ВСЕ привязки групп (для определения «есть ли привязка вообще»)
      const groupIds = [...new Set(replies.filter((r) => r.group_id).map((r) => r.group_id!))]
      const { data: allGroupAccess } =
        groupIds.length > 0
          ? await supabase
              .from('quick_reply_group_templates')
              .select('group_id, project_template_id')
              .in('group_id', groupIds)
          : { data: [] as { group_id: string; project_template_id: string }[] }

      // Группы, у которых есть хотя бы одна привязка
      const groupsWithAccess = new Set((allGroupAccess ?? []).map((a) => a.group_id))
      // Группы, привязанные к конкретному шаблону проекта
      const allowedGroupIds = projectTemplateId
        ? new Set(
            (allGroupAccess ?? [])
              .filter((a) => a.project_template_id === projectTemplateId)
              .map((a) => a.group_id),
          )
        : new Set<string>()

      // Загружаем ВСЕ индивидуальные привязки шаблонов
      const replyIds = replies.map((r) => r.id)
      const { data: allReplyAccess } = await supabase
        .from('quick_reply_templates')
        .select('reply_id, project_template_id')
        .in('reply_id', replyIds)

      // Шаблоны, у которых есть индивидуальная привязка
      const repliesWithAccess = new Set((allReplyAccess ?? []).map((a) => a.reply_id))
      // Шаблоны, привязанные к конкретному шаблону проекта
      const allowedReplyIds = projectTemplateId
        ? new Set(
            (allReplyAccess ?? [])
              .filter((a) => a.project_template_id === projectTemplateId)
              .map((a) => a.reply_id),
          )
        : new Set<string>()

      const filtered = replies.filter((r) => {
        const hasGroupAccess = r.group_id ? groupsWithAccess.has(r.group_id) : false
        const hasReplyAccess = repliesWithAccess.has(r.id)

        // Нет привязок вообще (ни на группе, ни индивидуально) → виден везде
        if (!hasGroupAccess && !hasReplyAccess) return true

        // Есть привязки — проверяем конкретный шаблон проекта
        if (!projectTemplateId) return false

        if (r.group_id && allowedGroupIds.has(r.group_id)) return true
        if (allowedReplyIds.has(r.id)) return true

        return false
      })

      return filtered.map((r) => ({
        ...r,
        group_name: r.group_id ? groupMap.get(r.group_id) : undefined,
      }))
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  })
}
