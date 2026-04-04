/**
 * Actions / handlers for ChatSettingsDialog.
 * Encapsulates: template apply, email link, telegram copy,
 * document picker bridge, deadline/status/project/access handlers, save.
 */

import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEmailLink, useCreateEmailLink, useRemoveEmailLink } from '@/hooks/email/useEmailLink'
import { useTelegramLink } from '@/hooks/messenger/useTelegramLink'
import { toast } from 'sonner'
import { formatDateToString } from '@/utils/dateFormat'
import { applyTemplate } from '@/hooks/messenger/useThreadTemplates'
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
import type { ComposeFieldHandle } from '../ComposeField'
import type { useChatSettingsFormState } from './useChatSettingsFormState'

type FormReturn = ReturnType<typeof useChatSettingsFormState>

interface UseChatSettingsActionsParams {
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
    queryKey: ['statuses', 'task', resolvedWorkspaceId ?? ''],
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
    staleTime: 5 * 60_000,
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
  const removeEmailLink = useRemoveEmailLink(chat?.id)

  // ── Telegram link (edit mode) ──
  const {
    telegramLink,
    isLinked: isTelegramLinked,
    linkCode: telegramLinkCode,
    isLoadingCode: isTelegramCodeLoading,
    unlink: unlinkTelegram,
    isUnlinking: isTelegramUnlinking,
  } = useTelegramLink(chat?.project_id ?? '', 'client', chat?.id, open)

