/**
 * Handler сохранения формы диалога настроек чата. Вынесено из
 * useChatSettingsActions.ts (аудит 2026-04-11, Зона 6).
 *
 * Логика разбита на три ветки:
 *   1. isEditMode → onUpdate с базовыми полями
 *   2. threadType === 'task' → onCreate с task-полями
 *   3. иначе → onCreate с chat/email-полями
 */

import { useCallback, type RefObject } from 'react'
import { formatDateToString } from '@/utils/format/dateFormat'
import type { ChatSettingsResult } from '../chatSettingsTypes'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { ComposeFieldHandle } from '../ComposeField'
import type { useChatSettingsFormState } from './useChatSettingsFormState'

type FormReturn = ReturnType<typeof useChatSettingsFormState>

interface UseChatSettingsSaveParams {
  form: FormReturn
  composeRef: RefObject<ComposeFieldHandle | null>
  appliedTemplateId: string | null
  onCreate?: (result: ChatSettingsResult) => void
  onUpdate?: (params: {
    name: string
    accent_color: ThreadAccentColor
    icon: string
    type?: string
  }) => void
}

export function useChatSettingsSave({
  form,
  composeRef,
  appliedTemplateId,
  onCreate,
  onUpdate,
}: UseChatSettingsSaveParams) {
  return useCallback(() => {
    if (form.isEditMode) {
      if (!form.name.trim()) return
      onUpdate?.({
        name: form.name.trim(),
        accent_color: form.accentColor,
        icon: form.icon,
        type: form.threadType,
      })
      return
    }

    if (form.threadType === 'task') {
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
        channelType: 'none',
        memberIds: form.accessType === 'custom' ? Array.from(form.selectedMemberIds) : undefined,
        accessRoles: form.accessType === 'roles' ? Array.from(form.selectedRoles) : undefined,
        deadline: form.taskDeadline ? formatDateToString(form.taskDeadline) : null,
        statusId: form.taskStatusId,
        assigneeIds: Array.from(form.taskAssignees),
        projectId: form.selectedProjectId,
        initialMessage,
        sourceTemplateId: appliedTemplateId,
      })
      return
    }

    // Обычный чат или email
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
      sourceTemplateId: appliedTemplateId,
    })
  }, [form, composeRef, onCreate, onUpdate, appliedTemplateId])
}
