"use client"

/**
 * Мутации задач: обновление статуса, срока, имени, настроек.
 * invalidateKeys — список query keys для инвалидации (передаётся потребителем).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logAuditAction } from '@/services/auditService'
import {
  projectThreadKeys,
  accessibleProjectKeys,
  projectKeys,
  inboxKeys,
  messengerKeys,
} from '@/hooks/queryKeys'
import { useAuth } from '@/contexts/AuthContext'
import { markAsRead } from '@/services/api/messenger/messengerReadStatusService'
import { getCurrentProjectParticipant } from '@/services/api/messenger/messengerParticipantService'
import type { InboxThreadEntry } from '@/services/api/inboxService'

export function useUpdateTaskStatus(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ threadId, statusId }: { threadId: string; statusId: string | null }) => {
      // Read old value for audit
      const { data: old } = await supabase
        .from('project_threads')
        .select('status_id, name, project_id, workspace_id')
        .eq('id', threadId)
        .single()

      const { error } = await supabase
        .from('project_threads')
        .update({ status_id: statusId })
        .eq('id', threadId)
      if (error) throw error

      await logAuditAction('change_status', 'task', threadId, {
        name: old?.name,
        old_status: old?.status_id,
        new_status: statusId,
      }, old?.project_id ?? undefined)

      // Перевод в финальный статус = тред «закрыт» → помечаем прочитанным,
      // как при отправке сообщения. Только если есть проект (без проекта нет
      // participant'а) и реальный пользователь.
      if (statusId && old?.project_id && user?.id) {
        const { data: status } = await supabase
          .from('statuses')
          .select('is_final')
          .eq('id', statusId)
          .maybeSingle()
        if (status?.is_final) {
          const participant = await getCurrentProjectParticipant(old.project_id, user.id)
          if (participant) {
            try {
              await markAsRead(participant.participantId, old.project_id, 'client', threadId)
              queryClient.setQueryData(messengerKeys.unreadCountByThreadId(threadId), 0)
              // Точечно гасим бейдж этого треда в кэше inbox v2. Перед патчем
              // отменяем in-flight рефетчи (их триггерит useWorkspaceMessagesRealtime
              // от UPDATE project_threads — они стартуют ДО markAsRead и возвращают
              // ещё не обновлённый unread_count, который иначе перезатрёт наш патч).
              if (old.workspace_id) {
                const inboxKey = inboxKeys.threadsV2(old.workspace_id)
                await queryClient.cancelQueries({ queryKey: inboxKey })
                queryClient.setQueryData<InboxThreadEntry[]>(inboxKey, (prev) => {
                  if (!prev) return prev
                  return prev.map((t) =>
                    t.thread_id === threadId
                      ? {
                          ...t,
                          unread_count: 0,
                          manually_unread: false,
                          has_unread_reaction: false,
                          unread_reaction_count: 0,
                          unread_event_count: 0,
                        }
                      : t,
                  )
                })
              }
            } catch {
              // Не критично — статус уже обновлён
            }
          }
        }
      }
    },
    onSuccess: async (_, { threadId }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.byId(threadId) })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.auditEvents(threadId) })
      // Смена статуса может перевести задачу в/из финального — это меняет
      // has_active_deadline_task у проекта (используется в фильтрах на доске).
      queryClient.invalidateQueries({ queryKey: accessibleProjectKeys.all })
      // Если у шаблона задачи задан on_complete_set_project_status_id и
      // задача ушла в финальный статус — БД-триггер обновит projects.status_id.
      // Подтягиваем свежие данные проекта, чтобы шапка перерисовалась.
      const { data: thread } = await supabase
        .from('project_threads')
        .select('project_id')
        .eq('id', threadId)
        .single()
      if (thread?.project_id) {
        queryClient.invalidateQueries({ queryKey: projectKeys.detail(thread.project_id) })
      }
    },
    onError: () => toast.error('Не удалось обновить статус'),
  })
}

export function useUpdateTaskDeadline(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, deadline }: { threadId: string; deadline: string | null }) => {
      const { data: old } = await supabase
        .from('project_threads')
        .select('deadline, name, project_id')
        .eq('id', threadId)
        .single()

      const { error } = await supabase
        .from('project_threads')
        .update({ deadline })
        .eq('id', threadId)
      if (error) throw error

      await logAuditAction('change_deadline', 'task', threadId, {
        name: old?.name,
        old_deadline: old?.deadline,
        new_deadline: deadline,
      }, old?.project_id ?? undefined)
    },
    onSuccess: (_, { threadId }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.byId(threadId) })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.auditEvents(threadId) })
      // Появление/исчезновение дедлайна меняет has_active_deadline_task у проекта
      // (используется в фильтрах на доске).
      queryClient.invalidateQueries({ queryKey: accessibleProjectKeys.all })
    },
    onError: () => toast.error('Не удалось обновить срок'),
  })
}

export function useRenameTask(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, name }: { threadId: string; name: string }) => {
      const { data: old } = await supabase
        .from('project_threads')
        .select('name, project_id')
        .eq('id', threadId)
        .single()

      const { error } = await supabase.from('project_threads').update({ name }).eq('id', threadId)
      if (error) throw error

      await logAuditAction('rename', 'task', threadId, {
        old_name: old?.name,
        new_name: name,
      }, old?.project_id ?? undefined)
    },
    onSuccess: (_, { threadId }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.byId(threadId) })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.auditEvents(threadId) })
    },
    onError: () => toast.error('Не удалось переименовать'),
  })
}

export function useReorderTasks(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const promises = updates.map(({ id, sort_order }) =>
        supabase.from('project_threads').update({ sort_order }).eq('id', id),
      )
      const results = await Promise.all(promises)
      const error = results.find((r) => r.error)?.error
      if (error) throw error
    },
    onMutate: async (updates) => {
      // Optimistic update: сразу обновляем sort_order в кэше.
      // Используем setQueriesData (по префиксу), потому что фактические ключи
      // в кэше включают userId — например, ['workspace-threads', wsId, userId].
      const orderMap = new Map(updates.map((u) => [u.id, u.sort_order]))

      for (const key of invalidateKeys) {
        await queryClient.cancelQueries({ queryKey: key })
        queryClient.setQueriesData({ queryKey: key }, (old: unknown) => {
          if (!Array.isArray(old)) return old
          return old.map((item: { id: string; sort_order?: number }) =>
            orderMap.has(item.id)
              ? { ...item, sort_order: orderMap.get(item.id) }
              : item,
          )
        })
      }
    },
    onSettled: () => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
    },
    onError: () => {
      toast.error('Не удалось сохранить порядок')
    },
  })
}

export function useUpdateTaskSettings(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      threadId,
      name,
      accent_color,
      icon,
    }: {
      threadId: string
      name: string
      accent_color: string
      icon: string
    }) => {
      const { data: old } = await supabase
        .from('project_threads')
        .select('name, accent_color, icon, project_id')
        .eq('id', threadId)
        .single()

      const { error } = await supabase
        .from('project_threads')
        .update({ name, accent_color, icon })
        .eq('id', threadId)
      if (error) throw error

      await logAuditAction('change_settings', 'task', threadId, {
        old_name: old?.name,
        new_name: name,
        old_accent_color: old?.accent_color,
        new_accent_color: accent_color,
        old_icon: old?.icon,
        new_icon: icon,
      }, old?.project_id ?? undefined)
    },
    onSuccess: (_, { threadId }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.byId(threadId) })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.auditEvents(threadId) })
    },
    onError: () => toast.error('Не удалось сохранить настройки'),
  })
}
