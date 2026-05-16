/**
 * Form state hook for ChatSettingsDialog.
 * Manages all useState, sync effects, computed values, and reset logic.
 */

import { useState, useEffect } from 'react'
import type { ThreadAccentColor, ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { TabMode, ThreadType, AccessType, ChannelType, ChatCreatePreset } from '../chatSettingsTypes'

export interface UseChatSettingsFormStateParams {
  chat: ProjectThread | null
  propProjectId?: string
  propWorkspaceId?: string
  defaultThreadType: 'chat' | 'task'
  defaultTabMode?: TabMode
  initialValues?: ChatCreatePreset
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
  initialValues,
  open,
}: UseChatSettingsFormStateParams) {
  const isEditMode = !!chat

  const resolvedDefaultTab: TabMode =
    initialValues?.tabMode ??
    defaultTabMode ??
    (defaultThreadType === 'task' ? 'task' : 'chat')

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
  /** false = задача с временным слотом (start_at/end_at). true = только дата (legacy «срок»). */
  const [taskAllDay, setTaskAllDay] = useState<boolean>(true)
  const [taskStartTime, setTaskStartTime] = useState<string>('10:00')
  const [taskEndTime, setTaskEndTime] = useState<string>('10:30')
  /** Если задано — конец на ДРУГОЙ дате (многодневная задача). NULL = тот же день что и taskDeadline. */
  const [taskEndDate, setTaskEndDate] = useState<Date | undefined>(undefined)
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
      // Чтение start_at/end_at из текущего треда — задача может быть уже в календаре
      const startAt = (chat as { start_at?: string | null }).start_at
      const endAt = (chat as { end_at?: string | null }).end_at
      if (startAt && endAt) {
        const s = new Date(startAt)
        const e = new Date(endAt)
        const sameDay =
          s.getFullYear() === e.getFullYear() &&
          s.getMonth() === e.getMonth() &&
          s.getDate() === e.getDate()
        // Распознаём «многодневная all-day»: start 00:00 + end 23:59 на разных датах
        const isMultiDayAllDay =
          !sameDay &&
          s.getHours() === 0 && s.getMinutes() === 0 &&
          e.getHours() === 23 && e.getMinutes() === 59
        if (isMultiDayAllDay) {
          setTaskAllDay(true)
          setTaskDeadline(s)
          setTaskEndDate(e)
        } else {
          setTaskAllDay(false)
          setTaskStartTime(`${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`)
          setTaskEndTime(`${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`)
          setTaskDeadline(s)
          setTaskEndDate(sameDay ? undefined : e)
        }
      } else {
        setTaskAllDay(true)
        setTaskEndDate(undefined)
        if (chat.deadline) setTaskDeadline(new Date(chat.deadline))
      }
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

  // ── Apply initialValues preset on dialog open (create mode only) ──
  useEffect(() => {
    if (!open || isEditMode || !initialValues) return
    if (initialValues.projectId) setSelectedProjectId(initialValues.projectId)
    if (initialValues.statusId) {
      setTaskStatusId(initialValues.statusId)
      setDefaultsApplied(true) // блокируем выставление is_default-статуса
    }
    if (initialValues.deadline) setTaskDeadline(new Date(initialValues.deadline))
    if (initialValues.assigneeIds && initialValues.assigneeIds.length > 0) {
      setTaskAssignees(new Set(initialValues.assigneeIds))
      setAssigneeDefaultApplied(true) // блокируем дефолт «я как assignee»
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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
    setTaskAllDay(true)
    setTaskStartTime('10:00')
    setTaskEndTime('10:30')
    setTaskEndDate(undefined)
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
    taskAllDay,
    setTaskAllDay,
    taskStartTime,
    setTaskStartTime,
    taskEndTime,
    setTaskEndTime,
    taskEndDate,
    setTaskEndDate,
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
