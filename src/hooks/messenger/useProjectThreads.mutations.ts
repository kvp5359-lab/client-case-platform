"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  accessibleProjectKeys,
  messengerKeys,
  myTaskCountsKeys,
  taskKeys,
  trashKeys,
  workspaceTaskKeys,
  workspaceThreadKeys,
} from '@/hooks/queryKeys'
import { logAuditAction } from '@/services/auditService'
import type { ProjectThread, ThreadAccentColor } from './useProjectThreads.types'

/**
 * Создать новый тред в проекте
 */
export function useCreateThread(projectId: string | null, workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      name: string
      accessType: 'all' | 'roles' | 'custom'
      accentColor?: ThreadAccentColor
      icon?: string
      type?: 'chat' | 'task' | 'email'
      emailData?: { contactEmails: string[]; subject?: string }
      memberIds?: string[]
      accessRoles?: string[]
      // Task-specific
      deadline?: string | null
      statusId?: string | null
      assigneeIds?: string[]
      // Project override (если пользователь сменил проект в диалоге)
      projectIdOverride?: string | null
      /** ID шаблона, из которого создаётся тред (если из шаблона). */
      sourceTemplateId?: string | null
    }) => {
      const effectiveProjectId =
        params.projectIdOverride !== undefined ? params.projectIdOverride : projectId

      // Вычисляем sort_order так, чтобы новый тред оказался в конце списка своего проекта.
      // Дефолт колонки = 0, поэтому без этого новые задачи/чаты встраивались в начало.
      let nextSortOrder = 10
      if (effectiveProjectId) {
        const { data: maxRow } = await supabase
          .from('project_threads')
          .select('sort_order')
          .eq('project_id', effectiveProjectId)
          .eq('is_deleted', false)
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle()
        nextSortOrder = (maxRow?.sort_order ?? 0) + 10
      }

      // Если тред email — определяем выставляемые поля для нового унифицированного канала.
      const isEmailChannel = !!params.emailData && params.emailData.contactEmails.length > 0
      let emailSendAccountId: string | null = null
      if (isEmailChannel) {
        // Берём первый активный email_account текущего пользователя — отправлять будем
        // от его имени. Если нет — null, и trigger пойдёт через Resend (system_postmark).
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: acc } = await supabase
            .from('email_accounts')
            .select('id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle()
          emailSendAccountId = acc?.id ?? null
        }
      }

      const threadType = isEmailChannel ? 'email' : (params.type ?? 'chat')

      const { data, error } = await supabase
        .from('project_threads')
        .insert({
          ...(effectiveProjectId && { project_id: effectiveProjectId }),
          workspace_id: workspaceId,
          name: params.name,
          access_type: params.accessType,
          access_roles: params.accessType === 'roles' ? (params.accessRoles ?? []) : [],
          is_default: false,
          type: threadType,
          sort_order: nextSortOrder,
          ...(params.accentColor && { accent_color: params.accentColor }),
          ...(params.icon && { icon: params.icon }),
          ...(params.deadline !== undefined && { deadline: params.deadline }),
          ...(params.statusId !== undefined && { status_id: params.statusId }),
          ...(params.sourceTemplateId && { source_template_id: params.sourceTemplateId }),
          ...(isEmailChannel && {
            email_last_external_address: params.emailData!.contactEmails[0],
            email_subject_root: params.emailData!.subject ?? null,
            email_send_account_id: emailSendAccountId,
            email_send_method: emailSendAccountId ? 'employee_mailbox' : 'system_postmark',
          }),
        })
        .select('*')
        .single()

      if (error) throw error
      const thread = data as ProjectThread

      // Email-канал: новый унифицированный путь использует thread.type='email'
      // и поля email_send_*. Старая project_thread_email_links нужна была только
      // gmail-webhook'у для routing'а Gmail-Pub/Sub. Для нового потока пропускаем
      // её — отправка идёт через email-internal-send Edge Function триггером,
      // приём — через resend-webhook (по адресу t+<short_id>@<slug>.cc.app).

      // Add members for custom access
      if (params.accessType === 'custom' && params.memberIds?.length) {
        const rows = params.memberIds.map((pid) => ({
          thread_id: thread.id,
          participant_id: pid,
        }))
        await supabase.from('project_thread_members').insert(rows)
      }

      // Add task assignees
      if (params.assigneeIds?.length) {
        await supabase
          .from('task_assignees')
          .insert(params.assigneeIds.map((pid) => ({ thread_id: thread.id, participant_id: pid })))
      }

      const resourceType = thread.type === 'task' ? 'task' as const : 'thread' as const
      logAuditAction('create', resourceType, thread.id, {
        name: thread.name,
        type: thread.type,
      }, effectiveProjectId ?? undefined)

      return thread
    },
    onSuccess: (_data, params) => {
      const effectivePid =
        params.projectIdOverride !== undefined ? params.projectIdOverride : projectId
      if (effectivePid) {
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(effectivePid) })
      }
      if (projectId && projectId !== effectivePid) {
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(projectId) })
      }
      // ВАЖНО: useWorkspaceThreads (источник «Мои задачи» и task-колонок досок)
      // живёт под ключом workspaceThreadKeys.forUser — отдельная иерархия от
      // workspaceTaskKeys.byWorkspace. Без явной инвалидации workspaceThreadKeys
      // новая задача не появлялась в досках до полного reload страницы.
      queryClient.invalidateQueries({ queryKey: workspaceThreadKeys.workspace(workspaceId) })
      queryClient.invalidateQueries({ queryKey: workspaceTaskKeys.byWorkspace(workspaceId) })
      queryClient.invalidateQueries({ queryKey: workspaceTaskKeys.assigneesMap })
      queryClient.invalidateQueries({ queryKey: taskKeys.urgentCount(workspaceId) })
      queryClient.invalidateQueries({ queryKey: myTaskCountsKeys.byWorkspace(workspaceId) })
      // Создание задачи с дедлайном меняет has_active_deadline_task у проекта —
      // инвалидируем кеш доступных проектов, чтобы фильтры на досках обновились.
      if (params.type === 'task' && params.deadline) {
        queryClient.invalidateQueries({ queryKey: accessibleProjectKeys.all })
      }
    },
  })
}