  const [telegramCopied, setTelegramCopied] = useState(false)
  const handleCopyTelegramCode = useCallback(async () => {
    if (!telegramLinkCode) return
    try {
      await navigator.clipboard.writeText(`/link ${telegramLinkCode}`)
      setTelegramCopied(true)
      setTimeout(() => setTelegramCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }, [telegramLinkCode])

  // ── Email suggestions ──
  const { data: emailSuggestions = [] } = useEmailSuggestions(
    form.channelType === 'email' ? resolvedWorkspaceId : undefined,
  )
  useEffect(() => {
    if (emailSuggestions.length === 0 || form.selectedEmails.length === 0) return
    form.setSelectedEmails((prev) =>
      prev.map((chip) => {
        if (chip.label !== chip.email) return chip
        const match = emailSuggestions.find(
          (s) => s.email.toLowerCase() === chip.email.toLowerCase(),
        )
        return match ? { ...chip, label: match.label } : chip
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailSuggestions])

  const filteredSuggestions = useMemo(() => {
    const selectedSet = new Set(form.selectedEmails.map((e) => e.email.toLowerCase()))
    const base = emailSuggestions.filter((s) => !selectedSet.has(s.email.toLowerCase()))
    if (!form.emailInput.trim()) return base
    const q = form.emailInput.toLowerCase()
    return base.filter(
      (s) => s.email.toLowerCase().includes(q) || s.label.toLowerCase().includes(q),
    )
  }, [form.emailInput, emailSuggestions, form.selectedEmails])

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

  // ── Default status for tasks (create mode) ──
  if (!form.isEditMode && form.isTask && !form.defaultsApplied && taskStatuses.length > 0) {
    const def = taskStatuses.find((s) => s.is_default) ?? taskStatuses[0]
    if (def && !form.taskStatusId) form.setTaskStatusId(def.id)
    form.setDefaultsApplied(true)
  }

  // ── Default assignee — current user (create task mode) ──
  if (
    !form.isEditMode &&
    form.isTask &&
    !form.assigneeDefaultApplied &&
    effectiveParticipants.length > 0 &&
    userId
  ) {
    const me = effectiveParticipants.find((p) => p.user_id === userId)
    if (me) {
      form.setTaskAssignees(new Set([me.id]))
      form.setAssigneeDefaultApplied(true)
    }
  }

  // ── Template apply ──
  const handleApplyTemplate = useCallback(
    (template: ThreadTemplate) => {
      const projectName = workspaceProjects.find((p) => p.id === form.selectedProjectId)?.name ?? ''
      const projectParticipantIds = new Set(effectiveParticipants.map((p) => p.id))
      const taskStatusIds = new Set(taskStatuses.map((s) => s.id))
      const result = applyTemplate(template, {
        projectName,
        projectParticipantIds,
        allParticipants: [...selectedProjectParticipants, ...workspaceParticipants],
        taskStatusIds,
      })
      form.setTabMode(result.tabMode)
      form.setName(result.name)
      form.setAccentColor(result.accentColor)
      form.setIcon(result.icon)
      form.setAccessType(result.accessType)
      form.setSelectedRoles(new Set(result.accessRoles))
      if (result.taskStatusId) form.setTaskStatusId(result.taskStatusId)
      if (result.taskDeadline) form.setTaskDeadline(result.taskDeadline)
      form.setTaskAssignees(new Set(result.taskAssigneeIds))
      if (result.channelType === 'email') {
        if (result.contactEmails?.length) {
          form.setSelectedEmails(
            result.contactEmails.map((e: string) => {
              const match = emailSuggestions.find((s) => s.email.toLowerCase() === e.toLowerCase())
              return { email: e, label: match?.label ?? e }
            }),
          )
        }
        form.setEmailSubject(result.emailSubject)
      }
      if (result.initialMessageHtml) {
        composeRef.current?.setHtml(result.initialMessageHtml)
      }
      if (result.missingAssignees.length > 0) {
        toast.info(`Не найдены в проекте: ${result.missingAssignees.join(', ')}`, {
          duration: 5000,
        })
      }
    },
    [
      workspaceProjects,
      form.selectedProjectId,
      effectiveParticipants,
      selectedProjectParticipants,
      workspaceParticipants,
      taskStatuses,
      emailSuggestions,
      composeRef,
    ],
  )

  // Auto-apply initial template
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null)
  useEffect(() => {
    if (open && !form.isEditMode && initialTemplate && initialTemplate.id !== appliedTemplateId) {
      handleApplyTemplate(initialTemplate)
      setAppliedTemplateId(initialTemplate.id)
    }
    if (!open) setAppliedTemplateId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTemplate])

  // ── Handlers ──
  const handleAccessChange = useCallback(
    (newAccess: AccessType, roles?: string[]) => {
      form.setAccessType(newAccess)
      if (form.isEditMode) updateAccessMutation.mutate({ accessType: newAccess, roles })
    },
    [form.isEditMode, updateAccessMutation],
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
    [form.isEditMode, updateProjectMutation],
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
    [form.isEditMode, updateStatusMutation],
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
    [form.isEditMode, updateDeadlineMutation],
  )

  const handleDeadlineClear = useCallback(() => {
    if (form.isEditMode) {
      form.setLocalDeadline(null)
      updateDeadlineMutation.mutate(null)
    } else {
      form.setTaskDeadline(undefined)
    }
  }, [form.isEditMode, updateDeadlineMutation])

  const handleLinkEmail = useCallback(() => {
    if (!form.emailInput.trim()) return
    createEmailLink.mutate(
      { contactEmail: form.emailInput.trim(), subject: form.emailSubject.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Email привязан')
          form.setEmailInput('')
          form.setEmailSubject('')
        },
        onError: () => toast.error('Не удалось привязать email'),
      },
    )
  }, [form.emailInput, form.emailSubject, createEmailLink])

  const handleUnlinkEmail = useCallback(() => {
    if (!emailLink) return
    removeEmailLink.mutate(emailLink.id, {
      onSuccess: () => toast.success('Email отвязан'),
      onError: () => toast.error('Не удалось отвязать email'),
    })
  }, [emailLink, removeEmailLink])

  const handleSave = useCallback(() => {
    if (form.isEditMode) {
      if (!form.name.trim()) return
      onUpdate?.({
        name: form.name.trim(),
        accent_color: form.accentColor,
        icon: form.icon,
        type: form.threadType,
      })
    } else if (form.threadType === 'task') {
      if (!form.name.trim()) return
      const compose = composeRef.current
      const initialMessage =
        compose && !compose.isEmpty()
          ? { html: compose.getHtml(), files: compose.getFiles() }
          : undefined
      onCreate?.({
        threadType: 'task',
        name: form.name.trim(),
        accessType: form.accessType,
        accentColor: 'slate',
        icon: 'check-square',
        channelType: 'chat',
        memberIds: form.accessType === 'custom' ? Array.from(form.selectedMemberIds) : undefined,
        accessRoles: form.accessType === 'roles' ? Array.from(form.selectedRoles) : undefined,
        deadline: form.taskDeadline ? formatDateToString(form.taskDeadline) : null,
        statusId: form.taskStatusId,
        assigneeIds: Array.from(form.taskAssignees),
        projectId: form.selectedProjectId,
        initialMessage,
      })
    } else {
      const isEmail = form.channelType === 'email'
      if (isEmail && form.selectedEmails.length === 0) return
      if (!isEmail && !form.name.trim()) return
      const chatName = isEmail ? form.name.trim() || form.emailSubject.trim() : form.name.trim()
      const compose = composeRef.current
      const initialMessage =
        compose && !compose.isEmpty()
          ? { html: compose.getHtml(), files: compose.getFiles() }
          : undefined
      onCreate?.({
        threadType: 'chat',
        name: chatName,
        accessType: form.accessType,
        accentColor: form.accentColor,
        icon: isEmail ? 'mail' : form.icon,
        channelType: form.channelType,
        contactEmails: isEmail ? form.selectedEmails : undefined,
        emailSubject: isEmail ? form.emailSubject.trim() || undefined : undefined,
        memberIds: form.accessType === 'custom' ? Array.from(form.selectedMemberIds) : undefined,
        accessRoles: form.accessType === 'roles' ? Array.from(form.selectedRoles) : undefined,
        projectId: form.selectedProjectId,
        initialMessage,
      })
    }
  }, [form, composeRef, onCreate, onUpdate])

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
    isLinkingEmail: createEmailLink.isPending,
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
