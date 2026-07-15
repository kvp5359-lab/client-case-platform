"use client"

/**
 * useThreadTemplateForm — state формы ThreadTemplateDialog + handleSave.
 * Выделено для уменьшения размера диалога.
 */

import { useState, useCallback, useMemo } from 'react'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { CREATOR_ASSIGNEE_ID } from '@/types/threadTemplate'
import type {
  ThreadTemplate,
  ThreadTemplateFormData,
  ThreadTemplateProjectOverride,
} from '@/types/threadTemplate'

export type TabMode = 'task' | 'chat' | 'email'

type UseThreadTemplateFormParams = {
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
  // ── Пер-проектное переопределение ──
  // Когда шаблон загружен в контексте типа проекта, template.projectOverride
  // задан. Поля формы инициализируются ЭФФЕКТИВНЫМ значением (override ?? общее),
  // а общие («рыба») значения запоминаем — чтобы восстановить при «сбросе».
  const override = template?.projectOverride
  const isProjectMode = !!override

  const commonDeadline = template?.deadline_days ?? null
  const commonMessage = template?.initial_message_html ?? ''
  const commonAccessType: 'all' | 'roles' = template?.access_type ?? 'all'
  const commonAccessRoles = useMemo(() => template?.access_roles ?? [], [template])
  const commonAssigneeIds = useMemo(
    () => (template?.thread_template_assignees ?? []).map((a) => a.participant_id),
    [template],
  )

  const effDeadline =
    override && override.deadline_days != null ? override.deadline_days : commonDeadline
  const effMessage =
    override && override.initial_message_html != null
      ? override.initial_message_html
      : commonMessage
  const effAccessType: 'all' | 'roles' =
    override && override.access_type != null ? override.access_type : commonAccessType
  const effAccessRoles =
    override && override.access_type != null ? override.access_roles ?? [] : commonAccessRoles
  const effAssignees =
    override && override.assignees_overridden ? override.override_assignee_ids : commonAssigneeIds

  const [accessType, setAccessType] = useState<'all' | 'roles'>(effAccessType)
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(effAccessRoles))
  const [statusId, setStatusId] = useState<string | null>(template?.default_status_id ?? null)
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(
    template?.default_project_id ?? null,
  )
  const [defaultDescription, setDefaultDescription] = useState(template?.default_description ?? '')
  const [onCompleteStatusId, setOnCompleteStatusId] = useState<string | null>(
    template?.on_complete_set_project_status_id ?? null,
  )
  const [deadlineDays, setDeadlineDays] = useState<string>(
    effDeadline != null ? String(effDeadline) : '',
  )
  // Флаг «назначить создателя» показывается псевдо-исполнителем в списке.
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(() => {
    const init = new Set(effAssignees)
    if (template?.assign_to_creator) init.add(CREATOR_ASSIGNEE_ID)
    return init
  })
  const [emailSubject, setEmailSubject] = useState(template?.email_subject_template ?? '')
  const [initialMessageHtml, setInitialMessageHtml] = useState(effMessage)

  // Флаги «поле переопределено индивидуально для этого типа проекта».
  const [deadlineOverridden, setDeadlineOverridden] = useState(
    !!override && override.deadline_days != null,
  )
  const [messageOverridden, setMessageOverridden] = useState(
    !!override && override.initial_message_html != null,
  )
  const [accessOverridden, setAccessOverridden] = useState(
    !!override && override.access_type != null,
  )
  const [assigneesOverridden, setAssigneesOverridden] = useState(
    !!override && override.assignees_overridden,
  )

  const toggleDeadlineOverride = useCallback(
    (next: boolean) => {
      setDeadlineOverridden(next)
      if (!next) setDeadlineDays(commonDeadline != null ? String(commonDeadline) : '')
    },
    [commonDeadline],
  )
  const toggleMessageOverride = useCallback(
    (next: boolean) => {
      setMessageOverridden(next)
      if (!next) setInitialMessageHtml(commonMessage)
    },
    [commonMessage],
  )
  const toggleAccessOverride = useCallback(
    (next: boolean) => {
      setAccessOverridden(next)
      if (!next) {
        setAccessType(commonAccessType)
        setSelectedRoles(new Set(commonAccessRoles))
      }
    },
    [commonAccessType, commonAccessRoles],
  )
  const toggleAssigneesOverride = useCallback(
    (next: boolean) => {
      setAssigneesOverridden(next)
      if (!next) setAssigneeIds(new Set(commonAssigneeIds))
    },
    [commonAssigneeIds],
  )

  // Зеркалирование: «Название треда» повторяет «Название шаблона», а «Тема
  // письма» — «Название треда», пока пользователь не изменит их вручную. После
  // ручной правки соответствующий touched-флаг отключает авто-подстановку.
  // Для уже сохранённого шаблона с заполненными полями считаем их «тронутыми»,
  // чтобы не перетирать.
  const [threadNameTouched, setThreadNameTouched] = useState(
    Boolean(template?.thread_name_template),
  )
  const [subjectTouched, setSubjectTouched] = useState(
    Boolean(template?.email_subject_template),
  )

  const handleSetTemplateName = useCallback(
    (v: string) => {
      setTemplateName(v)
      if (!threadNameTouched) {
        setThreadNameTemplate(v)
        if (!subjectTouched) setEmailSubject(v)
      }
    },
    [threadNameTouched, subjectTouched],
  )

  const handleSetThreadNameTemplate = useCallback(
    (v: string) => {
      setThreadNameTouched(true)
      setThreadNameTemplate(v)
      if (!subjectTouched) setEmailSubject(v)
    },
    [subjectTouched],
  )

  const handleSetEmailSubject = useCallback((v: string) => {
    setSubjectTouched(true)
    setEmailSubject(v)
  }, [])

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
    const validDays = days != null && !isNaN(days) ? days : null
    // Пер-проектный payload: для каждого поля — либо индивидуальное значение,
    // либо null (наследовать общий шаблон).
    const projectOverride: ThreadTemplateProjectOverride | undefined = isProjectMode
      ? {
          deadline_days: deadlineOverridden ? validDays : null,
          initial_message_html: messageOverridden ? initialMessageHtml.trim() || '' : null,
          access_type: accessOverridden ? accessType : null,
          access_roles: accessOverridden
            ? accessType === 'roles'
              ? Array.from(selectedRoles)
              : []
            : null,
          assignees_overridden: assigneesOverridden,
          override_assignee_ids: assigneesOverridden
            ? Array.from(assigneeIds).filter((id) => id !== CREATOR_ASSIGNEE_ID)
            : [],
        }
      : undefined
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
      // Статус и дедлайн — для всех типов треда (задача/чат/email), унифицировано.
      default_status_id: statusId,
      default_project_id: defaultProjectId,
      default_description: defaultDescription.trim() || null,
      deadline_days: days != null && !isNaN(days) ? days : null,
      on_complete_set_project_status_id: isTask ? onCompleteStatusId : null,
      // Исполнители — для всех типов треда (задача/чат/email) одинаково.
      // «Создатель задачи» — не участник, а флаг: в таблицу исполнителей
      // (FK на participants) его не записать.
      assign_to_creator: assigneeIds.has(CREATOR_ASSIGNEE_ID),
      assignee_ids: Array.from(assigneeIds).filter((id) => id !== CREATOR_ASSIGNEE_ID),
      default_contact_email: isEmail ? enrichedEmails.map((e) => e.email).join(', ') : '',
      email_subject_template: isEmail ? emailSubject.trim() : '',
      initial_message_html: initialMessageHtml.trim() || '',
      projectOverride,
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
    defaultProjectId,
    defaultDescription,
    onCompleteStatusId,
    deadlineDays,
    assigneeIds,
    enrichedEmails,
    emailSubject,
    initialMessageHtml,
    isProjectMode,
    deadlineOverridden,
    messageOverridden,
    accessOverridden,
    assigneesOverridden,
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
    setTemplateName: handleSetTemplateName,
    description,
    setDescription,
    tabMode,
    threadNameTemplate,
    setThreadNameTemplate: handleSetThreadNameTemplate,
    accentColor,
    setAccentColor,
    icon,
    setIcon,
    accessType,
    setAccessType,
    selectedRoles,
    statusId,
    setStatusId,
    defaultProjectId,
    setDefaultProjectId,
    defaultDescription,
    setDefaultDescription,
    onCompleteStatusId,
    setOnCompleteStatusId,
    deadlineDays,
    setDeadlineDays,
    assigneeIds,
    emailSubject,
    setEmailSubject: handleSetEmailSubject,
    initialMessageHtml,
    setInitialMessageHtml,
    // derived
    isTask,
    isEmail,
    canSave,
    // project-override mode
    isProjectMode,
    deadlineOverridden,
    messageOverridden,
    accessOverridden,
    assigneesOverridden,
    toggleDeadlineOverride,
    toggleMessageOverride,
    toggleAccessOverride,
    toggleAssigneesOverride,
    // actions
    handleTabChange,
    handleSave,
    toggleAssignee,
    toggleRole,
  }
}