/**
 * Мягко удалить тред (только не-дефолтный) — отправить в корзину.
 * Запись в БД не удаляется: выставляются is_deleted/deleted_at/deleted_by.
 * Восстановить или удалить навсегда можно через раздел «Корзина» в настройках воркспейса.
 *
 * Принимает минимум полей, чтобы можно было вызывать и из мессенджера (ProjectThread),
 * и со страницы задач (TaskItem).
 *
 * workspaceId нужен для targeted инвалидации urgent-tasks-count и workspace-tasks —
 * без него инвалидация падала бы по префикс-матчу на все воркспейсы сразу.
 */
export function useDeleteThread(workspaceId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (thread: {
      id: string
      name: string
      type: 'chat' | 'task'
      project_id: string | null
      is_default?: boolean
    }) => {
      if (thread.is_default) throw new Error('Нельзя удалить дефолтный тред')

      const { data: userRes } = await supabase.auth.getUser()
      const userId = userRes.user?.id ?? null

      const { error } = await supabase
        .from('project_threads')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
        })
        .eq('id', thread.id)
      if (error) throw error

      const resourceType = thread.type === 'task' ? 'task' as const : 'thread' as const
      logAuditAction('delete', resourceType, thread.id, {
        name: thread.name,
        type: thread.type,
      }, thread.project_id ?? undefined)

      return thread
    },
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(thread.project_id ?? '') })
      if (workspaceId) {
        // workspaceThreadKeys — реальный источник «Мои задачи» / task-колонок
        // на досках (см. useWorkspaceThreads). Без него удалённая задача
        // оставалась в досках до полного reload.
        queryClient.invalidateQueries({ queryKey: workspaceThreadKeys.workspace(workspaceId) })
        queryClient.invalidateQueries({ queryKey: workspaceTaskKeys.byWorkspace(workspaceId) })
        queryClient.invalidateQueries({ queryKey: taskKeys.urgentCount(workspaceId) })
        queryClient.invalidateQueries({ queryKey: myTaskCountsKeys.byWorkspace(workspaceId) })
      } else {
        // Fallback: старые вызовы без workspaceId — partial-match инвалидация
        // по префиксу. Работает, но задевает все воркспейсы пользователя.
        queryClient.invalidateQueries({ queryKey: workspaceThreadKeys.all })
        queryClient.invalidateQueries({ queryKey: workspaceTaskKeys.all })
        queryClient.invalidateQueries({ queryKey: taskKeys.allUrgent })
        queryClient.invalidateQueries({ queryKey: myTaskCountsKeys.all })
      }
      queryClient.invalidateQueries({ queryKey: trashKeys.all })
      // Удаление любого треда с дедлайном (task / chat / email) может сбросить
      // has_active_deadline_task у проекта. У нас нет deadline в аргументе
      // мутации — инвалидируем безусловно, цена пересчёта незначительная.
      queryClient.invalidateQueries({ queryKey: accessibleProjectKeys.all })
    },
  })
}

