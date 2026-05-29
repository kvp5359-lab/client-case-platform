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
  calendarKeys,
  invalidateMessengerCaches,
} from '@/hooks/queryKeys'
import { useMarkThreadReadIfFinal } from '@/hooks/messenger/useMarkThreadReadIfFinal'

export function useUpdateTaskStatus(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  const markReadIfFinal = useMarkThreadReadIfFinal()
  return useMutation({
    mutationFn: async ({ threadId, statusId }: { threadId: string; statusId: string | null }) => {
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

      await markReadIfFinal({
        threadId,
        statusId,
        projectId: old?.project_id ?? null,
        workspaceId: old?.workspace_id ?? null,
      })
      return { workspaceId: old?.workspace_id ?? null }
    },
    onSuccess: async (result, { threadId }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.byId(threadId) })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.auditEvents(threadId) })
      // Смена статуса может перевести задачу в/из финального — это меняет
      // has_active_deadline_task у проекта (используется в фильтрах на доске).
      queryClient.invalidateQueries({ queryKey: accessibleProjectKeys.all })
      // Список «Входящие» (RPC get_inbox_threads_v2) живёт на отдельном
      // ключе inboxKeys.threads — без этой инвалидации завершённая задача
      // не пропадает из инбокса и держит старый статус до ручного refetch.
      if (result?.workspaceId) invalidateMessengerCaches(queryClient, result.workspaceId)
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
    mutationFn: async ({
      threadId,
      deadline,
      start_at,
      end_at,
    }: {
      threadId: string
      deadline: string | null
      /** Запланированное начало (для слота в календаре). */
      start_at?: string | null
      /** Запланированный конец. Триггер БД синхронизирует с deadline. */
      end_at?: string | null
    }) => {
      const { data: old } = await supabase
        .from('project_threads')
        .select('deadline, name, project_id, workspace_id')
        .eq('id', threadId)
        .single()

      const update: Record<string, unknown> = { deadline }
      if (start_at !== undefined) update.start_at = start_at
      if (end_at !== undefined) update.end_at = end_at

      const { error } = await supabase
        .from('project_threads')
        .update(update)
        .eq('id', threadId)
      if (error) throw error

      await logAuditAction('change_deadline', 'task', threadId, {
        name: old?.name,
        old_deadline: old?.deadline,
        new_deadline: deadline,
      }, old?.project_id ?? undefined)

      return { workspaceId: old?.workspace_id ?? null }
    },
    onMutate: async ({ threadId, start_at, end_at }) => {
      // Optimistic update для board-list-times — чтобы блок в календаре
      // менялся синхронно с дедлайн-чипом (без ожидания network round-trip).
      // start_at/end_at могут быть undefined (мутация только меняет deadline)
      // — в этом случае ничего не оптимистируем.
      if (start_at === undefined && end_at === undefined) return
      await queryClient.cancelQueries({ queryKey: calendarKeys.all })
      queryClient.setQueriesData(
        { queryKey: calendarKeys.all },
        (old: unknown) => {
          if (!old || Array.isArray(old) || typeof old !== 'object') return old
          // start/end null → удаляем entry; иначе апсёртим.
          const next = { ...(old as Record<string, unknown>) }
          if (start_at === null && end_at === null) {
            delete next[threadId]
          } else {
            next[threadId] = { start_at, end_at }
          }
          return next
        },
      )
    },
    onSuccess: (result, { threadId }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.byId(threadId) })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.auditEvents(threadId) })
      // Появление/исчезновение дедлайна меняет has_active_deadline_task у проекта
      // (используется в фильтрах на доске).
      queryClient.invalidateQueries({ queryKey: accessibleProjectKeys.all })
      // Календарные виды читают start_at/end_at отдельным запросом
      // (useCalendarThreads + board-list-times внутри BoardListCalendarView).
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      // Инбокс группирует задачи по сроку (Сегодня/Завтра) и фильтрует —
      // смена дедлайна должна перестроить список «Входящие».
      if (result?.workspaceId) invalidateMessengerCaches(queryClient, result.workspaceId)
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
      deadline,
      start_at,
      end_at,
    }: {
      threadId: string
      name: string
      accent_color: string
      icon: string
      /** Срок задачи. Триггер БД синхронизирует с end_at. */
      deadline?: string | null
      /** Запланированное начало (для календаря). */
      start_at?: string | null
      /** Запланированный конец. */
      end_at?: string | null
    }) => {
      const { data: old } = await supabase
        .from('project_threads')
        .select('name, accent_color, icon, project_id')
        .eq('id', threadId)
        .single()

      const update: Record<string, unknown> = { name, accent_color, icon }
      if (deadline !== undefined) update.deadline = deadline
      if (start_at !== undefined) update.start_at = start_at
      if (end_at !== undefined) update.end_at = end_at

      const { error } = await supabase
        .from('project_threads')
        .update(update)
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
