"use client"

/**
 * Хуки для работы с быстрыми ответами (Quick Replies).
 * Новый формат: группы (quick_reply_groups) вместо папок,
 * доступ через quick_reply_group_templates (на уровне группы).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { quickReplyKeys, STALE_TIME } from '@/hooks/queryKeys'
import { toast } from 'sonner'
import { safeFetchOrThrow, safeInsertOrThrow, safeDeleteOrThrow, safeUpdateVoidOrThrow } from '@/services/supabase/queryHelpers'
import type { Database } from '@/types/database'

export type QuickReply = Database['public']['Tables']['quick_replies']['Row']
type QuickReplyInsert = Database['public']['Tables']['quick_replies']['Insert']

// ─── Быстрые ответы ──────────────────────────────────

export function useQuickReplies(workspaceId: string | undefined) {
  return useQuery({
    queryKey: quickReplyKeys.list(workspaceId ?? ''),
    queryFn: () =>
      safeFetchOrThrow<QuickReply[]>(
        supabase.from('quick_replies').select('*').eq('workspace_id', workspaceId!).order('order_index'),
        'Не удалось загрузить быстрые ответы',
      ),
    enabled: !!workspaceId,
    staleTime: STALE_TIME.LONG,
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
      return safeInsertOrThrow<{ id: string }>(
        supabase.from('quick_replies').insert(payload).select('id').single(),
        'Не удалось создать шаблон',
      )
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
      await safeUpdateVoidOrThrow(
        supabase.from('quick_replies').update(updates).eq('id', id),
        'Не удалось обновить шаблон',
      )
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

  // Optimistic: удаляемый шаблон исчезает из списка сразу. При ошибке — откат.
  return useMutation({
    mutationFn: async (replyId: string) => {
      await safeDeleteOrThrow(
        supabase.from('quick_replies').delete().eq('id', replyId),
        'Не удалось удалить шаблон',
      )
    },
    onMutate: async (replyId) => {
      const key = quickReplyKeys.list(workspaceId ?? '')
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<QuickReply[]>(key)
      queryClient.setQueryData<QuickReply[]>(key, (old) => old?.filter((r) => r.id !== replyId))
      return { previous }
    },
    onSuccess: () => {
      toast.success('Шаблон удалён')
    },
    onError: (_err, _replyId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(quickReplyKeys.list(workspaceId ?? ''), context.previous)
      }
      toast.error('Не удалось удалить шаблон')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.list(workspaceId ?? '') })
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

/**
 * Перемещение шаблона между группами с пересчётом порядка.
 * Меняет group_id перемещаемого шаблона, обновляет order_index
 * во всех затронутых группах (источник и цель).
 */
export function useMoveQuickReply(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      replyId,
      newGroupId,
      sourceOrderedIds,
      targetOrderedIds,
    }: {
      replyId: string
      newGroupId: string | null
      // Финальный порядок ID в исходной группе (без перемещаемого)
      sourceOrderedIds: string[]
      // Финальный порядок ID в целевой группе (вместе с перемещаемым)
      targetOrderedIds: string[]
    }) => {
      // 1) Перевесить group_id у перемещаемого
      const moveRes = await supabase
        .from('quick_replies')
        .update({ group_id: newGroupId })
        .eq('id', replyId)
      if (moveRes.error) throw moveRes.error

      // 2) Пересчитать order_index в источнике и цели
      const updates = [
        ...sourceOrderedIds.map((id, idx) =>
          supabase.from('quick_replies').update({ order_index: idx }).eq('id', id),
        ),
        ...targetOrderedIds.map((id, idx) =>
          supabase.from('quick_replies').update({ order_index: idx }).eq('id', id),
        ),
      ]
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.list(workspaceId ?? '') })
    },
    onError: () => {
      toast.error('Не удалось переместить шаблон')
    },
  })
}

// ─── Пикер для мессенджера ───────────────────────────

