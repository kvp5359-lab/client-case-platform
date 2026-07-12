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

import { useEffect, useMemo, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTelegramLink } from '@/hooks/messenger/useTelegramLink'
import type { ThreadTemplate } from '@/types/threadTemplate'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useTaskAssigneeIds, useToggleAssignee } from '@/components/tasks/useTaskAssignees'
import type { ChatSettingsResult } from '../chatSettingsTypes'
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
import { useChatSettingsEmailLink } from './useChatSettingsEmailLink'
import { useChatSettingsFieldHandlers } from './useChatSettingsFieldHandlers'
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
  // Workspace-участники грузим ВСЕГДА (не только в no-project) — нужны, чтобы
  // показать/назначить исполнителя, которого нет среди участников проекта
  // (напр. владельца): назначение даёт доступ к задаче даже без доступа к проекту.
  const { data: workspaceParticipants = [] } = useWorkspaceParticipants(
    open ? (resolvedWorkspaceId ?? undefined) : undefined,
  )
  const effectiveParticipants = effectiveProjectId
    ? selectedProjectParticipants
    : workspaceParticipants
  // Список для попапа исполнителей: участники проекта + все сотрудники воркспейса
  // (дедуп по id). Так исполнитель из шаблона, не состоящий в проекте, виден и
  // выбираем. Прочие потребители effectiveParticipants (упоминания/дефолты) не
  // затронуты.
  const assigneeParticipants = useMemo(() => {
    const byId = new Map<string, (typeof effectiveParticipants)[number]>()
    for (const p of effectiveParticipants) byId.set(p.id, p)
    for (const p of workspaceParticipants) if (!byId.has(p.id)) byId.set(p.id, p)
    return Array.from(byId.values())
  }, [effectiveParticipants, workspaceParticipants])

  // ── Email link (edit mode): привязка + синхронизация полей + link/unlink ──
  const { emailLink, handleLinkEmail, handleUnlinkEmail, isLinkingEmail, isUnlinkingEmail } =
    useChatSettingsEmailLink({ chat, form, open })

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
  const mutations = useChatSettingsMutations({
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

  // ── Field handlers (доступ/участник/проект/статус/дедлайн) ──
  const {
    handleAccessChange,
    handleToggleMember,
    handleProjectSelect,
    handleStatusSelect,
    handleDeadlineSelect,
    handleDeadlineClear,
  } = useChatSettingsFieldHandlers({ form, mutations, memberIds, chatId: chat?.id })

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
    assigneeParticipants,
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
    isLinkingEmail,
    isUnlinkingEmail,
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
