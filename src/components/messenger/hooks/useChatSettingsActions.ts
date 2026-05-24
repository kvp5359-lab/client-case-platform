/**
 * Actions / handlers for ChatSettingsDialog.
 *
 * После аудита 2026-04-11 (Зона 6) крупные блоки логики вынесены в отдельные
 * хуки, чтобы этот файл не превышал 400 строк:
 *  - `useChatSettingsTemplateApply` — применение шаблона треда
 *  - `useChatSettingsSave` — сохранение формы (3 ветки: edit / task / chat+email)
 *  - `useChatSettingsDefaults` — инициализация defaults (status, assignee)
 *
 * Этот файл держит только data-fetching, мутации, тонкие handler-обёртки
 * и финальный объект, который отдаётся в UI.
 */

import { useCallback, useEffect, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  useEmailLink,
  useCreateEmailLink,
  useRemoveEmailLink,
  useUpdateEmailLink,
} from '@/hooks/email/useEmailLink'
import { useTelegramLink } from '@/hooks/messenger/useTelegramLink'
import { toast } from 'sonner'
import type { ThreadTemplate } from '@/types/threadTemplate'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useTaskAssigneeIds, useToggleAssignee } from '@/components/tasks/useTaskAssignees'
import type { ChatSettingsResult, AccessType } from '../chatSettingsTypes'
import type { ThreadAccentColor, ProjectThread } from '@/hooks/messenger/useProjectThreads'
import {
  useProjectParticipants,
  useWorkspaceProjects,
  useThreadMembers,
  useEmailSuggestions,
} from './useChatSettingsData'
import { useChatSettingsMutations } from './useChatSettingsMutations'
import { useDocumentPickerLogic } from './useDocumentPickerLogic'
import { useTelegramLinkCopy } from './useTelegramLinkCopy'
import { useEmailSuggestionsFilter } from './useEmailSuggestionsFilter'
import { useChatSettingsTemplateApply } from './useChatSettingsTemplateApply'
import { useChatSettingsSave } from './useChatSettingsSave'
import { useChatSettingsDefaults } from './useChatSettingsDefaults'
import type { ComposeFieldHandle } from '../ComposeField'
import type { useChatSettingsFormState } from './useChatSettingsFormState'
import { STALE_TIME, statusKeys } from '@/hooks/queryKeys'

type FormReturn = ReturnType<typeof useChatSettingsFormState>

type UseChatSettingsActionsParams = {
  chat: ProjectThread | null
  propProjectId?: string
  resolvedWorkspaceId?: string
  open: boolean
  form: FormReturn
  composeRef: RefObject<ComposeFieldHandle | null>
  initialTemplate?: ThreadTemplate | null
  userId?: string
  onCreate?: (result: ChatSettingsResult) => void
  onUpdate?: (params: {
    name: string
    accent_color: ThreadAccentColor
    icon: string
    type?: string
  }) => void
}

