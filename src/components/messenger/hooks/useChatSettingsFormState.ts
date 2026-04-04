/**
 * Form state hook for ChatSettingsDialog.
 * Manages all useState, sync effects, computed values, and reset logic.
 */

import { useState, useEffect } from 'react'
import type { ThreadAccentColor, ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { TabMode, ThreadType, AccessType, ChannelType } from '../chatSettingsTypes'

export interface UseChatSettingsFormStateParams {
  chat: ProjectThread | null
  propProjectId?: string
  propWorkspaceId?: string
  defaultThreadType: 'chat' | 'task'
  defaultTabMode?: TabMode
  open: boolean
}

function getDefaultAccent(tab: TabMode): ThreadAccentColor {
  return tab === 'task' ? 'slate' : tab === 'email' ? 'rose' : 'blue'
}

function getDefaultIcon(tab: TabMode): string {
  return tab === 'task' ? 'check-square' : tab === 'email' ? 'mail' : 'message-square'
}

export function useChatSettingsFormState({
  chat,
  propProjectId,
  defaultThreadType,
  defaultTabMode,
  open,
}: UseChatSettingsFormStateParams) {
  const isEditMode = !!chat

  const resolvedDefaultTab: TabMode =
    defaultTabMode ?? (defaultThreadType === 'task' ? 'task' : 'chat')

  // ── All useState ──
  const [tabMode, setTabMode] = useState<TabMode>(resolvedDefaultTab)
  const [telegramChannelType, setTelegramChannelType] = useState<'none' | 'telegram'>('none')
  const [name, setName] = useState('')
  const [accentColor, setAccentColor] = useState<ThreadAccentColor>(
    getDefaultAccent(resolvedDefaultTab),
  )
  const [icon, setIcon] = useState(getDefaultIcon(resolvedDefaultTab))
  const [accessType, setAccessType] = useState<AccessType>('custom')
  const [selectedEmails, setSelectedEmails] = useState<Array<{ email: string; label: string }>>([])
  const [emailInput, setEmailInput] = useState('')
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = useState(false)
  const [localDeadline, setLocalDeadline] = useState<string | null>(null)
  const [localStatusId, setLocalStatusId] = useState<string | null>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [subjectTouched, setSubjectTouched] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [channelExpanded, setChannelExpanded] = useState(false)
  const [taskDeadline, setTaskDeadline] = useState<Date | undefined>(
    defaultThreadType === 'task' ? new Date() : undefined,
  )
  const [taskStatusId, setTaskStatusId] = useState<string | null>(null)
  const [taskAssignees, setTaskAssignees] = useState<Set<string>>(new Set())
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(propProjectId ?? null)
  const [hasInitialMessage, setHasInitialMessage] = useState(false)
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false)
  const [emailDropdownOpen, setEmailDropdownOpen] = useState(false)

  // ── Sync state when chat changes (edit mode) ──
  const [prevChatId, setPrevChatId] = useState('')
  const currentChatId = chat?.id ?? ''
  if (currentChatId !== prevChatId) {
    setPrevChatId(currentChatId)
    if (chat) {
      setTabMode((chat.type as 'chat' | 'task') === 'task' ? 'task' : 'chat')
      setName(chat.name)
      setAccentColor(chat.accent_color)
      setIcon(chat.icon)
      setAccessType(chat.access_type)
      setSelectedRoles(new Set(chat.access_roles ?? []))
      setLocalDeadline(chat.deadline)
      setLocalStatusId(chat.status_id)
      setSelectedProjectId(chat.project_id)
    } else {
      setName('')
      setAccentColor(getDefaultAccent(resolvedDefaultTab))
      setIcon(getDefaultIcon(resolvedDefaultTab))
      setAccessType('custom')
      setTabMode(resolvedDefaultTab)
      setSelectedEmails([])
      setEmailInput('')
      setEmailSubject('')
      setSubjectTouched(false)
      setSelectedMemberIds(new Set())
      setSelectedRoles(new Set())
      setSelectedProjectId(propProjectId ?? null)
    }
  }

  // ── Sync tab mode when dialog opens in create mode ──
  useEffect(() => {
    if (open && !isEditMode) {
      setTabMode(resolvedDefaultTab)
      setAccentColor(getDefaultAccent(resolvedDefaultTab))
      setIcon(getDefaultIcon(resolvedDefaultTab))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resolvedDefaultTab])

  // ── Defaults tracking (used by actions hook) ──
  const [defaultsApplied, setDefaultsApplied] = useState(false)
  const [assigneeDefaultApplied, setAssigneeDefaultApplied] = useState(false)

  // ── Computed values ──
  const threadType: ThreadType = tabMode === 'task' ? 'task' : 'chat'
  const isTask = tabMode === 'task'
  const channelType: ChannelType =
    tabMode === 'email' ? 'email' : telegramChannelType === 'telegram' ? 'telegram' : 'none'

  const currentDl = isEditMode ? localDeadline : taskDeadline ? taskDeadline.toISOString() : null
  const currentDlDate = currentDl ? new Date(currentDl) : undefined
  const currentStatusId = isEditMode ? localStatusId : taskStatusId

  const canSave = isEditMode
    ? name.trim().length > 0
    : channelType === 'email'
      ? selectedEmails.length > 0
      : name.trim().length > 0

  // ── Reset function (called on dialog close in create mode) ──
  const reset = () => {
    setTabMode(resolvedDefaultTab)
    setName('')
    setAccentColor(getDefaultAccent(resolvedDefaultTab))
    setIcon(getDefaultIcon(resolvedDefaultTab))
    setAccessType('custom')
    setTelegramChannelType('none')
    setSelectedEmails([])
    setEmailInput('')
    setEmailSubject('')
    setSubjectTouched(false)
    setSelectedMemberIds(new Set())
    setSelectedRoles(new Set())
    setTaskDeadline(defaultThreadType === 'task' ? new Date() : undefined)
    setTaskStatusId(null)
    setTaskAssignees(new Set())
    setChannelExpanded(false)
    setSelectedProjectId(propProjectId ?? null)
    setHasInitialMessage(false)
    setDefaultsApplied(false)
    setAssigneeDefaultApplied(false)
  }

  return {
    // Derived / computed
    resolvedDefaultTab,
    threadType,
    isTask,
    channelType,
    currentDl,
    currentDlDate,
    currentStatusId,
    canSave,
    isEditMode,

    // State + setters
    tabMode,
    setTabMode,
    telegramChannelType,
    setTelegramChannelType,
    name,
    setName,
    accentColor,
    setAccentColor,
    icon,
    setIcon,
    accessType,
    setAccessType,
    selectedEmails,
    setSelectedEmails,
    emailInput,
    setEmailInput,
    deadlinePopoverOpen,
    setDeadlinePopoverOpen,
    localDeadline,
    setLocalDeadline,
    localStatusId,
    setLocalStatusId,
    emailSubject,
    setEmailSubject,
    subjectTouched,
    setSubjectTouched,
    selectedMemberIds,
    setSelectedMemberIds,
    selectedRoles,
    setSelectedRoles,
    channelExpanded,
    setChannelExpanded,
    taskDeadline,
    setTaskDeadline,
    taskStatusId,
    setTaskStatusId,
    taskAssignees,
    setTaskAssignees,
    selectedProjectId,
    setSelectedProjectId,
    hasInitialMessage,
    setHasInitialMessage,
    statusPopoverOpen,
    setStatusPopoverOpen,
    emailDropdownOpen,
    setEmailDropdownOpen,
    defaultsApplied,
    setDefaultsApplied,
    assigneeDefaultApplied,
    setAssigneeDefaultApplied,

    // Actions
    reset,
  }
}
