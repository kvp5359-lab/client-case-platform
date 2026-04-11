/**
 * Применение шаблона треда к форме диалога настроек чата.
 * Вынесено из useChatSettingsActions.ts (аудит 2026-04-11, Зона 6).
 *
 * Хук возвращает `handleApplyTemplate` и сам отслеживает auto-apply
 * `initialTemplate` при первом открытии диалога.
 */

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { applyTemplate } from '@/hooks/messenger/useThreadTemplates'
import type { ThreadTemplate } from '@/types/threadTemplate'
import type { ComposeFieldHandle } from '../ComposeField'
import type { useChatSettingsFormState } from './useChatSettingsFormState'

type FormReturn = ReturnType<typeof useChatSettingsFormState>

/**
 * Минимальный набор полей участника, который нужен шаблонному applyTemplate.
 * Совместим и с `Participant` (project-level), и с `WorkspaceParticipant`
 * (workspace-level) — у обоих есть эти 4 поля.
 */
interface TemplateParticipant {
  id: string
  name: string
  last_name: string | null
  user_id?: string | null
}

interface TaskStatusLike {
  id: string
}

interface EmailSuggestionLike {
  email: string
  label: string
}

interface WorkspaceProjectLike {
  id: string
  name: string
}

interface UseChatSettingsTemplateApplyParams {
  open: boolean
  form: FormReturn
  composeRef: RefObject<ComposeFieldHandle | null>
  initialTemplate?: ThreadTemplate | null
  workspaceProjects: WorkspaceProjectLike[]
  selectedProjectParticipants: TemplateParticipant[]
  workspaceParticipants: TemplateParticipant[]
  effectiveParticipants: TemplateParticipant[]
  taskStatuses: TaskStatusLike[]
  emailSuggestions: EmailSuggestionLike[]
}

export function useChatSettingsTemplateApply({
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
}: UseChatSettingsTemplateApplyParams) {
  // appliedTemplateId прокидывается в ChatSettingsResult.sourceTemplateId на
  // submit — так свежесозданный тред запоминает, из какого шаблона он родом.
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null)

  const handleApplyTemplate = useCallback(
    (template: ThreadTemplate) => {
      const projectName =
        workspaceProjects.find((p) => p.id === form.selectedProjectId)?.name ?? ''
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
              const match = emailSuggestions.find(
                (s) => s.email.toLowerCase() === e.toLowerCase(),
              )
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
      setAppliedTemplateId(template.id)
    },
    [
      workspaceProjects,
      form,
      effectiveParticipants,
      selectedProjectParticipants,
      workspaceParticipants,
      taskStatuses,
      emailSuggestions,
      composeRef,
    ],
  )

  // Auto-apply initial template при открытии
  useEffect(() => {
    if (open && !form.isEditMode && initialTemplate && initialTemplate.id !== appliedTemplateId) {
      handleApplyTemplate(initialTemplate)
    }
    if (!open) setAppliedTemplateId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTemplate])

  return { appliedTemplateId, handleApplyTemplate }
}