/**
 * Переименовать тред
 */
export function useRenameThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { threadId: string; projectId: string; name: string }) => {
      const { data: old } = await supabase
        .from('project_threads')
        .select('name')
        .eq('id', params.threadId)
        .single()

      const { error } = await supabase
        .from('project_threads')
        .update({ name: params.name })
        .eq('id', params.threadId)
      if (error) throw error

      logAuditAction('rename', 'thread', params.threadId, {
        old_name: old?.name,
        new_name: params.name,
      }, params.projectId)

      return params
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(params.projectId) })
    },
  })
}

/**
 * Закрепить/открепить тред в табах
 */
export function usePinThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { threadId: string; projectId: string; isPinned: boolean }) => {
      const { error } = await supabase
        .from('project_threads')
        .update({ is_pinned: params.isPinned })
        .eq('id', params.threadId)
      if (error) throw error

      logAuditAction(
        params.isPinned ? 'pin' : 'unpin',
        'thread',
        params.threadId,
        {},
        params.projectId,
      )

      return params
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(params.projectId) })
    },
  })
}

/**
 * Обновить тред (name, accent_color, icon)
 */
export function useUpdateThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      threadId: string
      projectId: string
      name?: string
      accent_color?: ThreadAccentColor
      icon?: string
      type?: string
      project_id?: string | null
    }) => {
      const update: Record<string, unknown> = {}
      if (params.name !== undefined) update.name = params.name
      if (params.accent_color !== undefined) update.accent_color = params.accent_color
      if (params.icon !== undefined) update.icon = params.icon
      if (params.type !== undefined) update.type = params.type
      if (params.project_id !== undefined) update.project_id = params.project_id

      const { data: old } = await supabase
        .from('project_threads')
        .select('name, accent_color, icon, type')
        .eq('id', params.threadId)
        .single()

      const { error } = await supabase
        .from('project_threads')
        .update(update)
        .eq('id', params.threadId)
      if (error) throw error

      logAuditAction('change_settings', 'thread', params.threadId, {
        ...update,
        old_name: old?.name,
        old_accent_color: old?.accent_color,
        old_icon: old?.icon,
      }, params.projectId)

      return params
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(params.projectId) })
      // Если проект сменился — инвалидируем и новый проект
      if (
        params.project_id !== undefined &&
        params.project_id &&
        params.project_id !== params.projectId
      ) {
        queryClient.invalidateQueries({
          queryKey: messengerKeys.projectThreads(params.project_id),
        })
      }
    },
  })
}