export function useChatSettingsActions({
  chat,
  propProjectId,
  resolvedWorkspaceId,
  open,
  form,
  composeRef,
  initialTemplate,
  userId,
  onCreate,
  onUpdate,
}: UseChatSettingsActionsParams) {
  // ── Task statuses ──
  const { data: taskStatuses = [] } = useQuery({
    queryKey: statusKeys.task(resolvedWorkspaceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statuses')
        .select('id, name, color, icon, is_default')
        .eq('entity_type', 'task')
        .eq('workspace_id', resolvedWorkspaceId!)
        .order('order_index')
      if (error) throw error
      return data ?? []
    },
    enabled: !!resolvedWorkspaceId && open,
    staleTime: STALE_TIME.LONG,
  })

  // ── Projects ──
  const { data: workspaceProjects = [] } = useWorkspaceProjects(
    open ? (resolvedWorkspaceId ?? undefined) : undefined,
  )

  // ── Participants ──
  const effectiveProjectId = form.isEditMode
    ? (form.selectedProjectId ?? chat!.project_id)
    : (form.selectedProjectId ?? propProjectId)
  const { data: selectedProjectParticipants = [] } = useProjectParticipants(
    open && effectiveProjectId ? effectiveProjectId : undefined,
  )
  const { data: workspaceParticipants = [] } = useWorkspaceParticipants(
    open && !effectiveProjectId ? (resolvedWorkspaceId ?? undefined) : undefined,
  )
  const effectiveParticipants = effectiveProjectId
    ? selectedProjectParticipants
    : workspaceParticipants

  // ── Email link (edit mode) ──
  const { data: emailLink } = useEmailLink(chat?.id)
  const createEmailLink = useCreateEmailLink(chat?.id)
  const updateEmailLink = useUpdateEmailLink(chat?.id)
  const removeEmailLink = useRemoveEmailLink(chat?.id)

  // ── Sync form fields with current email link ──
  // Когда тред уже привязан к email, поля «Email клиента» / «Тема письма»
  // показывают текущие значения (а не пустые, как раньше). Так пользователь
  // видит, что именно сейчас закреплено за тредом, и может отредактировать.
  useEffect(() => {
    if (!open || !form.isEditMode) return
    if (emailLink) {
      // Только если ещё не вводил вручную (не перезаписываем правки пользователя).
      if (form.selectedEmails.length === 0 && !form.emailInput) {
        form.setSelectedEmails([
          { email: emailLink.contact_email, label: emailLink.contact_email },
        ])
      }
      if (!form.emailSubject && !form.subjectTouched) {
        form.setEmailSubject(emailLink.subject ?? '')
      }
    } else {
      // Привязки нет → очищаем поля, чтобы можно было ввести новую.
      if (form.selectedEmails.length > 0) form.setSelectedEmails([])
      if (form.emailSubject && !form.subjectTouched) form.setEmailSubject('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailLink?.id, open, chat?.id])

  // ── Telegram link (edit mode) ──
  const {
    telegramLink,
    isLinked: isTelegramLinked,
    linkCode: telegramLinkCode,
    isLoadingCode: isTelegramCodeLoading,
    unlink: unlinkTelegram,
    isUnlinking: isTelegramUnlinking,
  } = useTelegramLink(chat?.project_id ?? '', 'client', chat?.id, open)

  const { telegramCopied, handleCopyTelegramCode } = useTelegramLinkCopy(telegramLinkCode)

  // ── Email suggestions ──
  // tabMode='email' — режим «новый Email-тред» (channelType ещё не выставлен).
  // channelType='email' — режим настроек существующего чата с email-каналом.
  const isEmailContext = form.tabMode === 'email' || form.channelType === 'email'
  const { data: emailSuggestions = [] } = useEmailSuggestions(
    isEmailContext ? resolvedWorkspaceId : undefined,
  )
  const { filteredSuggestions } = useEmailSuggestionsFilter(
    emailSuggestions,
    form.selectedEmails,
    form.emailInput,
    form.setSelectedEmails,
  )

  // ── Document picker ──
  const composeProjectId = form.selectedProjectId ?? propProjectId ?? ''
  const {
    projectDocuments,
    statusMap: docStatusMap,
    docPickerOpen,
    setDocPickerOpen,
    docPickerKey,
    isDownloading: isDocDownloading,
    addFilesRef: docAddFilesRef,
    handleOpenDocPicker,
    handleConfirmDocPicker,
  } = useDocumentPickerLogic(composeProjectId, resolvedWorkspaceId ?? '')
  useEffect(() => {
    docAddFilesRef.current = (files: File[]) => composeRef.current?.addFiles(files)
    return () => {
      docAddFilesRef.current = null
    }
  }, [docAddFilesRef, composeRef])

  // ── Mutations ──
  const {
    updateProjectMutation,
    updateStatusMutation,
    updateDeadlineMutation,
    updateAccessMutation,
    toggleMemberMutation,
    queryClient,
  } = useChatSettingsMutations({
    chatId: chat?.id,
    chatProjectId: chat?.project_id,
    selectedProjectId: form.selectedProjectId,
    resolvedWorkspaceId,
  })

  // ── Thread members (edit mode) ──
  const { data: memberIds = new Set<string>() } = useThreadMembers(
    form.isEditMode && form.accessType === 'custom' ? chat!.id : undefined,
  )

  // ── Task assignees (edit mode) ──
  const editTaskId = form.isEditMode ? chat!.id : undefined
  const { data: editAssigneeIds = [] } = useTaskAssigneeIds(editTaskId)
  const toggleAssignee = useToggleAssignee(editTaskId)
  const editAssigneeSet = new Set(editAssigneeIds)

  // ── Defaults (task status + assignee в create-mode) ──
  useChatSettingsDefaults({
    form,
    taskStatuses,
    effectiveParticipants,
    userId,
  })

  // ── Template apply (+ auto-apply initialTemplate) ──
  const { appliedTemplateId, handleApplyTemplate, pendingInitialHtml } = useChatSettingsTemplateApply({
    open,
    form,
    composeRef,
    initialTemplate,
    workspaceProjects,
    selectedProjectParticipants,
    workspaceParticipants,
    effectiveParticipants,
    taskStatuses,
    emailSuggestions,
  })

  // ── Handlers ──
  const handleAccessChange = useCallback(
    (newAccess: AccessType, roles?: string[]) => {
      form.setAccessType(newAccess)
      if (form.isEditMode) updateAccessMutation.mutate({ accessType: newAccess, roles })
    },
    [form, updateAccessMutation],
  )

  const handleToggleMember = useCallback(
    (participantId: string) => {
      const isMember = memberIds.has(participantId)
      toggleMemberMutation.mutate({ participantId, add: !isMember })
      queryClient.setQueryData(['thread-members', chat?.id], (old: Set<string> | undefined) => {
        const next = new Set(old ?? [])
        if (isMember) next.delete(participantId)
        else next.add(participantId)
        return next
      })
    },
    [memberIds, toggleMemberMutation, chat?.id, queryClient],
  )

  const handleProjectSelect = useCallback(
    (projectId: string | null) => {
      form.setSelectedProjectId(projectId)
      if (form.isEditMode) updateProjectMutation.mutate(projectId)
    },
    [form, updateProjectMutation],
  )

  const handleStatusSelect = useCallback(
    (sid: string) => {
      if (form.isEditMode) {
        form.setLocalStatusId(sid)
        updateStatusMutation.mutate(sid)
      } else {
        form.setTaskStatusId(sid)
      }
      form.setStatusPopoverOpen(false)
    },
    [form, updateStatusMutation],
  )

  const handleDeadlineSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return
      if (form.isEditMode) {
        const iso = date.toISOString()
        form.setLocalDeadline(iso)
        updateDeadlineMutation.mutate(iso)
      } else {
        form.setTaskDeadline(date)
      }
    },
    [form, updateDeadlineMutation],
  )

  const handleDeadlineClear = useCallback(() => {
    if (form.isEditMode) {
      form.setLocalDeadline(null)
      updateDeadlineMutation.mutate(null)
    } else {
      form.setTaskDeadline(undefined)
    }
  }, [form, updateDeadlineMutation])

  const handleLinkEmail = useCallback(() => {
    // Целевой адрес: либо то, что юзер набирает в input, либо уже выбранный чип
    // (когда обновляем существующую привязку и input пустой).
    const targetEmail =
      form.emailInput.trim() ||
      (form.selectedEmails.length > 0 ? form.selectedEmails[0].email : '')
    if (!targetEmail) return
    const subject = form.emailSubject.trim() || undefined

    if (emailLink) {
      // Привязка уже есть → UPDATE (меняем email или тему).
      updateEmailLink.mutate(
        { linkId: emailLink.id, contactEmail: targetEmail, subject: subject ?? null },
        {
          onSuccess: () => {
            toast.success('Email-канал обновлён')
            form.setEmailInput('')
            form.setSubjectTouched(false)
          },
          onError: () => toast.error('Не удалось обновить email-канал'),
        },
      )
    } else {
      createEmailLink.mutate(
        { contactEmail: targetEmail, subject },
        {
          onSuccess: () => {
            toast.success('Email привязан')
            form.setEmailInput('')
            form.setSubjectTouched(false)
          },
          onError: () => toast.error('Не удалось привязать email'),
        },
      )
    }
  }, [form, createEmailLink, updateEmailLink, emailLink])

  const handleUnlinkEmail = useCallback(() => {
    if (!emailLink) return
    removeEmailLink.mutate(emailLink.id, {
      onSuccess: () => toast.success('Email отвязан'),
      onError: () => toast.error('Не удалось отвязать email'),
    })
  }, [emailLink, removeEmailLink])

  // ── Save ──
  const handleSave = useChatSettingsSave({
    form,
    composeRef,
    appliedTemplateId,
    onCreate,
    onUpdate,
  })

  const currentStatus = taskStatuses.find((s) => s.id === form.currentStatusId)

  return {
    // Data
    taskStatuses,
    workspaceProjects,
    effectiveParticipants,
    currentStatus,
    emailLink,
    emailSuggestions,
    filteredSuggestions,
    memberIds,
    editAssigneeSet,
    toggleAssignee,
    // Telegram
    telegramLink,
    isTelegramLinked,
    telegramLinkCode,
    isTelegramCodeLoading,
    unlinkTelegram,
    isTelegramUnlinking,
    telegramCopied,
    handleCopyTelegramCode,
    // Email link
    isLinkingEmail: createEmailLink.isPending || updateEmailLink.isPending,
    isUnlinkingEmail: removeEmailLink.isPending,
    // Document picker
    projectDocuments,
    docStatusMap,
    docPickerOpen,
    setDocPickerOpen,
    docPickerKey,
    isDocDownloading,
    handleOpenDocPicker,
    handleConfirmDocPicker,
    composeProjectId,
    pendingInitialHtml,
    // Handlers
    handleApplyTemplate,
    handleAccessChange,
    handleToggleMember,
    handleProjectSelect,
    handleStatusSelect,
    handleDeadlineSelect,
    handleDeadlineClear,
    handleLinkEmail,
    handleUnlinkEmail,
    handleSave,
  }
}