/**
 * Загрузка быстрых ответов, доступных в конкретном чате.
 *
 * Модель доступа:
 * - Шаблон: режим `inherit` (берёт у группы) / `everywhere` / `selected` / `personal_only`
 * - Группа: режимы `everywhere` / `selected` / `personal_only`
 *
 * Резолв шаблона:
 *   - `access_inherits = true` И есть group_id → effective = настройки группы
 *   - иначе → собственные настройки шаблона
 *
 * Effective режим:
 *   - personal_only=true → виден ТОЛЬКО когда у треда нет проекта (projectTemplateId == null)
 *   - selected (junction непустой) → виден если projectTemplateId в junction
 *   - everywhere (junction пустой) → виден всегда (и в проекте, и без)
 *
 * @param projectTemplateId — id шаблона проекта текущего треда (null/undefined если неизвестен)
 * @param isPersonalThread — true если тред не привязан к проекту (личный диалог)
 */
export function useQuickRepliesForPicker(
  workspaceId: string | undefined,
  projectTemplateId: string | null | undefined,
  isPersonalThread = false,
) {
  return useQuery({
    queryKey: [
      ...quickReplyKeys.forPicker(workspaceId ?? '', projectTemplateId),
      isPersonalThread ? 'personal' : 'project',
    ],
    queryFn: async (): Promise<(QuickReply & { group_name?: string })[]> => {

      // Все ответы workspace
      const { data: replies, error } = await supabase
        .from('quick_replies')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('order_index')

      if (error) throw error
      if (!replies?.length) return []

      // Группы (для имени + personal_only)
      const { data: groups } = await supabase
        .from('quick_reply_groups')
        .select('id, name, personal_only')
        .eq('workspace_id', workspaceId!)

      const groupMap = new Map(
        (groups ?? []).map((g) => [g.id, { name: g.name, personal_only: g.personal_only }]),
      )

      // Привязки групп
      const groupIds = [...new Set(replies.filter((r) => r.group_id).map((r) => r.group_id!))]
      const { data: allGroupAccess } =
        groupIds.length > 0
          ? await supabase
              .from('quick_reply_group_templates')
              .select('group_id, project_template_id')
              .in('group_id', groupIds)
          : { data: [] as { group_id: string; project_template_id: string }[] }

      const groupHasAccess = new Set((allGroupAccess ?? []).map((a) => a.group_id))
      const allowedGroupForTemplate = projectTemplateId
        ? new Set(
            (allGroupAccess ?? [])
              .filter((a) => a.project_template_id === projectTemplateId)
              .map((a) => a.group_id),
          )
        : new Set<string>()

      // Индивидуальные привязки шаблонов
      const replyIds = replies.map((r) => r.id)
      const { data: allReplyAccess } = await supabase
        .from('quick_reply_templates')
        .select('reply_id, project_template_id')
        .in('reply_id', replyIds)

      const replyHasAccess = new Set((allReplyAccess ?? []).map((a) => a.reply_id))
      const allowedReplyForTemplate = projectTemplateId
        ? new Set(
            (allReplyAccess ?? [])
              .filter((a) => a.project_template_id === projectTemplateId)
              .map((a) => a.reply_id),
          )
        : new Set<string>()

      /** Решает, виден ли шаблон/группа с такими настройками */
      function isVisible(opts: {
        personalOnly: boolean
        hasJunction: boolean
        allowedForCurrentTemplate: boolean
      }): boolean {
        // personal_only → только когда тред без проекта
        if (opts.personalOnly) return isPersonalThread
        // selected → пускаем только если есть привязка к текущему шаблону проекта
        if (opts.hasJunction) {
          if (!projectTemplateId) return false
          return opts.allowedForCurrentTemplate
        }
        // everywhere
        return true
      }

      const filtered = replies.filter((r) => {
        const groupInfo = r.group_id ? groupMap.get(r.group_id) : null

        // Шаблон наследует от группы
        if (r.access_inherits && groupInfo) {
          return isVisible({
            personalOnly: groupInfo.personal_only,
            hasJunction: groupHasAccess.has(r.group_id!),
            allowedForCurrentTemplate: allowedGroupForTemplate.has(r.group_id!),
          })
        }

        // Собственные настройки шаблона
        return isVisible({
          personalOnly: r.personal_only,
          hasJunction: replyHasAccess.has(r.id),
          allowedForCurrentTemplate: allowedReplyForTemplate.has(r.id),
        })
      })

      return filtered.map((r) => ({
        ...r,
        group_name: r.group_id ? groupMap.get(r.group_id)?.name : undefined,
      }))
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.LONG,
  })
}
