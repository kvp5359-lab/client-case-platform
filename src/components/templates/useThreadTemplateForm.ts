"use client"

/**
 * useThreadTemplateForm — state формы ThreadTemplateDialog + handleSave.
 * Выделено для уменьшения размера диалога.
 */

import { useState, useCallback } from 'react'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { ThreadTemplate, ThreadTemplateFormData } from '@/types/threadTemplate'

export type TabMode = 'task' | 'chat' | 'email'

interface UseThreadTemplateFormParams {
  template: ThreadTemplate | null
  onSave: (data: ThreadTemplateFormData) => void
  taskStatuses: { id: string; is_default: boolean }[]
  /** enrichedEmails из useEmailChips — передаём сюда готовый список */
  enrichedEmails: { email: string; label: string }[]
}

export function useThreadTemplateForm({
  template,
  onSave,
  taskStatuses,
  enrichedEmails,
}: UseThreadTemplateFormParams) {
  const [templateName, setTemplateName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [tabMode, setTabMode] = useState<TabMode>(
    template
      ? template.is_email
        ? 'email'
        : template.thread_type === 'task'
          ? 'task'
          : 'chat'
      : 'chat',
  )
  const [threadNameTemplate, setThreadNameTemplate] = useState(template?.thread_name_template ?? '')
  const [accentColor, setAccentColor] = useState<ThreadAccentColor>(
    (template?.accent_color as ThreadAccentColor) ?? 'blue',
  )
  const [icon, setIcon] = useState(template?.icon ?? 'message-square')
  const [accessType, setAccessType] = useState<'all' | 'roles'>(template?.access_type ?? 'all')
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(template?.access_roles ?? []),
  )
  const [statusId, setStatusId] = useState<string | null>(template?.default_status_id ?? null)
  const [onCompleteStatusId, setOnCompleteStatusId] = useState<string | null>(
    template?.on_complete_set_project_status_id ?? null,
  )
  const [deadlineDays, setDeadlineDays] = useState<string>(
    template?.deadline_days != null ? String(template.deadline_days) : '',
  )
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(
    new Set((template?.thread_template_assignees ?? []).map((a) => a.participant_id)),
  )
  const [emailSubject, setEmailSubject] = useState(template?.email_subject_template ?? '')
  const [initialMessageHtml, setInitialMessageHtml] = useState(template?.initial_message_html ?? '')

  // Tab change side effects: при переключении табов меняем accent/icon и
  // подставляем default-статус для task-режима.
  const handleTabChange = useCallback(
    (t: TabMode) => {
      setTabMode(t)
      if (t === 'task') {
        setAccentColor('slate')
        setIcon('check-square')
        const def = taskStatuses.find((s) => s.is_default)
        if (def && !statusId) setStatusId(def.id)
      } else if (t === 'email') {
        setAccentColor('blue')
        setIcon('mail')
      } else {
        setAccentColor('blue')
        setIcon('message-square')
      }
    },
    [taskStatuses, statusId],
  )

  const isTask = tabMode === 'task'
  const isEmail = tabMode === 'email'
  const canSave = templateName.trim().length > 0

  const handleSave = useCallback(() => {
    if (!canSave) return
    const days = deadlineDays.trim() ? parseInt(deadlineDays, 10) : null
    onSave({
      name: templateName.trim(),
      description: description.trim() || '',
      thread_type: isTask ? 'task' : 'chat',
      is_email: isEmail,
      thread_name_template: threadNameTemplate.trim() || '',
      accent_color: accentColor,
      icon,
      access_type: accessType,
      access_roles: accessType === 'roles' ? Array.from(selectedRoles) : [],
      default_status_id: isTask ? statusId : null,
      deadline_days: isTask && days != null && !isNaN(days) ? days : null,
      on_complete_set_project_status_id: isTask ? onCompleteStatusId : null,
      assignee_ids: isTask ? Array.from(assigneeIds) : [],
      default_contact_email: isEmail ? enrichedEmails.map((e) => e.email).join(', ') : '',
      email_subject_template: isEmail ? emailSubject.trim() : '',
      initial_message_html: initialMessageHtml.trim() || '',
    })
  }, [
    canSave,
    templateName,
    description,
    isTask,
    isEmail,
    threadNameTemplate,
    accentColor,
    icon,
    accessType,
    selectedRoles,
    statusId,
    onCompleteStatusId,
    deadlineDays,
    assigneeIds,
    enrichedEmails,
    emailSubject,
    initialMessageHtml,
    onSave,
  ])

  const toggleAssignee = useCallback((id: string) => {
    setAssigneeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleRole = useCallback((role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }, [])

  return {
    // state
    templateName,
    setTemplateName,
    description,
    setDescription,
    tabMode,
    threadNameTemplate,
    setThreadNameTemplate,
    accentColor,
    setAccentColor,
    icon,
    setIcon,
    accessType,
    setAccessType,
    selectedRoles,
    statusId,
    setStatusId,
    onCompleteStatusId,
    setOnCompleteStatusId,
    deadlineDays,
    setDeadlineDays,
    assigneeIds,
    emailSubject,
    setEmailSubject,
    initialMessageHtml,
    setInitialMessageHtml,
    // derived
    isTask,
    isEmail,
    canSave,
    // actions
    handleTabChange,
    handleSave,
    toggleAssignee,
    toggleRole,
  }
}
