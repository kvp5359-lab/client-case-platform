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
    deadline?: string | null
    start_at?: string | null
    end_at?: string | null
  }) => void
}

/**
 * Собирает start_at/end_at в ISO из date + HH:mm. Возвращает null если
 * data отсутствует или time невалиден.
 */
function buildIsoFromDateAndTime(date: Date | undefined, time: string): string | null {
  if (!date) return null
  const [hh, mm] = time.split(':').map((s) => Number.parseInt(s, 10))
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  const d = new Date(date)
  d.setHours(hh, mm, 0, 0)
  return d.toISOString()
}

export function useChatSettingsSave({
  form,
  composeRef,
  appliedTemplateId,
  onCreate,
  onUpdate,
}: UseChatSettingsSaveParams) {
  return useCallback(() => {
    // Срок: режим определяется чекбоксом «Указать длительность».
    //   showDuration=false → только deadline без слота в календаре
    //   showDuration=true + оба времени пустые + одна дата → deadline
    //   showDuration=true + оба времени пустые + диапазон дат →
    //     start_at=date 00:00, end_at=endDate 23:59 (отпуск 16-18)
    //   showDuration=true + время заполнено →
    //     start_at = startDate+startTime, end_at = (endDate??startDate)+endTime
    // Триггер БД sync_thread_deadline_end_at автоматически синхронизирует
    // deadline = end_at когда задан интервал.
    let startAtIso: string | null = null
    let endAtIso: string | null = null
    let deadlineIso: string | null = null

    if (!form.taskShowDuration) {
      // Простой режим: только deadline
      deadlineIso = form.taskDeadline ? formatDateToString(form.taskDeadline) : null
    } else {
      const hasTime = Boolean(form.taskStartTime && form.taskEndTime)
      if (!hasTime) {
        if (form.taskEndDate && form.taskDeadline) {
          startAtIso = buildIsoFromDateAndTime(form.taskDeadline, '00:00')
          endAtIso = buildIsoFromDateAndTime(form.taskEndDate, '23:59')
          deadlineIso = endAtIso
        } else {
          deadlineIso = form.taskDeadline ? formatDateToString(form.taskDeadline) : null
        }
      } else {
        startAtIso = buildIsoFromDateAndTime(form.taskDeadline, form.taskStartTime)
        endAtIso = buildIsoFromDateAndTime(
          form.taskEndDate ?? form.taskDeadline,
          form.taskEndTime,
        )
        deadlineIso = endAtIso
      }
    }

    if (form.isEditMode) {
      if (!form.name.trim()) return
      onUpdate?.({
        name: form.name.trim(),
        accent_color: form.accentColor,
        icon: form.icon,
        type: form.threadType,
        deadline: deadlineIso,
        start_at: startAtIso,
        end_at: endAtIso,
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
        deadline: deadlineIso,
        startAt: startAtIso,
        endAt: endAtIso,
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
